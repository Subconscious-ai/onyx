"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecutiveProfile, ProfileFields } from "@/lib/executive/profile";
import { interviewMessageText, type InterviewMessage } from "./brief";

export interface PublicResearch {
  report?: string;
  truncated?: boolean;
  status: string;
  source_urls?: string[];
  checked_at?: number;
  job_id?: string;
}

export function useExecutiveContext(
  active: boolean,
  completedBrief?: string | null
) {
  const [dossier, setDossier] = useState<{
    profile: ProfileFields;
    source: "pdl" | "executive_correction";
  } | null>(null);
  const [profile, setProfile] = useState<ExecutiveProfile | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [checkedContext, setCheckedContext] = useState<{
    brief: typeof completedBrief;
    refresh: number;
  } | null>(null);
  const [profileStatus, setProfileStatus] = useState(
    "Checking professional context…"
  );
  const [research, setResearch] = useState<PublicResearch>({
    status: "pending",
  });
  useEffect(() => {
    if (!active) return;
    setDossier(null);
    setResearch({ status: "pending" });
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
          setDossier(
            ["ready", "updating"].includes(value.status) && value.profile
              ? {
                  profile: value.profile,
                  source: value.correction?.revision
                    ? "executive_correction"
                    : "pdl",
                }
              : null
          );
          setProfile(
            Number.isInteger(value.correction?.revision)
              ? {
                  profile: value.profile ?? {},
                  provider_profile: value.provider_profile,
                  correction: value.correction,
                  checked_at: value.checked_at,
                  job_id: value.job_id,
                  preparation_pending: value.preparation_pending,
                  preparation_status: value.preparation_status,
                }
              : null
          );
          setProfileStatus(
            value.preparation_status === "not_found"
              ? Object.keys(value.profile ?? {}).length
                ? "No fresh PDL match; retained company context is available"
                : "PDL: no confident match"
              : value.preparation_status === "unavailable"
                ? Object.keys(value.profile ?? {}).length
                  ? "PDL refresh unavailable; retained company context is available"
                  : "PDL context unavailable"
                : value.status === "ready"
                  ? `${value.correction?.revision ? "Your company context" : "PDL professional match loaded"}${value.profile?.company ? ` · ${value.profile.company}` : ""}`
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
        if (profile)
          setCheckedContext({ brief: completedBrief, refresh: refreshKey });
        const current = profile ? value.research : value;
        setResearch(current ?? { status: "unavailable" });
        if (["queued", "running"].includes(current?.status)) {
          if (Date.now() - started >= 180000)
            setResearch({ status: "unavailable" });
          else timer = setTimeout(() => refresh(), 2000);
        }
      } catch {
        if (!cancelled) {
          if (profile) {
            setProfileStatus("PDL context unavailable");
            setCheckedContext({ brief: completedBrief, refresh: refreshKey });
          }
          setResearch({ status: "unavailable" });
        }
      }
    }
    void refresh(true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, refreshKey, completedBrief]);
  return {
    refreshing:
      !checkedContext ||
      checkedContext.brief !== completedBrief ||
      checkedContext.refresh !== refreshKey,
    profileStatus,
    dossier,
    profile,
    research,
    reload: () => setRefreshKey((value) => value + 1),
  };
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
    if (!active || busy || !completed) return;
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let manual = attempt > 0;
    let recoveryRequested = false;
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
            (response.ok && !result.saved && result.background === false) ||
            (response.ok &&
              !result.saved &&
              result.background === true &&
              !recoveryRequested &&
              Date.now() - started >= 8000))
        ) {
          manual = true;
          recoveryRequested = true;
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
  }, [active, busy, completed, key, chatId, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    savedMessage: state.key === key ? (state.message ?? null) : null,
    phase: busy
      ? "waiting"
      : state.key === key
        ? state.phase
        : completed
          ? "updating"
          : "saved",
    retry,
  };
}
