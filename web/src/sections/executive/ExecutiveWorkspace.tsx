"use client";

import { useTranslations } from "next-intl";

import { useMemo, useState } from "react";
import { Button, Text } from "@opal/components";
import { Interactive } from "@opal/core";
import { richNodes } from "@opal/utils";
import { Content } from "@opal/layouts";
import { SvgArrowUpRight, SvgCheck, SvgDownload } from "@opal/icons";
import {
  briefMarkdown,
  projectBrief,
  type BriefNote,
  type InterviewBrief,
  type InterviewMessage,
} from "@/lib/executive/brief";
import "./executive.css";

const specialists = [
  {
    name: "Sarah",
    role: "Journey & synthesis",
    initial: "S",
    job: "Customer decisions, behavioral transitions, and the question worth asking next.",
  },
  {
    name: "Frankie",
    role: "Business model",
    initial: "F",
    job: "The business objective, economic drivers, constraints, and decision horizon.",
  },
  {
    name: "Mei",
    role: "Market & challenge",
    initial: "M",
    job: "Competitors, alternatives, and contradictions grounded in quoted evidence.",
  },
  {
    name: "Jerry",
    role: "A little perspective",
    initial: "J",
    job: "Occasional levity. No extra questions, invented facts, or dossier jokes.",
  },
];

const statusLabel = {
  executive: "Executive evidence",
  research: "Public evidence",
  assumption: "Working assumption",
  unknown: "Open question",
};

function Evidence({ note }: { note: BriefNote }) {
  const t = useTranslations("executive");
  return (
    <div className="executive-evidence">
      <Text
        font="secondary-action"
        data-executive={`executive-status executive-status-${note.status}`}
      >
        {statusLabel[note.status]}
      </Text>
      {note.quote && (
        <Text
          as="p"
          font="secondary-body"
          data-executive="executive-quote"
        >{`“${note.quote}”`}</Text>
      )}
      {note.url && (
        <Button
          href={note.url}
          prominence="tertiary"
          size="sm"
          rightIcon={SvgArrowUpRight}
        >
          {t("originalSource")}
        </Button>
      )}
    </div>
  );
}

