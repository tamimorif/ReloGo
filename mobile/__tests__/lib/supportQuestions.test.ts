import {
  SUPPORT_QUESTIONS,
  isSupportQuestion,
} from "@/lib/supportQuestions";

describe("support question privacy boundary", () => {
  it("exposes only the six approved general questions", () => {
    expect(SUPPORT_QUESTIONS).toHaveLength(6);
    expect(new Set(SUPPORT_QUESTIONS).size).toBe(SUPPORT_QUESTIONS.length);
  });

  it.each(SUPPORT_QUESTIONS)("accepts the approved question: %s", (question) => {
    expect(isSupportQuestion(question)).toBe(true);
  });

  it.each([
    "My health card number is 1234-567-890.",
    "What deadlines should I know about? ",
    "what deadlines should i know about?",
    "",
    null,
  ])("rejects non-allowlisted input: %p", (value) => {
    expect(isSupportQuestion(value)).toBe(false);
  });
});
