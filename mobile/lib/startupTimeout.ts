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
  const abortFromParent = () => controller.abort();

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    return await withStartupTimeout(
      Promise.resolve().then(() => operation(controller.signal)),
      timeoutMs,
      () => controller.abort(),
    );
  } finally {
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
