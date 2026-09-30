import { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { profileQueryOptions, PROFILE_REQUEST_TIMEOUT_MS } from "@/lib/profileQueries";
import { acceptCurrentPolicies, POLICY_ACCEPTANCE_TIMEOUT_MS } from "@/lib/policyAcceptance";
import {
  createSupportThread, insertSupportQuestion, loadSupportConversation,
  requestSupportReply, updateSupportStatus, reconcileSupportConversation,
  SUPPORT_AI_TIMEOUT_MS, SUPPORT_REQUEST_TIMEOUT_MS,
} from "@/lib/supportConversation";
import { SUPPORT_QUESTIONS } from "@/lib/supportQuestions";

jest.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getUser: jest.fn() }, rpc: jest.fn(), from: jest.fn(),
  functions: { invoke: jest.fn() },
} }));
const getUser = supabase.auth.getUser as jest.Mock;
const from = supabase.from as jest.Mock;
const rpc = supabase.rpc as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// A thenable with the PostgREST chain shape: aborts are deliberately ignored
// so the client-side deadline must settle even when the transport does not.
function query(result: PromiseLike<unknown>) {
  const chain: Record<string, jest.Mock> = {};
  for (const name of ["select", "eq", "order", "limit", "insert", "update", "single", "abortSignal"]) {
    chain[name] = jest.fn(() => chain);
  }
  chain.then = jest.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject));
  return chain;
}

