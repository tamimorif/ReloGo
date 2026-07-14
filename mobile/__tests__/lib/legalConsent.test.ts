import {
  CURRENT_CONSENT_VERSION,
  hasCurrentPolicyConsent,
} from "../../lib/legalConsent";

describe("legal consent version gate", () => {
  it("accepts only the exact current version", () => {
    expect(hasCurrentPolicyConsent(CURRENT_CONSENT_VERSION)).toBe(true);
  });

  it.each([undefined, null, "", " 1.0", "1.0 ", "v1.0", 1])(
    "fails closed for malformed or missing value %p",
    (value) => {
      expect(hasCurrentPolicyConsent(value)).toBe(false);
    },
  );

  it("requires re-consent when a future policy version becomes current", () => {
    expect(hasCurrentPolicyConsent("1.0", "2.0")).toBe(false);
    expect(hasCurrentPolicyConsent("2.0", "2.0")).toBe(true);
  });

  it("fails closed for an unexpectedly newer stored version", () => {
    expect(hasCurrentPolicyConsent("2.0", "1.0")).toBe(false);
  });

  it("fails closed if the configured current version is empty", () => {
    expect(hasCurrentPolicyConsent("", "")).toBe(false);
  });
});
