import { isAiEligibleThread } from "./humanTakeover.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("AI status with an explicit null takeover marker is eligible", () => {
  assert(
    isAiEligibleThread({ status: "AI", human_takeover_at: null }),
    "fresh AI thread was rejected",
  );
});

Deno.test("a recorded human takeover permanently disqualifies AI", () => {
  assert(
    !isAiEligibleThread({
      status: "AI",
      human_takeover_at: "2026-07-13T12:00:00.000Z",
    }),
    "recorded takeover was accepted",
  );
});

Deno.test("non-AI or missing/malformed marker state fails closed", () => {
  const rejected = [
    { status: "HUMAN", human_takeover_at: null },
    { status: "AWAITING_HUMAN", human_takeover_at: null },
    { status: "RESOLVED", human_takeover_at: null },
    { status: "AI" },
    { status: "AI", human_takeover_at: undefined },
    { status: "AI", human_takeover_at: false },
  ];

  for (const thread of rejected) {
    assert(!isAiEligibleThread(thread), `accepted unsafe state: ${JSON.stringify(thread)}`);
  }
});
