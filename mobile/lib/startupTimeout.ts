/** Bound startup dependencies so an offline/deleted backend cannot leave the
 * launch screen spinning indefinitely. The underlying promise is still safely
 * observed by Promise.race; sequence guards in the root layout discard late
 * results after the timeout UI has appeared. */
export function withStartupTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("Startup operation timed out"));
    }, timeoutMs);

    Promise.resolve(operation).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Run a cancellable request with both a hard timeout and its caller's abort
 * signal. This is used by checklist queries so a stalled cellular response
 * reaches the existing retry screen instead of leaving a spinner forever. */
export async function withAbortableTimeout<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let rejectAbort: (reason: Error) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abortFromParent = () => {
    controller.abort();
    rejectAbort(new Error("Operation cancelled"));
  };
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    return await withStartupTimeout(
      Promise.race([
        aborted,
        Promise.resolve().then(() => {
          // Do not start a new request after cancellation, including when an
          // auth operation that cannot be aborted resumes after its deadline.
          if (parentSignal?.aborted) abortFromParent();
          assertRequestActive(controller.signal);
          return operation(controller.signal);
        }),
      ]),
      timeoutMs,
      () => controller.abort(),
    );
  } finally {
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

/** Check between awaits when a library operation does not accept a signal. */
export function assertRequestActive(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Operation cancelled");
}
