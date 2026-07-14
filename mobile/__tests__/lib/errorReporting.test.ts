import {
  redactErrorText,
  sanitizeError,
  installGlobalErrorHandler,
  type SafeErrorReport,
} from "@/lib/errorReporting";

describe("redactErrorText", () => {
  it("redacts health-card / driver's-licence shaped numbers", () => {
    expect(redactErrorText("failed for card 1234567890")).toBe(
      "failed for card [redacted-number]",
    );
    expect(redactErrorText("licence D1234-56789")).toContain("[redacted-number]");
    expect(redactErrorText("licence D1234-56789")).not.toContain("56789");
  });

  it("redacts slash- and dot-separated dates of birth", () => {
    expect(redactErrorText("dob 05/14/1990")).toBe("dob [redacted-number]");
    expect(redactErrorText("dob 05.14.1990")).toBe("dob [redacted-number]");
  });

  it("redacts email addresses", () => {
    const out = redactErrorText("bad value user.name@example.com in field");
    expect(out).toBe("bad value [redacted-email] in field");
    expect(out).not.toContain("example.com");
  });

  it("redacts long opaque tokens that could encode PII", () => {
    const out = redactErrorText("token abcdef0123456789ABCDEF here");
    expect(out).toContain("[redacted-token]");
    expect(out).not.toContain("abcdef0123456789ABCDEF");
  });

  it("preserves short diagnostic numbers like years and error codes", () => {
    expect(redactErrorText("move date 2026 code 23514")).toBe(
      "move date 2026 code 23514",
    );
  });

  it("bounds message length", () => {
    const long = "x".repeat(1000);
    expect(redactErrorText(long).length).toBeLessThanOrEqual(301);
  });

  it("never throws on non-string input", () => {
    expect(() => redactErrorText(undefined)).not.toThrow();
    expect(() => redactErrorText(null)).not.toThrow();
    expect(() => redactErrorText({ a: 1 })).not.toThrow();
  });
});

describe("sanitizeError", () => {
  const at = "2026-07-14T00:00:00.000Z";

  it("produces a non-PII record with only the allowed fields", () => {
    const report = sanitizeError(new Error("bad"), "checklist", at);
    const keys = Object.keys(report).sort();
    expect(keys).toEqual<Array<keyof SafeErrorReport>>([
      "at",
      "context",
      "message",
      "name",
    ]);
  });

  it("scrubs PII that appears inside a thrown error's message", () => {
    const leak = new Error(
      "could not fill form for 9876543210 at 42 Wellington St",
    );
    const report = sanitizeError(leak, "pdf", at);
    expect(report.message).not.toContain("9876543210");
    expect(report.message).toContain("[redacted-number]");
  });

  it("handles thrown non-Error values", () => {
    const report = sanitizeError("plain string boom", "auth", at);
    expect(report.name).toBe("Error");
    expect(report.message).toBe("plain string boom");
    expect(report.at).toBe(at);
  });
});

describe("installGlobalErrorHandler", () => {
  afterEach(() => {
    delete (global as unknown as { ErrorUtils?: unknown }).ErrorUtils;
  });

  it("forwards only fatal errors to the platform handler and is idempotent", () => {
    const previous = jest.fn();
    let installed: ((error: unknown, isFatal?: boolean) => void) | undefined;
    (global as unknown as { ErrorUtils: unknown }).ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h: (error: unknown, isFatal?: boolean) => void) => {
        installed = h;
      },
    };

    installGlobalErrorHandler();
    const firstInstalled = installed;
    // Second install is a no-op (idempotent) — the handler is not replaced.
    installGlobalErrorHandler();
    expect(installed).toBe(firstInstalled);

    // A non-fatal error is captured but NOT forwarded (no raw re-log).
    installed?.(new Error("nonfatal boom"), false);
    expect(previous).not.toHaveBeenCalled();

    // A fatal error is forwarded so the platform can crash/terminate.
    installed?.(new Error("fatal boom"), true);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledWith(expect.any(Error), true);
  });
});
