import {
  withAbortableTimeout,
  withStartupTimeout,
} from "../../lib/startupTimeout";

describe("startup timeout", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("passes through a successful startup operation", async () => {
    await expect(withStartupTimeout(Promise.resolve("ready"), 100)).resolves
      .toBe("ready");
  });

  it("fails a stalled startup operation within the configured bound", async () => {
    jest.useFakeTimers();
    const onTimeout = jest.fn();
    const result = withStartupTimeout(
      new Promise(() => undefined),
      100,
      onTimeout,
    );
    jest.advanceTimersByTime(100);
    await expect(result).rejects.toThrow("Startup operation timed out");
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("aborts an underlying request when its hard timeout expires", async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const result = withAbortableTimeout((signal) => {
      requestSignal = signal;
      return new Promise(() => undefined);
    }, 100);

    await Promise.resolve();
    jest.advanceTimersByTime(100);
    await expect(result).rejects.toThrow("Startup operation timed out");
    expect(requestSignal?.aborted).toBe(true);
  });

  it("forwards a caller abort to the underlying request", async () => {
    const parent = new AbortController();
    const result = withAbortableTimeout(
      (signal) =>
        new Promise((_resolve, reject) => {
          if (signal.aborted) {
            reject(new Error("aborted"));
            return;
          }
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      1_000,
      parent.signal,
    );

    parent.abort();
    await expect(result).rejects.toThrow("cancelled");
  });
});


describe("cancellation even when transport ignores abort", () => {
  it("does not start work for an already-cancelled caller", async () => {
    const parent = new AbortController();
    parent.abort();
    const operation = jest.fn();
    await expect(withAbortableTimeout(operation, 100, parent.signal)).rejects.toThrow("cancelled");
    expect(operation).not.toHaveBeenCalled();
  });

  it("settles immediately when an in-flight operation ignores cancellation", async () => {
    const parent = new AbortController();
    const result = withAbortableTimeout(() => new Promise(() => undefined), 100_000, parent.signal);
    await Promise.resolve();
    parent.abort();
    await expect(result).rejects.toThrow("cancelled");
  });
});
