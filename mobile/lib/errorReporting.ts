/**
 * Privacy-safe crash/error capture.
 *
 * ReloGo's defining rule is that the six device-only PII values (full name,
 * date of birth, street address, driver's licence number, and health-card
 * number) never leave the device — not into Supabase, an AI prompt, a log, an
 * analytics event, or an error report. A crash reporter is the classic place
 * this leaks, because raw error messages and stack traces can echo whatever
 * value a component was rendering when it threw.
 *
 * This module captures ONLY non-PII metadata by construction and never sends
 * anything off-device. `redactErrorText()` is the enforcement point and is
 * unit-tested. Wiring an external crash service (Sentry, etc.) later is a
 * deliberate, privacy-reviewed decision — see docs/DEPLOYMENT.md §8; the sink
 * below is the single seam where that integration would attach.
 */

/** Non-PII diagnostic record. Intentionally has no `props`, `state`, or user id. */
export interface SafeErrorReport {
  name: string;
  message: string;
  /** Route segment or subsystem label, never a data value. */
  context: string;
  /** ISO timestamp; captured by the reporter, never from user input. */
  at: string;
}

const MAX_MESSAGE_LENGTH = 300;

/**
 * Redact anything in free text that could carry one of the device-only PII
 * values. This is defence-in-depth: our own code never embeds PII in an error,
 * but a native/library error could echo an input we passed it, so we scrub
 * before anything is logged or stored.
 *
 * Redacted:
 *  - runs of 5+ digits (health-card, driver's licence, phone-shaped numbers)
 *  - email-shaped tokens
 *  - long alphanumeric runs (opaque ids/tokens that could encode PII)
 * Deliberately preserved: short numbers like 4-digit years and 001–020 error
 * codes, so messages stay diagnostic.
 */
export function redactErrorText(input: unknown): string {
  const raw = typeof input === "string" ? input : String(input ?? "");
  const redacted = raw
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]")
    // Opaque long runs first, so a mixed id is redacted as a unit rather than
    // leaving its letter fragments behind after the numeric pass.
    .replace(/\b[A-Za-z0-9]{16,}\b/g, "[redacted-token]")
    // Digit runs separated by space, dash, dot, or slash — covers health-card,
    // licence, and phone numbers plus slash/dot-formatted dates (05/14/1990).
    .replace(/\d[\d\s./-]{4,}\d/g, "[redacted-number]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > MAX_MESSAGE_LENGTH
    ? `${redacted.slice(0, MAX_MESSAGE_LENGTH)}…`
    : redacted;
}

/** Convert any thrown value into a non-PII, length-bounded record. */
export function sanitizeError(
  error: unknown,
  context: string,
  at: string,
): SafeErrorReport {
  const name =
    error instanceof Error && error.name ? error.name : "Error";
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  return {
    name: redactErrorText(name),
    message: redactErrorText(message),
    context: redactErrorText(context),
    at,
  };
}

/**
 * The single off-ramp for a fatal error. Today it only logs a sanitized record
 * in development and is otherwise a no-op — nothing is transmitted or persisted
 * off-device. A privacy-reviewed crash service would attach here and MUST
 * receive `report` (already redacted), never the raw error.
 */
export function reportFatalError(error: unknown, context: string): SafeErrorReport {
  const report = sanitizeError(error, context, new Date().toISOString());
  // Guard the RN-injected __DEV__ with typeof so this module is safe to import
  // under a plain Node runtime (e.g. Jest) where __DEV__ is undefined.
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.error(`[ReloGo] fatal (${report.context}): ${report.name}: ${report.message}`);
  }
  return report;
}

/**
 * Route React Native's global (unhandled) error handler through the sanitizer.
 *
 * On our own logging path only a redacted, non-PII record is ever emitted.
 * Non-fatal errors stop here so a raw message is never re-logged. A genuinely
 * FATAL error is still forwarded to the platform's default handler, because it
 * must run for the app to crash/terminate correctly and, in production, produce
 * the OS crash report. That handler receives the original error — the guarantee
 * that keeps it clean is the app-wide invariant that ReloGo's own code never
 * embeds one of the six PII values in an error message (all `throw`s use static
 * strings). Redaction is defence-in-depth against a native/library error that
 * echoes an input on our log path. Idempotent; safe to call once at app start.
 */
export function installGlobalErrorHandler(): void {
  const globalWithErrorUtils = global as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (
        handler: (error: unknown, isFatal?: boolean) => void,
      ) => void;
      __reloGoHandlerInstalled?: boolean;
    };
  };
  const errorUtils = globalWithErrorUtils.ErrorUtils;
  if (!errorUtils?.setGlobalHandler || errorUtils.__reloGoHandlerInstalled) {
    return;
  }

  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    reportFatalError(error, isFatal ? "global:fatal" : "global:nonfatal");
    // Only a fatal error is forwarded, so the platform can crash/terminate.
    if (isFatal) {
      previous?.(error, isFatal);
    }
  });
  errorUtils.__reloGoHandlerInstalled = true;
}
