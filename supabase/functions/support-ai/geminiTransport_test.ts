import {
  type FetchLike,
  fetchResponseTextWithTimeout,
} from "./geminiTransport.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function assertRejectsWithMessage(
  operation: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes(expectedMessage),
      `Expected rejection containing ${expectedMessage}, got ${message}`,
    );
    return;
  }
  throw new Error(`Expected rejection containing ${expectedMessage}`);
}

Deno.test("provider transport returns response only after reading its body", async () => {
  const response = new Response("complete", { status: 202 });
  const fetchStub: FetchLike = () => Promise.resolve(response);

  const result = await fetchResponseTextWithTimeout(
    "https://provider.example.test/generate",
    { method: "POST" },
    1_000,
    fetchStub,
  );

  assert(result.response === response, "response identity was not preserved");
  assert(result.body === "complete", "response body was not consumed");
});

Deno.test("provider transport propagates network failures", async () => {
  const fetchStub: FetchLike = () =>
    Promise.reject(new Error("network unavailable"));

  await assertRejectsWithMessage(
    () =>
      fetchResponseTextWithTimeout(
        "https://provider.example.test/generate",
        { method: "POST" },
        1_000,
        fetchStub,
      ),
    "network unavailable",
  );
});

Deno.test("provider transport propagates timeout aborts", async () => {
  const fetchStub: FetchLike = (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing abort signal"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => reject(new Error("request aborted by signal")),
        { once: true },
      );
    });

  await assertRejectsWithMessage(
    () =>
      fetchResponseTextWithTimeout(
        "https://provider.example.test/generate",
        { method: "POST" },
        1,
        fetchStub,
      ),
    "request aborted by signal",
  );
});

Deno.test("provider transport propagates response body failures", async () => {
  const bodyFailure = new Error("body stream failed");
  const response = {
    text: () => Promise.reject(bodyFailure),
  } as unknown as Response;
  const fetchStub: FetchLike = () => Promise.resolve(response);

  await assertRejectsWithMessage(
    () =>
      fetchResponseTextWithTimeout(
        "https://provider.example.test/generate",
        { method: "POST" },
        1_000,
        fetchStub,
      ),
    "body stream failed",
  );
});