function exportBrief(brief: InterviewBrief) {
  const href = URL.createObjectURL(
    new Blob([briefMarkdown(brief)], { type: "text/markdown;charset=utf-8" })
  );
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "executive-interview-brief.md";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function ExecutiveWelcome() {
  const t = useTranslations("executive");
  return (
    <div className="executive-welcome">
      <Text font="secondary-action" data-executive="executive-eyebrow">
        {t("aWorkingSessionNotAQuestionnaire")}
      </Text>
      <Text as="h1" font="heading-h1" data-executive="executive-title">
        {richNodes(
          <>
            {t("theNextMove")}
            <br />
            <span className="executive-italic">{t("madeClearer")}</span>
          </>
        )}
      </Text>
      <Text as="p" font="main-ui-body" data-executive="executive-intro">
        {t("startWithABusinessPriorityAndCompany")}
      </Text>
      <div className="executive-promise">
        <Text font="secondary-body">{t("oneUsefulQuestionAtATime")}</Text>
        <Text font="secondary-body">
          {t("aBriefThatDevelopsAlongsideTheConversation")}
        </Text>
      </div>
    </div>
  );
}

export default function ExecutiveWorkspace({
  active,
  messages,
  onAsk,
  preview = false,
  children,
}: {
  active: boolean;
  messages: readonly InterviewMessage[];
  onAsk?: (message: string) => void;
  preview?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("executive");
  const projection = useMemo(() => projectBrief(messages), [messages]);
  const brief = projection.brief;
  const [view, setView] = useState<"journey" | "evidence" | "decisions">(
    "journey"
  );
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [selectedSpecialist, setSelectedSpecialist] = useState(0);
  const [mobileBrief, setMobileBrief] = useState(false);
  if (!active) return children;
  const step =
    brief?.journey.find((item) => item.id === selectedStep) ??
    brief?.journey[0];
  const evidenceCount = brief
    ? [brief.objective, ...brief.journey].filter((note) =>
        ["executive", "research"].includes(note.status)
      ).length
    : 0;
  const selected = specialists[selectedSpecialist]!;

  return (
    <section
      className={`executive-workspace ${mobileBrief ? "executive-show-brief" : ""}`}
      data-scale="product"
      aria-label={t("executiveInterviewWorkspace")}
    >
      <header className="executive-masthead">
        <div className="executive-brand">
          <Text font="main-ui-action">{t("subconscious")}</Text>
          <Text font="secondary-body" data-executive="executive-brand-rule">
            {t("executiveStudio")}
          </Text>
        </div>
        <div className="executive-session-status">
          <span className="executive-live-dot" />
          <Text font="secondary-body">
            {preview
              ? "DESIGN PREVIEW · SAMPLE COMPANY"
              : "PRIVATE WORKING SESSION"}
          </Text>
        </div>
        <Button
          prominence="secondary"
          size="sm"
          onClick={() => setMobileBrief(!mobileBrief)}
          data-executive="executive-mobile-toggle"
        >
          {mobileBrief ? "Conversation" : "Working brief"}
        </Button>
      </header>

      <div className="executive-main">
        <div className="executive-conversation">
          <div
            className="executive-panel-roster"
            aria-label={t("interviewSpecialists")}
          >
            {specialists.map((specialist, index) => (
              <Interactive.Stateless
                key={specialist.name}
                prominence="tertiary"
                data-executive={`executive-specialist ${index === selectedSpecialist ? "executive-specialist-selected" : ""}`}
                onClick={() => setSelectedSpecialist(index)}
                aria-pressed={index === selectedSpecialist}
              >
                <Interactive.Container
                  type="button"
                  size="fit"
                  width="full"
                  rounding={1}
                >
                  <span className="executive-avatar">
                    <Text font="main-ui-action" color="inherit">
                      {specialist.initial}
                    </Text>
                  </span>
                  <span>
                    <Text font="main-ui-action">{specialist.name}</Text>
                    <Text
                      font="secondary-body"
                      data-executive="executive-specialist-role"
                    >
                      {specialist.role}
                    </Text>
                  </span>
                </Interactive.Container>
              </Interactive.Stateless>
            ))}
          </div>
          <div className="executive-specialist-note" aria-live="polite">
            <Text font="secondary-body">{selected.job}</Text>
          </div>
          <div className="executive-native-chat">{children}</div>
        </div>

        <aside
          className="executive-brief"
          aria-label={t("workingBusinessBrief")}
        >
          <div className="executive-brief-top">
            <div>
              <Text data-executive="executive-eyebrow" font="secondary-action">
                {t("theWorkingPicture")}
              </Text>
              <Text as="h2" font="heading-h2">
                {brief?.company ?? "A business, taking shape."}
              </Text>
            </div>
            <Text font="secondary-body" data-executive="executive-draft-label">
              {t("interviewDraft")}
            </Text>
          </div>
          <div className="executive-objective">
            <Text font="secondary-action" data-executive="executive-eyebrow">
              {t("01TheObjective")}
            </Text>
            <Text
              as="p"
              font="main-content-emphasis"
              data-executive="executive-objective-text"
            >
              {brief?.objective.text ?? "The outcome worth changing."}
            </Text>
            <Text font="secondary-body">
              {brief?.horizon ??
                "Priority and decision horizon emerge from the conversation."}
            </Text>
            {brief && <Evidence note={brief.objective} />}
          </div>
          <div className="executive-view-switch" aria-label={t("briefViews")}>
            {(["journey", "evidence", "decisions"] as const).map((tab) => (
              <Button
                key={tab}
                size="sm"
                prominence={view === tab ? "primary" : "tertiary"}
                aria-pressed={view === tab}
                onClick={() => setView(tab)}
              >
                {tab === "journey"
                  ? "Journey"
                  : tab === "evidence"
                    ? "Evidence"
                    : "Next moves"}
              </Button>
            ))}
          </div>
          <div className="executive-brief-scroll">
            {view === "journey" && (
              <>
                <div className="executive-section-heading">
                  <Text
                    font="secondary-action"
                    data-executive="executive-eyebrow"
                  >
                    {t("02CustomerBehavior")}
                  </Text>
                  <Text font="secondary-body">{`${brief?.journey.length ?? 0} stages`}</Text>
                </div>
                {brief?.journey.length ? (
                  <>
                    <ol className="executive-journey">
                      {brief.journey.map((item, index) => (
                        <li key={item.id}>
                          <Interactive.Stateless
                            prominence="tertiary"
                            data-executive={`executive-stage ${step?.id === item.id ? "executive-stage-selected" : ""}`}
                            onClick={() => setSelectedStep(item.id)}
                            aria-pressed={step?.id === item.id}
                          >
                            <Interactive.Container
                              type="button"
                              size="fit"
                              width="full"
                              rounding={1}
                            >
                              <span className="executive-stage-index">
                                <Text font="secondary-action">
                                  {String(index + 1).padStart(2, "0")}
                                </Text>
                              </span>
                              <span className="executive-stage-copy">
                                <Text font="secondary-body">{item.actor}</Text>
                                <Text font="main-ui-action">{item.text}</Text>
                              </span>
                              {item.status === "executive" ||
                              item.status === "research" ? (
                                <SvgCheck size={14} />
                              ) : (
                                <Text
                                  font="secondary-body"
                                  data-executive="executive-open-marker"
                                >
                                  {t("label")}
                                </Text>
                              )}
                            </Interactive.Container>
                          </Interactive.Stateless>
                        </li>
                      ))}
                    </ol>
                    {step && (
                      <div className="executive-step-detail">
                        <Evidence note={step} />
                        {onAsk && (
                          <Button
                            size="sm"
                            prominence="tertiary"
                            rightIcon={SvgArrowUpRight}
                            onClick={() =>
                              onAsk(
                                `Focus on the journey stage “${step.text}”. Identify the most consequential missing private context before proposing an intervention.`
                              )
                            }
                          >
                            {t("exploreTheFriction")}
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="executive-empty">
                    <Text as="p" font="main-ui-body">
                      {t("theCustomerJourneyStartsWithAnActual")}
                    </Text>
                    <Text as="p" font="secondary-body">
                      {t("thePanelIdentifiesTheBuyerTheFirst")}
                    </Text>
                  </div>
                )}
                <div className="executive-model-note">
                  <Text font="secondary-action">
                    {t("businessModelConnection")}
                  </Text>
                  <Text as="p" font="secondary-body">
                    {t("journeyStructureIsAWorkingDraftMarket")}
                  </Text>
                </div>
              </>
            )}
            {view === "evidence" && (
              <>
                <Content
                  title={t("evidenceBeforeConfidence")}
                  description={`${evidenceCount} attributed statements. Assumptions remain visible until evidence arrives.`}
                  sizePreset="main-ui"
                  variant="section"
                />
                {brief &&
                  [brief.objective, ...brief.journey].map((note, index) => (
                    <div key={index} className="executive-evidence-row">
                      <Text as="p" font="main-ui-body">
                        {note.text}
                      </Text>
                      <Evidence note={note} />
                    </div>
                  ))}
                {!!brief?.conflicts.length && (
                  <div className="executive-conflicts">
                    <Text as="h3" font="main-ui-action">
                      {t("aTensionToResolve")}
                    </Text>
                    {brief.conflicts.map((conflict, index) => (
                      <div key={index}>
                        <Text as="p" font="main-ui-body">
                          {conflict.text}
                        </Text>
                        {conflict.quotes.map((quote) => (
                          <Text
                            key={quote}
                            as="p"
                            font="secondary-body"
                          >{`“${quote}”`}</Text>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {view === "decisions" && (
              <>
                <Content
                  title={t("fromFrictionToAUsefulTest")}
                  description={t("proposalsConnectAChangeInCustomerBehavior")}
                  sizePreset="main-ui"
                  variant="section"
                />
                {brief?.interventions.length ? (
                  brief.interventions.map((item, index) => (
                    <div key={index} className="executive-intervention">
                      <Text
                        font="secondary-action"
                        data-executive="executive-eyebrow"
                      >{`PROPOSAL ${String(index + 1).padStart(2, "0")}`}</Text>
                      <Text as="h3" font="main-ui-action">
                        {item.text}
                      </Text>
                      <Text as="p" font="secondary-body">
                        {item.rationale}
                      </Text>
                      <Text font="secondary-body">{`Journey: ${brief.journey.find((stage) => stage.id === item.journeyId)?.text}`}</Text>
                      {onAsk && (
                        <Button
                          prominence="tertiary"
                          size="sm"
                          rightIcon={SvgArrowUpRight}
                          onClick={() =>
                            onAsk(
                              `Explore the proposed intervention “${item.text}”. Define the behavior to change, the evidence required, and a practical experiment. No experiment execution without an explicit instruction.`
                            )
                          }
                        >
                          {t("shapeAnExperiment")}
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="executive-empty">
                    <Text as="p" font="secondary-body">
                      {t("aSpecificObjectiveAndAMeaningfulJourney")}
                    </Text>
                  </div>
                )}
              </>
            )}
          </div>
          <footer className="executive-brief-footer">
            <div role="status">
              <Text font="secondary-body">
                {projection.updateFailed
                  ? "Brief update invalid · previous draft retained"
                  : projection.updating
                    ? "Brief updating · previous draft shown"
                    : preview
                      ? "Illustrative case · no customer records"
                      : brief
                        ? "Reconstructed from saved conversation"
                        : "Awaiting the first interview insight"}
              </Text>
            </div>
            {brief && (
              <Button
                icon={SvgDownload}
                prominence="tertiary"
                size="sm"
                onClick={() => exportBrief(brief)}
                aria-label={t("downloadInterviewBrief")}
              />
            )}
          </footer>
        </aside>
      </div>
    </section>
  );
}
