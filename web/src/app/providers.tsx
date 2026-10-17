"use client";

import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";

/**
 * Initialize PostHog. Idempotent, so the build-time path (PHProvider) and the
 * runtime path (PostHogRuntimeInitializer) can both call it safely.
 */
export function initPostHog(key: string, host?: string | null): void {
  if (posthog.__loaded) return;
  posthog.init(key, {
    api_host: "/ph_ingest",
    ui_host: host || "https://us.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    cross_subdomain_cookie: false,
    autocapture: false,
    capture_pageleave: false,
    disable_session_recording: true,
    property_denylist: ["extension_context"],
    before_send: (event) => {
      if (!event) return null;
      // OAuth codes and private prompts can occur in URL queries or fragments.
      for (const properties of [
        event.properties,
        event.properties?.$set,
        event.properties?.$set_once,
      ]) {
        if (!properties || typeof properties !== "object") continue;
        for (const key of [
          "$current_url",
          "$referrer",
          "$initial_current_url",
          "$initial_referrer",
        ]) {
          if (typeof properties[key] !== "string") continue;
          try {
            const url = new URL(properties[key]);
            properties[key] = url.origin + url.pathname;
          } catch {
            delete properties[key];
          }
        }
      }
      return event;
    },
    session_recording: {
      maskAllInputs: true,
    },
  });
}

interface PHProviderProps {
  children: React.ReactNode;
}

export function PHProvider({ children }: PHProviderProps) {
  useEffect(() => {
    // Build-time key (Onyx Cloud); otherwise PostHogRuntimeInitializer handles it.
    const buildTimeKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (buildTimeKey) {
      initPostHog(buildTimeKey, process.env.NEXT_PUBLIC_POSTHOG_HOST);
    }
  }, []);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
