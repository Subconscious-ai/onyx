import posthog from "posthog-js";
import { initPostHog } from "./providers";
import { AnalyticsEvent, track } from "@/lib/analytics/utils";

jest.mock("posthog-js", () => ({
  __esModule: true,
  default: { __loaded: false, init: jest.fn(), capture: jest.fn() },
}));
jest.mock("posthog-js/react", () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

test("private chat analytics exclude automatic content capture and sensitive URL properties", () => {
  initPostHog("synthetic-key");
  const configuration = jest.mocked(posthog.init).mock.calls[0]![1]!;
  expect(configuration.autocapture).toBe(false);
  expect(configuration.disable_session_recording).toBe(true);
  expect(configuration.capture_pageleave).toBe(false);
  const event = {
    uuid: "synthetic-event",
    event: "$pageview",
    properties: {
      $current_url:
        "https://burn.subconscious.ai/app?prompt=PLANTED_PRIVATE#secret",
      $referrer: "https://example.com/?token=PLANTED_PRIVATE",
      $initial_current_url:
        "https://burn.subconscious.ai/app?code=PLANTED_PRIVATE",
      $initial_referrer: "https://example.com/?secret=PLANTED_PRIVATE",
    },
  };
  if (typeof configuration.before_send !== "function")
    throw new Error("Missing privacy filter");
  const cleaned = configuration.before_send(event);
  expect(JSON.stringify(cleaned)).not.toContain("PLANTED_PRIVATE");
  expect(cleaned?.properties.$current_url).toBe(
    "https://burn.subconscious.ai/app"
  );
});

test("extension chat records an outcome without copying the private source context", () => {
  track(AnalyticsEvent.EXTENSION_CHAT_QUERY, {
    extension_context: "PLANTED_PRIVATE_CUSTOMER_TEXT",
    assistant_id: 5,
    has_files: true,
    deep_research: false,
  });
  expect(JSON.stringify(jest.mocked(posthog.capture).mock.calls)).not.toContain(
    "PLANTED_PRIVATE_CUSTOMER_TEXT"
  );
  expect(posthog.capture).toHaveBeenCalledWith(
    AnalyticsEvent.EXTENSION_CHAT_QUERY,
    expect.objectContaining({ has_extension_context: true, has_files: true })
  );
});
