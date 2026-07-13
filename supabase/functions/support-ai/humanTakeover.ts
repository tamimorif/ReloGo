export interface SupportThreadAiState {
  status: unknown;
  human_takeover_at?: unknown;
}

/**
 * AI is eligible only with positive proof that the thread is currently AI-owned
 * and has never entered HUMAN. Missing or malformed marker data fails closed.
 */
export function isAiEligibleThread(thread: SupportThreadAiState): boolean {
  return thread.status === "AI" && thread.human_takeover_at === null;
}
