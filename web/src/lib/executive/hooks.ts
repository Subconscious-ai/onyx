"use client";

import { useEffect, useRef, useState } from "react";
import type { ExecutiveProfile, ProfileFields } from "@/lib/executive/profile";
import { interviewMessageText, type InterviewMessage } from "./brief";

export interface PublicResearch {
  report?: string;
  truncated?: boolean;
  status: string;
  source_urls?: string[];
  checked_at?: number;
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
  // Pending polls do not replace the last completed provider receipts.
  const [completedReceipts, setCompletedReceipts] = useState<{
    profile?: string;
    research?: string;
  }>({});
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
            value.status === "ready" && value.profile
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
                }
              : null
          );
          setProfileStatus(
            value.status === "ready"
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
        const receipts = {
          profile:
            profile && value.status === "ready"
              ? JSON.stringify([
                  value.checked_at,
                  value.correction?.revision,
                  value.profile,
                ])
              : undefined,
          research:
            current?.status === "ready"
              ? JSON.stringify([
                  current.checked_at,
                  current.source_urls,
                  current.report,
                ])
              : undefined,
        };
        if (receipts.profile || receipts.research)
          setCompletedReceipts((previous) => {
            const profile = receipts.profile ?? previous.profile;
            const research = receipts.research ?? previous.research;
            return profile === previous.profile &&
              research === previous.research
              ? previous
              : { profile, research };
          });
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
    contextRevision: JSON.stringify(completedReceipts),
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
  contextRevision,
}: {
  active: boolean;
  chatId: string | null;
  busy: boolean;
  messages: readonly InterviewMessage[];
  contextRevision?: string;
}) {
  const last = messages.at(-1);
  const lastText = last ? interviewMessageText(last) : "";
  const transcriptKey = JSON.stringify([
    chatId,
    messages.filter((m) => m.type === "user").map((m) => m.message),
    lastText.split("<interview-brief>")[0],
  ]);
  const key = JSON.stringify([transcriptKey, contextRevision ?? ""]);
  const completed =
    !!chatId &&
    last?.type === "assistant" &&
    !!lastText.trim() &&
    messages.some((m) => m.type === "user");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    transcriptKey: string;
    phase: "updating" | "saved" | "error";
    message?: string;
  }>({ key: "", transcriptKey: "", phase: "saved" });
  const flight = useRef<Promise<Response> | null>(null);
  const savedKey = useRef<string | null>(null);
  const latest = useRef(key);
  useEffect(() => {
    latest.current = key;
  }, [key]);
  // Cleanup owns both timers; the abort guard prevents allocation after async reads.
  // The retry/unmount regression covers the async ownership the lint rule misses.
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    if (!active || busy || !completed || savedKey.current === key) return;
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const synchronize = async () => {
      setState((previous) => ({
        key,
        transcriptKey,
        phase: "updating",
        message:
          previous.transcriptKey === transcriptKey
            ? previous.message
            : undefined,
      }));
      try {
        if (flight.current) await flight.current.catch(() => undefined);
        if (controller.signal.aborted || latest.current !== key) return;
        const request = fetch("/api/chat/executive-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId }),
        });
        flight.current = request;
        const response = await request;
        const result = await response.json();
        if (controller.signal.aborted || latest.current !== key) return;
        if (response.status === 409) {
          if (Date.now() - started > 90000)
            throw new Error("Brief update unavailable");
          timer = setTimeout(synchronize, 2000);
          return;
        }
        if (!response.ok || !result.saved || typeof result.message !== "string")
          throw new Error("Brief update unavailable");
        savedKey.current = key;
        setState({
          key,
          transcriptKey,
          phase: "saved",
          message: result.message,
        });
      } catch {
        if (!controller.signal.aborted && latest.current === key)
          setState((previous) => ({
            key,
            transcriptKey,
            phase: "error",
            message:
              previous.transcriptKey === transcriptKey
                ? previous.message
                : undefined,
          }));
      }
    };
    const debounce = setTimeout(synchronize, 1200);
    return () => {
      clearTimeout(debounce);
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, busy, completed, key, transcriptKey, chatId, attempt]);
  return {
    savedMessage:
      state.transcriptKey === transcriptKey ? (state.message ?? null) : null,
    phase: busy
      ? "waiting"
      : state.key === key
        ? state.phase
        : completed
          ? "updating"
          : "saved",
    retry: () => setAttempt((value) => value + 1),
  };
}
