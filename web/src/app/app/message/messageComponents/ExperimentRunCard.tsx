"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Button, MessageCard } from "@opal/components";
import { errorHandlingFetcher } from "@/lib/fetcher";
import { useChatSessionStore } from "@/app/app/stores/useChatSessionStore";
import { useAskAssistant } from "@/app/app/message/messageComponents/AskAssistantContext";

interface ExperimentRunStatus {
  run_id: string;
  status: string;
  terminal: boolean;
  successful: boolean | null;
}

interface ExperimentRunCardProps {
  runId: string;
}

// Rehoboam asks to be polled every 30 to 60 seconds.
const POLL_INTERVAL_MS = 30_000;

type Phase = "starting" | "queued" | "running" | "finished" | "failed";

function phaseOf(status: ExperimentRunStatus | undefined): Phase {
  if (!status) return "starting";
  if (status.terminal) return status.successful ? "finished" : "failed";
  if (status.status === "in-queue") return "queued";
  if (status.status === "running") return "running";
  return "starting";
}

/** Results page for a finished run, when this deployment knows where it lives. */
function resultsUrl(runId: string): string | null {
  const base = process.env.NEXT_PUBLIC_HOLODECK_URL;
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.pathname = `${url.pathname.replace(/\/$/, "")}/insights/${encodeURIComponent(runId)}`;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Where a launched experiment stands. The card is drawn from the launch result
 * saved in the conversation, so it is still here after a reload, and it checks
 * the run itself instead of spending the assistant's turns on polling.
 */
export default function ExperimentRunCard({ runId }: ExperimentRunCardProps) {
  const t = useTranslations("chat.messages.experimentRun");
  const chatSessionId = useChatSessionStore((state) => state.currentSessionId);
  const assistant = useAskAssistant();

  const { data, error } = useSWR<ExperimentRunStatus>(
    chatSessionId
      ? `/api/mcp/experiment-run/${encodeURIComponent(runId)}?chat_session_id=${encodeURIComponent(chatSessionId)}`
      : null,
    errorHandlingFetcher,
    {
      refreshInterval: (latest) => (latest?.terminal ? 0 : POLL_INTERVAL_MS),
    }
  );

  const phase = phaseOf(data);
  const shortId = runId.slice(0, 8);
  const link = phase === "finished" ? resultsUrl(runId) : null;

  const followUps = (
    ["explain", "replace", "segments", "audience"] as const
  ).map((key) => ({
    key,
    label: t(`followUp.${key}.label`),
    message: t(`followUp.${key}.text`, { runId }),
  }));

  const variants = {
    starting: "pending",
    queued: "pending",
    running: "pending",
    finished: "success",
    failed: "error",
  } as const;
  const description = {
    starting: t("starting.text"),
    queued: t("queued.text"),
    running: t("running.text"),
    finished: t("finished.text"),
    failed: t("failed.text", { status: data?.status ?? "" }),
  }[phase];

  return (
    <MessageCard
      variant={variants[phase]}
      title={t("title.text", { runId: shortId })}
      titleMaxLines={undefined}
      description={description}
      bottomChildren={
        <>
          {error && !data && <div role="status">{t("unavailable.text")}</div>}
          {phase === "finished" && assistant && (
            <div className="flex flex-wrap gap-2">
              {followUps.map((followUp) => (
                <Button
                  key={followUp.key}
                  prominence="secondary"
                  disabled={assistant.busy}
                  onClick={() => assistant.ask(followUp.message)}
                >
                  {followUp.label}
                </Button>
              ))}
            </div>
          )}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-action-selection-01 hover:underline"
            >
              {t("openResults.label")}
            </a>
          )}
        </>
      }
    />
  );
}
