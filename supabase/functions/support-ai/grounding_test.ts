import {
  describeDeadline,
  formatOfficialSources,
  normalizeSupportReply,
} from "./grounding.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
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

Deno.test("support replies are trimmed and capped without splitting Unicode", () => {
  assertEquals(normalizeSupportReply("  Ready to help.  "), "Ready to help.");
  assertEquals(normalizeSupportReply("abc😀def", 5), "abc😀…");
});

Deno.test("official sources preserve resolver order and safely format metadata", () => {
  assertEquals(
    formatOfficialSources([
      {
        agency_name: "  Service\nOntario  ",
        official_url: "https://www.ontario.ca/page/change-address",
        last_verified: "2026-07-30T12:34:56+00:00",
      },
      {
        agency_name: "Government of Canada",
        official_url: "https://www.canada.ca/address",
        last_verified: null,
      },
    ]),
    [
      "Service Ontario: https://www.ontario.ca/page/change-address (verified 2026-07-30)",
      "Government of Canada: https://www.canada.ca/address",
    ],
  );
});

Deno.test("official sources reject unsafe URLs and malformed JSON entries", () => {
  assertEquals(
    formatOfficialSources([
      null,
      "not-an-object",
      { agency_name: "HTTP", official_url: "http://example.ca" },
      { agency_name: "Credentials", official_url: "https://user@example.ca" },
      { agency_name: "Control", official_url: "https://example.ca/\nattack" },
      { agency_name: 123, official_url: "https://example.ca/valid" },
    ]),
    ["Official source: https://example.ca/valid"],
  );
});
