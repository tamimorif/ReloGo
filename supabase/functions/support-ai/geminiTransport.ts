export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface ResponseText {
  response: Response;
  body: string;
}

/**
 * Fetch a response and consume its body under one timeout window.
 *
 * The pair is returned only after both operations succeed. Network failures,
 * aborts, and body-stream failures reject this promise so callers can move to
 * their provider fallback without handling a partially initialized response.
 */
export async function fetchResponseTextWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
): Promise<ResponseText> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
    // fetch() resolves when headers arrive. Keep the same abort window active
    // until the response stream has also been consumed.
    const body = await response.text();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}
