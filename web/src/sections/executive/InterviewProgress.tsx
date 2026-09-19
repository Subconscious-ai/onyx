"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@opal/components";
import { SvgArrowUpRight, SvgCheck, SvgSquare } from "@opal/icons";
import { modelReadiness, type InterviewBrief } from "@/lib/executive/brief";

interface InterviewProgressProps {
  brief: InterviewBrief | null;
  stale: boolean;
  phase: string;
  busy: boolean;
  chatId: string | null;
  hasAnswer: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onAsk?: (message: string) => void;
  onReview: (item: "goal" | "measure" | "journey") => void;
}

export default function InterviewProgress({
  brief,
  stale,
  phase,
  busy,
  chatId,
  hasAnswer,
  onOpen,
  onRetry,
  onAsk,
  onReview,
}: InterviewProgressProps) {
  const t = useTranslations("executive.progress");
  const goal = brief?.objective.status === "executive";
  const measure = !!brief?.keyResults?.some(
    (item) =>
      item.target.status === "executive" && item.deadline.status === "executive"
  );
  const journey =
    (brief?.journey.length ?? 0) >= 2 && !!brief?.transitions?.length;
  const items = [
    { id: "goal", complete: goal },
    { id: "measure", complete: measure },
    { id: "journey", complete: journey },
  ] as const;
  const count = items.filter((item) => item.complete).length;
  const updating = busy || phase === "updating" || phase === "waiting";
  const failed = phase === "error";
  const ready = !stale && !updating && !failed && modelReadiness(brief).ready;
  const conflict = !!brief?.conflicts.length;
  const next = items.find((item) => !item.complete)?.id;
  const milestone = useRef({ chatId, celebrated: goal, interacted: false });
  useEffect(() => {
    if (milestone.current.chatId !== chatId)
      milestone.current = { chatId, celebrated: goal, interacted: busy };
    if (busy) milestone.current.interacted = true;
    if (
      !goal ||
      stale ||
      busy ||
      phase !== "saved" ||
      milestone.current.celebrated ||
      !milestone.current.interacted
    )
      return;
    milestone.current.celebrated = true;
    let cancelled = false;
    void import("canvas-confetti")
      .then(({ default: celebrate }) => {
        if (!cancelled)
          void celebrate({
            particleCount: 28,
            spread: 52,
            startVelocity: 18,
            ticks: 70,
            origin: { x: 0.75, y: 0.2 },
            colors: ["#c8102e", "#a8a8a8"],
            disableForReducedMotion: true,
          });
      })
      .catch(() => {
        /* Celebration must never interrupt the interview. */
      });
    return () => {
      cancelled = true;
    };
  }, [busy, chatId, goal, phase, stale]);

  const status = failed
    ? t("failed")
    : updating
      ? t("updating")
      : ready
        ? t("ready")
        : conflict
          ? t("conflict")
          : next
            ? t(`${next}Next`)
            : t("connecting");
  const action = failed
    ? t("retry")
    : updating
      ? t("updating")
      : ready
        ? t("open")
        : t("build");
  function advance() {
    if (failed) onRetry();
    else if (ready) onOpen();
    else if (count === 3 && !conflict) onRetry();
    else onAsk?.(t(conflict ? "conflictAsk" : "buildAsk"));
  }
  return (
    <section
      className="interview-progress"
      aria-label={t("title")}
      data-ready={ready}
    >
      <div className="interview-progress-content">
        <div className="interview-progress-heading">
          <strong>{t("title")}</strong>
          <span>{t("count", { count })}</span>
        </div>
        <progress max={3} value={count} aria-label={t("count", { count })} />
        <ol aria-label={t("essentials")}>
          {items.map(({ id, complete }) => (
            <li key={id} data-complete={complete}>
              <Button
                size="xs"
                icon={complete ? SvgCheck : SvgSquare}
                aria-label={`${t(id)}: ${t(complete ? "captured" : "missing")}`}
                prominence="tertiary"
                disabled={busy}
                onClick={() =>
                  complete ? onReview(id) : onAsk?.(t(`${id}Ask`))
                }
              >
                {t(id)}
              </Button>
            </li>
          ))}
        </ol>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </div>
      <div className="interview-progress-action">
        <Button
          size="lg"
          prominence="primary"
          rightIcon={SvgArrowUpRight}
          disabled={updating || (!hasAnswer && !failed)}
          onClick={advance}
        >
          {action}
        </Button>
        <span>{ready ? t("readyHint") : t("hint")}</span>
      </div>
    </section>
  );
}
