import { describeDeadline } from "./grounding.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("zero-day deadlines are due on the move date", () => {
  assertEquals(describeDeadline(0), "due on the move date");
});

Deno.test("null deadlines have no fixed deadline", () => {
  assertEquals(describeDeadline(null), "no fixed deadline");
});

Deno.test("positive deadlines retain the configured day count", () => {
  assertEquals(describeDeadline(30), "due within 30 days of the move");
});
