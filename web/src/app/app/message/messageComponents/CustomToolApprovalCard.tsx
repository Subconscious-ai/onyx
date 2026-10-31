"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, MessageCard, Text } from "@opal/components";
import {
  CustomToolApprovalOutcome,
  CustomToolApprovalRequest,
} from "../../services/streamingModels";
import { IoBlockLabel } from "@/app/app/message/messageComponents/IoBlockLabel";

interface CustomToolApprovalCardProps {
  request: CustomToolApprovalRequest;
  /** Set once the server closed the request; the card then only reports it. */
  outcome: CustomToolApprovalOutcome | null;
}

type Decision = "approve" | "decline";
type AnswerState = "open" | "sending" | "sent" | "expired" | "failed";

async function sendDecision(
  approvalId: string,
  decision: Decision
): Promise<AnswerState> {
  try {
    const response = await fetch(
      `/api/mcp/elicitation/${encodeURIComponent(approvalId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      }
    );
    if (response.ok) return "sent";
    // Already answered elsewhere: the stream will report the real outcome.
    if (response.status === 409) return "sent";
    if (response.status === 404) return "expired";
    return "failed";
  } catch {
    return "failed";
  }
}

/**
 * One exact action a tool server wants the signed-in user to approve. The
 * server's message is shown as plain text so nothing in it can be mistaken for
 * the card's own controls, and only a click here (never the assistant) answers.
 */
export default function CustomToolApprovalCard({
  request,
  outcome,
}: CustomToolApprovalCardProps) {
  const t = useTranslations("chat.messages.customToolApproval");
  const [answer, setAnswer] = useState<AnswerState>("open");

  const closed = outcome ?? (answer === "expired" ? "expired" : null);

  const answerWith = async (decision: Decision) => {
    setAnswer("sending");
    setAnswer(await sendDecision(request.approval_id, decision));
  };

  const exactAction = (
    <div className="flex flex-col gap-1">
      <IoBlockLabel label={t("messageBlock.label")} />
      <pre
        className="m-0 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-08 bg-background-tint-01 p-2 font-secondary-mono text-sm text-text-03"
        data-testid="approval-exact-action"
      >
        {request.message}
      </pre>
    </div>
  );

  if (closed) {
    const status = {
      approved: {
        variant: "success" as const,
        title: t("approvedStatus.text", { toolName: request.tool_name }),
      },
      declined: {
        variant: "default" as const,
        title: t("declinedStatus.text"),
      },
      expired: { variant: "warning" as const, title: t("expiredStatus.text") },
    }[closed];
    return (
      <MessageCard
        variant={status.variant}
        title={status.title}
        titleMaxLines={undefined}
        bottomChildren={exactAction}
      />
    );
  }

  const busy = answer === "sending" || answer === "sent";
  return (
    <div
      role="group"
      aria-label={
        request.title ?? t("card.title", { toolName: request.tool_name })
      }
    >
      <MessageCard
        variant="pending"
        title={
          request.title ?? t("card.title", { toolName: request.tool_name })
        }
        titleMaxLines={undefined}
        description={request.description ?? t("card.description")}
        bottomChildren={
          <div className="flex flex-col gap-3">
            {exactAction}
            {answer === "failed" && (
              <div role="alert">
                <Text font="secondary-body" color="text-04">
                  {t("sendError.text")}
                </Text>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                prominence="primary"
                disabled={busy}
                onClick={() => answerWith("approve")}
              >
                {t("approveButton.label")}
              </Button>
              <Button
                prominence="secondary"
                disabled={busy}
                onClick={() => answerWith("decline")}
              >
                {t("declineButton.label")}
              </Button>
            </div>
          </div>
        }
      />
    </div>
  );
}
