/**
 * Local legal-policy version stored with the user's checklist route.
 *
 * A policy release increments this value so existing local journeys must be
 * reviewed again. Keep the public policy page and migration contract in sync.
 */
// CURRENT_CONSENT_VERSION_START
export const CURRENT_CONSENT_VERSION = "1.2";
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
