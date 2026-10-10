import {
  redactErrorText,
  sanitizeError,
  installGlobalErrorHandler,
  reportFatalError,
  type SafeErrorReport,
} from "@/lib/errorReporting";

const at = "2026-09-14T00:00:00.000Z";
const privateValues = [
  "Jane Doe", "123 Main St", "42 Wellington Street", "Élodie Roy", "李 明",
  "9876543210", "D1234-56789", "05/14/1990", "user.name@example.com",
  "abcdef0123456789ABCDEF",
];

describe("privacy-safe error reporting", () => {
  it.each(privateValues)("discards arbitrary private text: %s", (pii) => {
    const error = new Error(pii);
    error.name = pii;
    error.stack = pii;
    const report = sanitizeError(error, pii, at);
    expect(JSON.stringify(report)).not.toContain(pii);
    expect(redactErrorText(pii)).toBe("An unexpected error occurred.");
  });

  it("retains only approved metadata", () => {
    const report = sanitizeError(new TypeError("private input"), "checklist", at);
    expect(Object.keys(report).sort()).toEqual<Array<keyof SafeErrorReport>>([
      "at", "context", "message", "name",
    ]);
    expect(report).toEqual({
      name: "TypeError", message: "An unexpected error occurred.",
      context: "checklist", at,
    });
    expect(sanitizeError("Jane Doe", "Jane Doe", "Jane Doe")).toEqual({
      name: "Error", message: "An unexpected error occurred.",
      context: "unknown", at: "unknown",
    });
  });

  it("never reads message, stack, cause, or stringifies a thrown object", () => {
    const error = new Error();
    for (const field of ["name", "message", "stack", "cause"]) {
      Object.defineProperty(error, field, { get: () => { throw new Error("unsafe getter"); } });
    }
    expect(() => sanitizeError(error, "pdf", at)).not.toThrow();
    expect(() => sanitizeError({ toString: () => { throw new Error("unsafe"); } }, "pdf", at)).not.toThrow();
    expect(() => sanitizeError(new Proxy({}, { getPrototypeOf: () => { throw new Error("unsafe"); } }), "pdf", at)).not.toThrow();
    for (const value of [undefined, null, "x".repeat(10_000)]) {
      expect(redactErrorText(value).length).toBeLessThan(100);
    }
  });

  it("logs only sanitized metadata in development", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const runtime = global as unknown as { __DEV__?: boolean };
    const previousDev = runtime.__DEV__;
    runtime.__DEV__ = true;
    try {
      reportFatalError(new Error("Jane Doe"), "render-boundary");
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain("Jane Doe");
    } finally {
      runtime.__DEV__ = previousDev;
      consoleError.mockRestore();
    }
  });
});

describe("installGlobalErrorHandler", () => {
  afterEach(() => {
    delete (global as unknown as { ErrorUtils?: unknown }).ErrorUtils;
  });

  it("forwards a safe replacement only for fatal errors and installs once", () => {
    const previous = jest.fn();
    let installed: ((error: unknown, isFatal?: boolean) => void) | undefined;
    const install = jest.fn((handler) => { installed = handler; });
    (global as unknown as { ErrorUtils: unknown }).ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: install,
    };
    installGlobalErrorHandler();
    installGlobalErrorHandler();
    expect(install).toHaveBeenCalledTimes(1);
    const raw = new Error("Jane Doe at 42 Wellington Street");
    raw.name = "Private Name";
    raw.stack = "private filesystem path";
    installed?.(raw, false);
    expect(previous).not.toHaveBeenCalled();
    installed?.(raw, true);
    expect(previous).toHaveBeenCalledTimes(1);
    const [forwarded, isFatal] = previous.mock.calls[0];
    expect(isFatal).toBe(true);
    expect(forwarded).toBeInstanceOf(Error);
    expect(forwarded).not.toBe(raw);
    expect(forwarded.name).toBe("Error");
    expect(forwarded.message).toBe("An unexpected error occurred.");
    expect(forwarded.stack).toBeUndefined();
    expect(forwarded.cause).toBeUndefined();
  });
});
