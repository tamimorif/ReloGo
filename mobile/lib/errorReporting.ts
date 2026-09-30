/**
 * Privacy-safe crash/error capture.
 *
 * ReloGo's defining rule is that the device-only PII values (full name,
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

const SAFE_ERROR_MESSAGE = "An unexpected error occurred.";
const SAFE_CONTEXTS = new Set([
  "render-boundary", "global:fatal", "global:nonfatal", "checklist", "pdf", "auth",
]);

/** Arbitrary exception text can contain names/addresses in any language.
 * Discard it completely instead of treating a regex match as proof of safety.
 * Do not stringify objects: even their toString/getters may throw or leak. */
export function redactErrorText(_input: unknown): string {
  return SAFE_ERROR_MESSAGE;
}

/** Only built-in error categories are diagnostic; custom names are data. */
function safeErrorName(error: unknown): string {
  try {
    if (error instanceof TypeError) return "TypeError";
    if (error instanceof RangeError) return "RangeError";
    if (error instanceof ReferenceError) return "ReferenceError";
    if (error instanceof SyntaxError) return "SyntaxError";
  } catch {
    // A thrown proxy may even reject an instanceof check.
  }
  return "Error";
}

/** Convert any thrown value into a record containing only approved metadata. */
export function sanitizeError(
  error: unknown,
  context: string,
  at: string,
): SafeErrorReport {
  return {
    name: safeErrorName(error),
    message: redactErrorText(error),
    context: SAFE_CONTEXTS.has(context) ? context : "unknown",
    at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) ? at : "unknown",
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

/** Route global errors through the same privacy boundary. Fatal errors still
 * reach the platform termination handler, but only as a newly-created safe
 * Error. Raw message, name, stack, cause and custom properties never escape. */
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
    const report = reportFatalError(error, isFatal ? "global:fatal" : "global:nonfatal");
    // Only a fatal error is forwarded, so the platform can crash/terminate.
    if (isFatal) {
      const safeError = new Error(report.message);
      safeError.name = report.name;
      safeError.stack = undefined;
      previous?.(safeError, isFatal);
    }
  });
  errorUtils.__reloGoHandlerInstalled = true;
}
