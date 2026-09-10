"use client";

import { useEffect, useRef, useState } from "react";
import {
  interviewMessageText,
  projectBrief,
  modelReadiness,
  type InterviewMessage,
} from "./brief";

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
  useEffect(() => {
    if (!active || busy || !completed || stored) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ key, phase: "updating" });
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
        if (!response.ok || !result.saved || typeof result.message !== "string")
          throw new Error("Brief update unavailable");
        if (!controller.signal.aborted && latest.current === key)
          setState({ key, phase: "saved", message: result.message });
      } catch {
        if (!controller.signal.aborted && latest.current === key)
          setState({ key, phase: "error" });
      }
    }, 1200);
    return () => {
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
