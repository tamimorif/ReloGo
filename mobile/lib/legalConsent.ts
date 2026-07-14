/**
 * Legal-policy contract shared by onboarding, session routing, and re-consent.
 *
 * A policy release must change this version together with the backend
 * `accept_current_policies()` implementation. Exact equality is intentional:
 * unknown, malformed, older, and unexpectedly newer records all fail closed.
 */
// CURRENT_CONSENT_VERSION_START
export const CURRENT_CONSENT_VERSION = "1.1";
// CURRENT_CONSENT_VERSION_END

const LEGAL_SITE_URL = (
  process.env.EXPO_PUBLIC_LEGAL_SITE_URL ?? "https://relogo-two.vercel.app"
).replace(/\/+$/, "");

export const PRIVACY_POLICY_URL = `${LEGAL_SITE_URL}/privacy`;
export const TERMS_OF_SERVICE_URL = `${LEGAL_SITE_URL}/terms`;

export function hasCurrentPolicyConsent(
  acceptedVersion: unknown,
  currentVersion: string = CURRENT_CONSENT_VERSION,
): boolean {
  return (
    typeof acceptedVersion === "string" &&
    currentVersion.length > 0 &&
    acceptedVersion === currentVersion
  );
}
