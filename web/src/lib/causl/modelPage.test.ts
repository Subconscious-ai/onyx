/** @jest-environment jsdom */
import { captureModelPage } from "@/lib/causl/modelPage";

let post: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  post = jest.spyOn(window.parent, "postMessage").mockImplementation(() => {});
});
afterEach(() => {
  post.mockRestore();
  jest.useRealTimers();
});
function respond(
  overrides: Record<string, unknown> = {},
  origin = "https://models.example"
) {
  const request = post.mock.calls[0][0];
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      source: window.parent,
      data: {
        kind: "models:snapshot",
        nonce: "nonce",
        requestId: request.requestId,
        snapshot: "current page",
        ...overrides,
      },
    })
  );
}

test("captures at dispatch and accepts only the exact parent, origin, nonce and request", async () => {
  const capture = captureModelPage("https://models.example", "nonce");
  respond({}, "https://foreign.example");
  respond({ nonce: "foreign" });
  respond({ requestId: "foreign" });
  expect(jest.getTimerCount()).toBe(1);
  respond();
  await expect(capture).resolves.toBe("current page");
  expect(jest.getTimerCount()).toBe(0);
});

test("missing and oversized context fail without sending an incomplete document", async () => {
  const large = captureModelPage("https://models.example", "nonce");
  respond({ snapshot: "x".repeat(64001) });
  await expect(large).rejects.toThrow("too large");
  post.mockClear();
  const missing = captureModelPage("https://models.example", "nonce");
  respond({ error: "No complete model available" });
  await expect(missing).rejects.toThrow("No complete model available");
});

test("a missing parent response leaves no persistent listener", async () => {
  const capture = captureModelPage("https://models.example", "nonce");
  const rejection = expect(capture).rejects.toThrow("unavailable");
  jest.advanceTimersByTime(5000);
  await rejection;
  expect(jest.getTimerCount()).toBe(0);
});
