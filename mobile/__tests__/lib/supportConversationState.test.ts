import {
  initialConversationState,
  supportConversationReducer as reduce,
  type ChatMessage,
} from "@/lib/supportConversationState";
import type { SupportThread } from "@/types/database";

const thread = {
  id: "thread-a", user_id: "user-a", status: "AI", subject: null,
  created_at: "2026-09-14T00:00:00.000Z", updated_at: "2026-09-14T00:00:00.000Z",
  last_message_at: "2026-09-14T00:00:00.000Z", human_takeover_at: null,
} as SupportThread;
const message: ChatMessage = {
  id: "message-a", thread_id: thread.id, sender: "user",
  body: "What should I do first for my move?", created_at: "2026-09-14T00:00:01.000Z",
};
const snapshot = { userId: thread.user_id, thread, messages: [message] };

it("keeps writes blocked after an ambiguous thread creation until authoritative recovery", () => {
  let state = reduce(initialConversationState, { type: "refresh-required" });
  expect(state.needsRefresh).toBe(true);
  // Realtime reconciliation is not an explicit successful recovery.
  state = reduce(state, { type: "snapshot", snapshot, revision: 0, recover: false });
  expect(state.needsRefresh).toBe(true);
  state = reduce(state, { type: "snapshot", snapshot, revision: 0, recover: true });
  expect(state.needsRefresh).toBe(false);
  expect(state.thread?.id).toBe(thread.id);
  expect(state.messages).toEqual([message]);
});

it("restores a committed question whose insert response was lost without duplicating it", () => {
  let state = reduce(initialConversationState, { type: "thread", thread });
  state = reduce(state, { type: "message", message: { ...message, id: "pending-a", pending: true } });
  state = reduce(state, { type: "refresh-required" });
  expect(state.needsRefresh).toBe(true);
  state = reduce(state, { type: "snapshot", snapshot, revision: 1, recover: true });
  state = reduce(state, { type: "message", message }); // Late Realtime duplicate.
  expect(state.messages).toEqual([message]);
  expect(state.needsRefresh).toBe(false);
});

it("removes an unconfirmed optimistic question only after recovery did not find it", () => {
  let state = reduce(initialConversationState, { type: "thread", thread });
  state = reduce(state, { type: "message", message: { ...message, id: "pending-a", pending: true } });
  state = reduce(state, { type: "refresh-required" });
  expect(state.messages).toHaveLength(1);
  state = reduce(state, {
    type: "snapshot", snapshot: { ...snapshot, messages: [] }, revision: 1, recover: true,
  });
  expect(state.messages).toEqual([]);
});

it("merges the subscription-gap reply without losing a newer Realtime message", () => {
  let state = reduce(initialConversationState, {
    type: "snapshot", snapshot, revision: 0, recover: true,
  });
  const gapReply: ChatMessage = { ...message, id: "gap-reply", sender: "admin", created_at: "2026-09-14T00:00:02.000Z" };
  const newest: ChatMessage = { ...message, id: "newest", sender: "admin", created_at: "2026-09-14T00:00:03.000Z" };
  state = reduce(state, { type: "message", message: newest });
  state = reduce(state, {
    type: "snapshot", snapshot: { ...snapshot, messages: [message, gapReply] }, revision: 0, recover: false,
  });
  expect(state.messages.map((row) => row.id)).toEqual([message.id, gapReply.id, newest.id]);
});

it("does not regress HUMAN status to an older AI snapshot after a Realtime event", () => {
  let state = reduce(initialConversationState, {
    type: "snapshot", snapshot, revision: 0, recover: true,
  });
  state = reduce(state, { type: "thread", thread: { ...thread, status: "HUMAN" } });
  state = reduce(state, { type: "snapshot", snapshot, revision: 0, recover: false });
  expect(state.thread?.status).toBe("HUMAN");
  expect(state.messages).toEqual([message]);
});

it("never retains messages from another conversation after an authoritative refresh", () => {
  let state = reduce(initialConversationState, {
    type: "snapshot", snapshot, revision: 0, recover: true,
  });
  state = reduce(state, {
    type: "snapshot", snapshot: { ...snapshot, thread: { ...thread, id: "thread-b" }, messages: [] },
    revision: 0, recover: true,
  });
  expect(state.messages).toEqual([]);
});

it("discards older reconnect success and failure after a newer snapshot starts", async () => {
  const { createSnapshotSequence } = await import("@/lib/supportConversationState");
  const gate = createSnapshotSequence();
  let state = reduce(initialConversationState, { type: "snapshot", snapshot, revision: 0, recover: true });
  const olderReconnect = gate.begin();
  const newerReconnect = gate.begin();
  // No Realtime event increments the status revision while disconnected.
  if (gate.isCurrent(newerReconnect)) {
    state = reduce(state, {
      type: "snapshot", snapshot: { ...snapshot, thread: { ...thread, status: "HUMAN" } },
      revision: 0, recover: false,
    });
  }
  if (gate.isCurrent(olderReconnect)) {
    state = reduce(state, { type: "snapshot", snapshot, revision: 0, recover: false });
    state = reduce(state, { type: "refresh-required" });
  }
  expect(state.thread?.status).toBe("HUMAN");
  expect(state.needsRefresh).toBe(false);
  // A user retry also supersedes the pending reconnect, using the same gate.
  gate.begin();
  expect(gate.isCurrent(newerReconnect)).toBe(false);
});
