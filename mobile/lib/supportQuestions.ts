/**
 * The only support questions the mobile client may send.
 *
 * This fixed vocabulary is a privacy boundary: users cannot type names,
 * addresses, document numbers, or other PII into the server-backed support
 * transcript. Keep the marked block byte-identical to
 * supabase/functions/support-ai/supportQuestions.ts; CI verifies the match.
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
