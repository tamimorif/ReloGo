import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  corridorRulesQueryKey,
  fetchCorridorRules,
  fetchTaskProgress,
  prefetchChecklistQueries,
  taskProgressQueryKey,
  taskProgressQueryOptions,
} from "../../lib/checklistQueries";
import { supabase } from "../../lib/supabase";

jest.mock("../../lib/supabase", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

const mockRpc = supabase.rpc as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

function rpcResult(data: unknown, error: unknown = null) {
  const abortSignal = jest.fn().mockResolvedValue({ data, error });
  mockRpc.mockReturnValue({ abortSignal });
  return abortSignal;
}

function progressResult(data: unknown, error: unknown = null) {
  const abortSignal = jest.fn().mockResolvedValue({ data, error });
  const eq = jest.fn().mockReturnValue({ abortSignal });
  const select = jest.fn().mockReturnValue({ eq });
  mockFrom.mockReturnValue({ select });
  return { select, eq, abortSignal };
}

describe("checklist startup queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("isolates cache entries by corridor and user", () => {
    expect(corridorRulesQueryKey("ON", "BC")).toEqual([
      "corridorRules",
      "ON",
      "BC",
    ]);
    expect(corridorRulesQueryKey("BC", "ON")).not.toEqual(
      corridorRulesQueryKey("ON", "BC"),
    );
    expect(taskProgressQueryKey("user-a")).toEqual([
      "taskProgress",
      "user-a",
    ]);
    expect(taskProgressQueryKey("user-b")).not.toEqual(
      taskProgressQueryKey("user-a"),
    );
  });

  it("calls the canonical resolver with the exact corridor", async () => {
    const abortSignal = rpcResult([]);

    await expect(fetchCorridorRules("ON", "BC")).resolves.toEqual([]);

    expect(mockRpc).toHaveBeenCalledWith("resolve_corridor_rules", {
      p_origin_province: "ON",
      p_dest_province: "BC",
    });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("loads only progress when the confirmed profile has no corridor", async () => {
    progressResult([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await prefetchChecklistQueries(queryClient, {
      userId: "user-a",
      origin: null,
      destination: null,
    });

    expect(mockFrom).toHaveBeenCalledWith("user_task_progress");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("starts rules and progress together after consent", async () => {
    let finishRules!: () => void;
    let finishProgress!: () => void;
    const rulesPromise = new Promise<{ data: []; error: null }>((resolve) => {
      finishRules = () => resolve({ data: [], error: null });
    });
    const progressPromise = new Promise<{ data: []; error: null }>((resolve) => {
      finishProgress = () => resolve({ data: [], error: null });
    });
    mockRpc.mockReturnValue({
      abortSignal: jest.fn().mockReturnValue(rulesPromise),
    });
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          abortSignal: jest.fn().mockReturnValue(progressPromise),
        }),
      }),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const prefetch = prefetchChecklistQueries(queryClient, {
      userId: "user-a",
      origin: "ON",
      destination: "BC",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(1);

    finishRules();
    finishProgress();
    await prefetch;
  });

  it("deduplicates the checklist screen against an in-flight prefetch", async () => {
    let finishProgress!: () => void;
    const progressPromise = new Promise<{ data: []; error: null }>((resolve) => {
      finishProgress = () => resolve({ data: [], error: null });
    });
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          abortSignal: jest.fn().mockReturnValue(progressPromise),
        }),
      }),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const prefetch = prefetchChecklistQueries(queryClient, {
      userId: "user-a",
      origin: null,
      destination: null,
    });
    const screenFetch = queryClient.fetchQuery(
      taskProgressQueryOptions("user-a"),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFrom).toHaveBeenCalledTimes(1);

    finishProgress();
    await expect(Promise.all([prefetch, screenFetch])).resolves.toEqual([
      undefined,
      [],
    ]);
  });

  it("does not repeat a failed startup prefetch when the screen mounts", async () => {
    const serverError = new Error("offline");
    progressResult(null, serverError);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await prefetchChecklistQueries(queryClient, {
      userId: "user-a",
      origin: null,
      destination: null,
    });
    expect(mockFrom).toHaveBeenCalledTimes(1);

    const observer = new QueryObserver(
      queryClient,
      taskProgressQueryOptions("user-a"),
    );
    const unsubscribe = observer.subscribe(() => undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFrom).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("surfaces server failures to React Query and normalizes empty rows", async () => {
    const serverError = new Error("unavailable");
    progressResult(null, serverError);
    await expect(fetchTaskProgress("user-a")).rejects.toBe(serverError);

    progressResult(null, null);
    await expect(fetchTaskProgress("user-a")).resolves.toEqual([]);
  });
});
