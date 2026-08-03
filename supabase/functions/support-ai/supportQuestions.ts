/**
 * The only user-authored support questions that may be sent to Gemini.
 *
 * The database enforces the same exact strings for authenticated inserts, and
 * this helper fails closed on legacy/service-written transcripts. Keep the
 * marked block byte-identical to mobile/lib/supportQuestions.ts; CI verifies
 * the match.
 */

// SUPPORT_QUESTIONS_START
export const SUPPORT_QUESTIONS = [
  "What should I do first for my move?",
  "Which tasks are mandatory for my move?",
  "What deadlines should I know about?",
  "Which documents should I prepare?",
  "What vehicle-related tasks apply to me?",
  "How do I update my health coverage?",
] as const;
// SUPPORT_QUESTIONS_END

export type SupportQuestion = (typeof SUPPORT_QUESTIONS)[number];

const SUPPORT_QUESTION_SET = new Set<string>(SUPPORT_QUESTIONS);

export function isSupportQuestion(value: unknown): value is SupportQuestion {
  return typeof value === "string" && SUPPORT_QUESTION_SET.has(value);
}

export interface SupportTranscriptMessage {
  sender: string;
  body: unknown;
}

/** Admin/AI prose is server-authored; every user turn must be an exact match. */
export function hasOnlyAllowedUserQuestions(
  messages: readonly SupportTranscriptMessage[],
): boolean {
  return messages.every(
    (message) => message.sender !== "user" || isSupportQuestion(message.body),
  );
}
