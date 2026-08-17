import {
  hasOnlyAllowedUserQuestions,
  isSupportQuestion,
  SUPPORT_QUESTIONS,
} from "./supportQuestions.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("all fixed support questions are accepted", () => {
  assert(SUPPORT_QUESTIONS.length === 6, "expected six support questions");
  for (const question of SUPPORT_QUESTIONS) {
    assert(
      isSupportQuestion(question),
      `rejected approved question: ${question}`,
    );
  }
});

Deno.test("arbitrary and PII-like user text is rejected exactly", () => {
  const rejected = [
    "My name is Jane Doe.",
    "My health card number is 1234-567-890.",
    "My address is 123 Main Street.",
    `${SUPPORT_QUESTIONS[0]} `,
    SUPPORT_QUESTIONS[0].toLowerCase(),
    "",
    null,
  ];

  for (const value of rejected) {
    assert(
      !isSupportQuestion(value),
      `accepted unsafe value: ${String(value)}`,
    );
  }
});

Deno.test("transcript validation ignores server prose but rejects any unsafe user turn", () => {
  assert(
    hasOnlyAllowedUserQuestions([
      { sender: "user", body: SUPPORT_QUESTIONS[0] },
      { sender: "ai", body: "General guidance." },
      { sender: "admin", body: "A human response." },
      { sender: "user", body: SUPPORT_QUESTIONS[5] },
    ]),
    "safe transcript was rejected",
  );

  assert(
    !hasOnlyAllowedUserQuestions([
      { sender: "user", body: SUPPORT_QUESTIONS[0] },
      { sender: "ai", body: "General guidance." },
      { sender: "user", body: "My licence number is A12345." },
    ]),
    "unsafe user turn was accepted",
  );
});
