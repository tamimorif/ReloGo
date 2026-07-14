// Public, non-secret contact configuration. An absent/invalid value renders an
// honest preview notice instead of publishing a mailbox that nobody monitors.
const configuredSupportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

export const SUPPORT_EMAIL =
  configuredSupportEmail &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredSupportEmail)
    ? configuredSupportEmail
    : null;
