"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { Button, Text } from "@opal/components";
import { SvgArrowUpRight } from "@opal/icons";
import { richNodes } from "@opal/utils";
import ExecutiveWorkspace from "./ExecutiveWorkspace";
import type { InterviewBrief, InterviewMessage } from "@/lib/executive/brief";

const firstQuote =
  "The priority is reducing time to first value over the next six months. Hospital administrators evaluate the platform, but implementation stalls before the first useful workflow.";
const secondQuote =
  "Procurement is actually quick. The real delay is the administrator getting the clinical team to agree on one workflow. Successful customers choose one department first.";
const draft: InterviewBrief = {
  version: 1,
  company: "Meridian Health Software",
  objective: {
    text: "Shorten the path to first customer value.",
    status: "executive",
    quote:
      "The priority is reducing time to first value over the next six months.",
  },
  horizon: "Decision horizon · Six months",
  journey: [
    {
      id: "evaluate",
      actor: "Hospital administrator",
      text: "Evaluates the platform",
      status: "executive",
      quote: "Hospital administrators evaluate the platform",
    },
    {
      id: "commit",
      actor: "Budget owner",
      text: "Approves a first deployment",
      status: "assumption",
    },
    {
      id: "align",
      actor: "Administrator + clinical team",
      text: "Agrees on a first workflow",
      status: "assumption",
    },
    {
      id: "activate",
      actor: "Clinical team",
      text: "Completes a useful workflow",
      status: "assumption",
    },
    {
      id: "repeat",
      actor: "Department",
      text: "Makes the workflow a habit",
      status: "assumption",
    },
  ],
  interventions: [],
  conflicts: [],
};
const revised: InterviewBrief = {
  ...draft,
  journey: draft.journey.map((step) =>
    step.id === "align"
      ? {
          ...step,
          status: "executive",
          quote:
            "The real delay is the administrator getting the clinical team to agree on one workflow.",
        }
      : step
  ),
  interventions: [
    {
      text: "Start with one department, one workflow.",
      journeyId: "align",
      rationale:
        "Test whether a guided first-workflow decision helps the clinical team reach an initial useful outcome sooner. Measure time to first completed workflow; no financial uplift is assumed.",
    },
  ],
};
const initialMessages: InterviewMessage[] = [
  { type: "user", message: firstQuote },
  {
    type: "assistant",
    message: `<interview-brief>${JSON.stringify(draft)}</interview-brief>`,
  },
];

export default function ExecutivePreview() {
  const t = useTranslations("executive");
  const [after, setAfter] = useState(true);
  const messages: InterviewMessage[] = after
    ? [
        ...initialMessages,
        { type: "user", message: secondQuote },
        {
          type: "assistant",
          message: `<interview-brief>${JSON.stringify(revised)}</interview-brief>`,
        },
      ]
    : initialMessages;
  return (
    <main className="executive-preview">
      <ExecutiveWorkspace active preview messages={messages}>
        <div className="executive-preview-story">
          <Text font="secondary-action" data-executive="executive-eyebrow">
            {t("fromAnExecutiveConversationToABetter")}
          </Text>
          <Text as="h1" font="heading-h1" data-executive="executive-title">
            {richNodes(
              <>
                {t("findTheFriction")}
                <br />
                <span className="executive-italic">
                  {t("changeTheOutcome")}
                </span>
              </>
            )}
          </Text>
          <Text as="p" font="main-ui-body" data-executive="executive-intro">
            {t("aFocusedPanelADevelopingBusinessPicture")}
          </Text>
          <div className="executive-example-exchange">
            <div className="executive-example-answer">
              <Text font="main-ui-body">
                {after ? secondQuote : firstQuote}
              </Text>
            </div>
            <div className="executive-example-question">
              <Text font="secondary-action" data-executive="executive-eyebrow">
                {t("sarahJourneySynthesis")}
              </Text>
              <Text as="p" font="main-content-body">
                {after
                  ? "The bottleneck appears to be agreement on a first use case. Think about the last successful deployment: what helped the administrator and clinical team choose that first workflow?"
                  : "The objective is clearer. Think about the last stalled implementation: what was the customer trying to accomplish immediately before progress stopped?"}
              </Text>
            </div>
          </div>
          <div className="executive-preview-actions">
            <Button
              onClick={() => setAfter(!after)}
              prominence="primary"
              rightIcon={SvgArrowUpRight}
            >
              {after
                ? "Explore the earlier draft"
                : "See the insight change the brief"}
            </Button>
            <Button href="/app/executive" prominence="secondary">
              {t("openLiveOnyxInterview")}
            </Button>
          </div>
          <div className="executive-preview-caption">
            <Text font="secondary-body">
              {t("interactiveDesignPreviewMeridianIsFictionalSample")}
            </Text>
          </div>
        </div>
      </ExecutiveWorkspace>
    </main>
  );
}
