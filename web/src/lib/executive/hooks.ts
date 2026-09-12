"use client";

import { useEffect, useRef, useState } from "react";
import {
  interviewMessageText,
  projectBrief,
  modelReadiness,
  type InterviewMessage,
} from "./brief";

interface PublicResearch {
  status: string;
  source_urls?: string[];
  checked_at?: number;
}

export function useExecutiveContext(active: boolean) {
  const [profileStatus, setProfileStatus] = useState(
    "Checking professional context…"
  );
  const [research, setResearch] = useState<PublicResearch>({
    status: "pending",
  });
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    async function refresh(profile = false) {
      try {
        const response = await fetch(
          profile
            ? "/api/chat/executive-profile"
            : "/api/chat/executive-research",
          { method: profile ? "POST" : "GET" }
        );
        if (!response.ok) throw new Error("Context unavailable");
        const value = await response.json();
        if (cancelled) return;
        if (profile) {
          setProfileStatus(
            value.status === "ready"
              ? `PDL professional match loaded${value.profile?.company ? ` · ${value.profile.company}` : ""}`
              : value.status === "not_found"
                ? "PDL: no confident match"
                : value.status === "updating"
                  ? "Checking professional context…"
                  : "PDL context unavailable"
          );
          if (value.status === "updating" && Date.now() - started < 30000) {
            timer = setTimeout(() => refresh(true), 2000);
            return;
          }
        }
        const current = profile ? value.research : value;
        setResearch(current ?? { status: "unavailable" });
        if (["queued", "running"].includes(current?.status)) {
          if (Date.now() - started >= 180000)
            setResearch({ status: "unavailable" });
          else timer = setTimeout(() => refresh(), 2000);
        }
      } catch {
        if (!cancelled) {
          if (profile) setProfileStatus("PDL context unavailable");
          setResearch({ status: "unavailable" });
        }
      }
    }
    void refresh(true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active]);
  return { profileStatus, research };
}

/** Coalesce completed turns; never wait for extraction before accepting another answer. */
export function useAutomaticBrief({
  active,
  chatId,
  busy,
  messages,
}: {
  active: boolean;
  chatId: string | null;
  busy: boolean;
  messages: readonly InterviewMessage[];
}) {
  const last = messages.at(-1);
  const lastText = last ? interviewMessageText(last) : "";
  const key = JSON.stringify([
    chatId,
    messages.filter((m) => m.type === "user").map((m) => m.message),
    lastText.split("<interview-brief>")[0],
  ]);
  const completed =
    !!chatId &&
    last?.type === "assistant" &&
    !!lastText.trim() &&
    messages.some((m) => m.type === "user");
  const stored =
    lastText.includes("</interview-brief>") &&
    modelReadiness(projectBrief(messages).brief).ready;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    phase: "updating" | "saved" | "error";
    message?: string;
  }>({ key: "", phase: "saved" });
  const flight = useRef<Promise<Response> | null>(null);
  const latest = useRef(key);
  useEffect(() => {
    latest.current = key;
  }, [key]);
  // Cleanup owns both timers; the abort guard prevents allocation after async reads.
  // The polling/unmount regression covers the async ownership the lint rule misses.
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    if (!active || busy || !completed || stored) return;
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let manual = attempt > 0;
    const poll = async () => {
      setState({ key, phase: "updating" });
      try {
        if (flight.current) await flight.current.catch(() => undefined);
        if (controller.signal.aborted || latest.current !== key) return;
        const request = manual
          ? fetch("/api/chat/executive-brief", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId }),
            })
          : fetch(
              `/api/chat/executive-brief?chat_id=${encodeURIComponent(chatId!)}`,
              { method: "GET" }
            );
        flight.current = request;
        const response = await request;
        const result = await response.json();
        if (controller.signal.aborted || latest.current !== key) return;
        if (
          !manual &&
          (response.status === 405 ||
            (response.ok && !result.saved && result.background === false))
        ) {
          manual = true;
          timer = setTimeout(poll, 0);
          return;
        }
        if (
          (response.ok && !result.saved && result.background === true) ||
          response.status === 409
        ) {
          manual = false;
          if (Date.now() - started > 90000)
            throw new Error("Brief update unavailable");
          timer = setTimeout(poll, 2000);
          return;
        }
        if (!response.ok || !result.saved || typeof result.message !== "string")
          throw new Error("Brief update unavailable");
        setState({ key, phase: "saved", message: result.message });
      } catch {
        if (!controller.signal.aborted && latest.current === key)
          setState({ key, phase: "error" });
      }
    };
    const debounce = setTimeout(poll, 1200);
    return () => {
      clearTimeout(debounce);
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, busy, completed, stored, key, chatId, attempt]);
  return {
    savedMessage: state.key === key ? (state.message ?? null) : null,
    phase: busy
      ? "waiting"
      : state.key === key
        ? state.phase
        : completed && !stored
          ? "updating"
          : "saved",
    retry: () => setAttempt((value) => value + 1),
  };
}