describe("bounded mobile requests", () => {
  beforeEach(() => { jest.resetAllMocks(); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it("bounds stalled auth and never starts database work after auth resolves late", async () => {
    const auth = deferred<unknown>();
    getUser.mockReturnValue(auth.promise);
    const result = loadSupportConversation();
    const rejection = expect(result).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(SUPPORT_REQUEST_TIMEOUT_MS);
    await rejection;
    auth.resolve({ data: { user: { id: "user-a" } }, error: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("uses one deadline across auth, thread and message loading", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
    const threads = deferred<unknown>();
    const messages = deferred<unknown>();
    const threadQuery = query(threads.promise);
    const messageQuery = query(messages.promise);
    from.mockReturnValueOnce(threadQuery).mockReturnValueOnce(messageQuery);
    const result = loadSupportConversation();
    const rejection = expect(result).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(6_000);
    threads.resolve({ data: [{ id: "thread-a" }], error: null });
    await jest.advanceTimersByTimeAsync(4_000);
    await rejection;
    expect(messageQuery.abortSignal.mock.calls[0][0].aborted).toBe(true);
    messages.resolve({ data: [{ id: "late" }], error: null });
    await jest.advanceTimersByTimeAsync(0);
    await expect(result).rejects.toThrow("timed out");
  });

  it("does not confirm or accept a late re-consent response", async () => {
    const acceptance = deferred<unknown>();
    const chain = query(acceptance.promise);
    rpc.mockReturnValue(chain);
    const result = acceptCurrentPolicies();
    const rejection = expect(result).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(POLICY_ACCEPTANCE_TIMEOUT_MS);
    await rejection;
    expect(chain.abortSignal.mock.calls[0][0].aborted).toBe(true);
    acceptance.resolve({ data: "1.1", error: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("bounds confirmation and refuses mismatched server policy versions", async () => {
    rpc.mockReturnValueOnce(query(Promise.resolve({ data: "1.1", error: null })))
      .mockReturnValueOnce(query(new Promise(() => undefined)));
    const result = acceptCurrentPolicies();
    const rejection = expect(result).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(POLICY_ACCEPTANCE_TIMEOUT_MS);
    await rejection;
    rpc.mockReturnValueOnce(query(Promise.resolve({ data: "1.1", error: null })))
      .mockReturnValueOnce(query(Promise.resolve({ data: {
        profile: { id: "user-a" }, has_current_consent: true,
        current_version: "1.2", accepted_version: "1.2",
      }, error: null })));
    await expect(acceptCurrentPolicies()).rejects.toThrow("not confirmed");
  });

  it("returns only the authoritative confirmed profile", async () => {
    const profile = { id: "user-a" };
    rpc.mockReturnValueOnce(query(Promise.resolve({ data: "1.1", error: null })))
      .mockReturnValueOnce(query(Promise.resolve({ data: {
        profile, has_current_consent: true, current_version: "1.1", accepted_version: "1.1",
      }, error: null })));
    await expect(acceptCurrentPolicies()).resolves.toEqual(profile);
  });

  it.each([
    ["thread creation", () => createSupportThread("user-a", "AI")],
    ["thread reopening", () => updateSupportStatus("thread-a", "AI")],
    ["human escalation", () => updateSupportStatus("thread-a", "AWAITING_HUMAN")],
    ["question insertion", () => insertSupportQuestion("thread-a", SUPPORT_QUESTIONS[0])],
  ] as const)("bounds %s and ignores late transport completion", async (_label, operation) => {
    const pending = deferred<unknown>();
    const chain = query(pending.promise);
    from.mockReturnValue(chain);
    const result = operation();
    const rejection = expect(result).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(SUPPORT_REQUEST_TIMEOUT_MS);
    await rejection;
    expect(chain.abortSignal.mock.calls[0][0].aborted).toBe(true);
    pending.resolve({ data: { id: "late" }, error: null });
    await jest.advanceTimersByTimeAsync(0);
    await expect(result).rejects.toThrow("timed out");
  });

  it("aborts stalled AI invocation with only thread_id in the body", async () => {
    invoke.mockReturnValue(new Promise(() => undefined));
    const result = requestSupportReply("thread-a");
    const rejection = expect(result).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(SUPPORT_AI_TIMEOUT_MS);
    await rejection;
    expect(invoke).toHaveBeenCalledWith("support-ai", {
      body: { thread_id: "thread-a" }, signal: expect.any(AbortSignal),
    });
    expect(invoke.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("cancels an abandoned support load before late auth may query", async () => {
    const auth = deferred<unknown>();
    getUser.mockReturnValue(auth.promise);
    const scope = new AbortController();
    const result = loadSupportConversation(scope.signal);
    const rejection = expect(result).rejects.toThrow("cancelled");
    await jest.advanceTimersByTimeAsync(0);
    scope.abort();
    await rejection;
    auth.resolve({ data: { user: { id: "user-a" } }, error: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("reconciles the subscribed thread and reads messages inserted in the subscription gap", async () => {
    const thread = { id: "thread-a", user_id: "user-a", status: "HUMAN" };
    const messages = [{ id: "gap-reply", thread_id: "thread-a", sender: "admin" }];
    const threadQuery = query(Promise.resolve({ data: thread, error: null }));
    const messageQuery = query(Promise.resolve({ data: messages, error: null }));
    from.mockReturnValueOnce(threadQuery).mockReturnValueOnce(messageQuery);
    await expect(reconcileSupportConversation("thread-a")).resolves.toEqual({
      userId: "user-a", thread, messages,
    });
    expect(threadQuery.eq).toHaveBeenCalledWith("id", "thread-a");
    expect(messageQuery.eq).toHaveBeenCalledWith("thread_id", "thread-a");
  });

  it("keeps subscription reconciliation bounded when the message read stalls", async () => {
    from.mockReturnValueOnce(query(Promise.resolve({ data: { id: "thread-a", user_id: "user-a" }, error: null })))
      .mockReturnValueOnce(query(new Promise(() => undefined)));
    const result = reconcileSupportConversation("thread-a");
    const rejection = expect(result).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(SUPPORT_REQUEST_TIMEOUT_MS);
    await rejection;
  });

  it("profile reads fail within eight seconds without retrying or caching late data", async () => {
    const pending = deferred<unknown>();
    const chain = query(pending.promise);
    from.mockReturnValue(chain);
    const client = new QueryClient();
    const result = client.fetchQuery(profileQueryOptions("user-a"));
    const rejection = expect(result).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(PROFILE_REQUEST_TIMEOUT_MS);
    await rejection;
    pending.resolve({ data: { id: "user-a" }, error: null });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(from).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["profile", "user-a"])).toBeUndefined();
    expect(chain.abortSignal.mock.calls[0][0].aborted).toBe(true);
    client.clear();
  });
});
