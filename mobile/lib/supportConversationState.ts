import type { SupportMessage, SupportThread } from "@/types/database";

export type ChatMessage = Pick<
  SupportMessage, "id" | "thread_id" | "sender" | "body" | "created_at"
> & { pending?: boolean };

export type ConversationSnapshot = {
  userId: string | null;
  thread: SupportThread | null;
  messages: ChatMessage[];
};

export type ConversationState = ConversationSnapshot & {
  revision: number;
  needsRefresh: boolean;
};

export const initialConversationState: ConversationState = {
  userId: null, thread: null, messages: [], revision: 0, needsRefresh: false,
};

/** Initial loads, retries and reconnect reads share one ordering boundary. */
export function createSnapshotSequence() {
  let latest = 0;
  return {
    begin: () => ++latest,
    isCurrent: (sequence: number) => sequence === latest,
  };
}

type ConversationAction =
  | { type: "message"; message: ChatMessage }
  | { type: "thread"; thread: SupportThread }
  | { type: "refresh-required" }
  | { type: "snapshot"; snapshot: ConversationSnapshot; revision: number; recover: boolean };

/** Merge both reads and Realtime without duplicating confirmed/optimistic rows. */
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const row of incoming) {
    if (!row.pending && row.sender === "user") {
      for (const [id, message] of merged) {
        if (message.pending && message.thread_id === row.thread_id && message.body === row.body) {
          merged.delete(id);
        }
      }
    }
    merged.set(row.id, row);
  }
  return [...merged.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function supportConversationReducer(
  state: ConversationState, action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case "message":
      return { ...state, messages: mergeMessages(state.messages, [action.message]) };
    case "thread":
      return { ...state, thread: action.thread, revision: state.revision + 1 };
    case "refresh-required":
      // A lost response says nothing about whether the server committed.
      return { ...state, needsRefresh: true };
    case "snapshot": {
      const thread = action.revision === state.revision ? action.snapshot.thread : state.thread;
      const incoming = action.snapshot.messages.filter((m) => m.thread_id === thread?.id);
      const retained = state.messages.filter((m) =>
        m.thread_id === thread?.id && (!action.recover || !m.pending));
      return {
        ...state,
        userId: action.snapshot.userId,
        thread,
        messages: mergeMessages(retained, incoming),
        needsRefresh: action.recover ? false : state.needsRefresh,
      };
    }
  }
}
