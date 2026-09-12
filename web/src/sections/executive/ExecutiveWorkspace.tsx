"use client";

import BecaActions from "./BecaActions";
import { Wordmark } from "@/sections/brand/wordmark";
import { useTranslations } from "next-intl";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAutomaticBrief, useExecutiveContext } from "@/lib/executive/hooks";
import { createModelHandoff } from "@/lib/executive/model-handoff";
import { Button, Text } from "@opal/components";
import { Interactive } from "@opal/core";
import { Content } from "@opal/layouts";
import { SvgArrowUpRight, SvgCheck, SvgDownload } from "@opal/icons";
import {
  briefMarkdown,
  projectBrief,
  modelReadiness,
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
    job: "Identify customer decisions and behavior changes.",
  },
  {
    name: "Frankie",
    role: "Business model",
    initial: "F",
    job: "Connect measurable objectives to economic drivers.",
  },
  {
    name: "Mei",
    role: "Market & challenge",
    initial: "M",
    job: "Check competitors, alternatives, and conflicting evidence.",
  },
  {
    name: "Jerry",
    role: "Perspective & humor",
    initial: "J",
    job: "One brief, grounded roast after the fourth answer. Never after frustration or about personal data.",
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
        <details>
          <summary>{t("sourceDisclosure")}</summary>
          <Text
            as="p"
            font="secondary-body"
            data-executive="executive-quote"
          >{`“${note.quote}”`}</Text>
        </details>
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
      <Text as="h1" font="heading-h2">
        {t("whatNeedsToChange")}
      </Text>
    </div>
  );
}

export default function ExecutiveWorkspace({
  active,
  messages,
  chatId = null,
  busy = false,
  onAsk,
  onDraft,
  preview = false,
  children,
}: {
  active: boolean;
  messages: readonly InterviewMessage[];
  chatId?: string | null;
  busy?: boolean;
  onAsk?: (message: string) => void;
  onDraft?: (message: string) => void;
  preview?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("executive");
  const preparation = useAutomaticBrief({
    active: active && !preview,
    chatId,
    busy,
    messages,
  });
  const savedMessages = useMemo(
    () =>
      preparation.savedMessage
        ? messages.map((message, index) =>
            index === messages.length - 1
              ? { ...message, message: preparation.savedMessage! }
              : message
          )
        : messages,
    [messages, preparation.savedMessage]
  );
  const projection = useMemo(
    () => projectBrief(savedMessages),
    [savedMessages]
  );
  const brief = projection.brief;
  const readiness = modelReadiness(projection.stale ? null : brief);
  const [handoffStatus, setHandoffStatus] = useState("");
  const [modelConnected, setModelConnected] = useState(false);
  const modelHandoff = useRef<ReturnType<typeof createModelHandoff> | null>(
    null
  );
  useEffect(() => {
    setModelConnected(false);
    const destination = process.env.NEXT_PUBLIC_BURN_MODEL_WORKSPACE;
    if (!active || preview || !destination) return;
    const connection = createModelHandoff({
      destination,
      onConnected: setModelConnected,
      onStatus: (status) => {
        const messages: Record<string, string> = {
          waiting: t("handoffSignIn"),
          transferred: t("briefTransferred"),
          connected: t("modelScenarioConnected"),
          proposed: t("modelScenarioProposed"),
          saved: t("modelScenarioSaved"),
          rejected: t("modelScenarioRejected"),
          blocked: t("modelScenarioBlocked"),
          expired: t("modelScenarioBlocked"),
          unavailable: t("modelScenarioUnavailable"),
          error: t("modelScenarioUnavailable"),
        };
        setHandoffStatus(messages[status] ?? "");
      },
    });
    modelHandoff.current = connection;
    return () => {
      connection.dispose();
      modelHandoff.current = null;
    };
  }, [active, preview, chatId, t]);
  const { profileStatus, research } = useExecutiveContext(active && !preview);

  const [view, setView] = useState<
    "journey" | "evidence" | "decisions" | "model"
  >("journey");
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
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

  function openModel() {
    if (modelConnected) {
      const request = [...messages]
        .reverse()
        .find((message) => message.type === "user" && message.message.trim());
      if (request) modelHandoff.current?.request(request.message);
      return;
    }
    const chatId = new URL(window.location.href).searchParams.get("chatId");
    if (!chatId) {
      setHandoffStatus(t("saveBeforeHandoff"));
      return;
    }
    const payload = {
      format: "burn/onyx-interview",
      version: 1,
      chatId,
      messages: savedMessages
        .filter((message) => ["user", "assistant"].includes(message.type))
        .map((message) => ({
          type: message.type,
          message: message.message,
        })),
    };
    if (modelHandoff.current) {
      modelHandoff.current.open(payload);
      return;
    }
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(payload)], {
        type: "application/json",
      })
    );
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "burn-model-handoff.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setHandoffStatus(t("fileHandoffReady"));
  }

  return (
    <section
      className={`executive-workspace ${mobileBrief ? "executive-show-brief" : ""}`}
      data-scale="product"
      aria-label={t("executiveInterviewWorkspace")}
    >
      <header className="executive-masthead">
        <div className="executive-brand">
          <Wordmark ariaLabel="Subconscious" />
          <Text font="main-ui-action">{t("becaName")}</Text>
        </div>
        <div className="flex items-center gap-1">
          {onDraft && (
            <BecaActions
              onDraft={(message) => {
                setMobileBrief(false);
                onDraft(message);
              }}
            />
          )}
          <Button
            prominence="secondary"
            size="sm"
            onClick={() => setMobileBrief(!mobileBrief)}
            data-executive="executive-mobile-toggle"
            aria-expanded={mobileBrief}
            aria-controls="executive-brief"
          >
            {mobileBrief
              ? "Conversation"
              : preparation.phase === "error"
                ? "Brief · retry"
                : preparation.phase === "updating"
                  ? "Brief · updating"
                  : "Brief"}
          </Button>
        </div>
      </header>

      <div className="executive-main">
        <div className="executive-conversation" hidden={mobileBrief}>
          <div className="executive-native-chat">{children}</div>
        </div>

        {mobileBrief && (
          <aside
            id="executive-brief"
            className="executive-brief"
            aria-label={t("workingBusinessBrief")}
          >
            {!preview && (
              <div className="executive-model-action">
                <div role="status" aria-live="polite">
                  <Text font="main-ui-action">
                    {preparation.phase === "updating"
                      ? "Updating the business draft…"
                      : preparation.phase === "error"
                        ? "Draft update needs another attempt"
                        : `${brief?.journey.length ?? 0} journey states · ${brief?.keyResults?.length ?? 0} ${brief?.keyResults?.length === 1 ? "key result" : "key results"}`}
                  </Text>
                  <Text as="p" font="secondary-body">
                    {handoffStatus ||
                      (brief
                        ? "Draft saved in the interview. Market acceptance requires review."
                        : "The draft develops from the conversation.")}
                  </Text>
                </div>
                <Button
                  size="lg"
                  prominence="primary"
                  icon={SvgArrowUpRight}
                  onClick={
                    modelConnected
                      ? openModel
                      : preparation.phase === "error"
                        ? preparation.retry
                        : readiness.ready
                          ? openModel
                          : () => {
                              setView("model");
                              setMobileBrief(true);
                            }
                  }
                >
                  {modelConnected
                    ? t("modelScenarioPreview")
                    : preparation.phase === "error"
                      ? "Retry draft update"
                      : readiness.ready
                        ? "Open business model"
                        : "View business draft"}
                </Button>
                {!modelConnected &&
                  chatId &&
                  process.env.NEXT_PUBLIC_BURN_MODEL_WORKSPACE &&
                  (!readiness.ready || preparation.phase === "error") && (
                    <Button
                      prominence="secondary"
                      onClick={() => modelHandoff.current?.recover()}
                    >
                      {t("modelSavedOpen")}
                    </Button>
                  )}
              </div>
            )}
            <details className="executive-context">
              <summary>{t("researchContextAndLenses")}</summary>
              {!preview && (
                <Text as="p" font="secondary-body">
                  {profileStatus}
                </Text>
              )}
              {!preview && (
                <div role="status" aria-live="polite">
                  <Text as="p" font="secondary-body">
                    {research.status === "ready"
                      ? `Public research · ${research.source_urls?.length ?? 0} sources`
                      : ["pending", "queued", "running"].includes(
                            research.status
                          )
                        ? "Researching the public market…"
                        : research.status === "needs_company"
                          ? "Public research needs a company website"
                          : "Public research unavailable"}
                  </Text>
                  {research.source_urls?.map((url) => (
                    <Button
                      key={url}
                      href={url}
                      prominence="tertiary"
                      size="sm"
                      rightIcon={SvgArrowUpRight}
                    >
                      {new URL(url).hostname}
                    </Button>
                  ))}
                </div>
              )}
              {specialists.map((specialist) => (
                <Text as="p" font="secondary-body" key={specialist.name}>
                  {`${specialist.name}: ${specialist.job}`}
                </Text>
              ))}
            </details>
            <div className="executive-brief-top">
              <div>
                <Text
                  data-executive="executive-eyebrow"
                  font="secondary-action"
                >
                  {t("theWorkingPicture")}
                </Text>
                <Text as="h2" font="heading-h2">
                  {brief?.company ?? "Business draft"}
                </Text>
              </div>
              <Text
                font="secondary-body"
                data-executive="executive-draft-label"
              >
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
                {brief?.objective.text ?? "Objective not established"}
              </Text>
              <Text font="secondary-body">{brief?.horizon ?? ""}</Text>
              {brief && <Evidence note={brief.objective} />}
            </div>
            <div className="executive-view-switch" aria-label={t("briefViews")}>
              {(["journey", "model", "evidence", "decisions"] as const).map(
                (tab) => (
                  <Button
                    key={tab}
                    size="sm"
                    prominence={view === tab ? "primary" : "tertiary"}
                    aria-pressed={view === tab}
                    onClick={() => setView(tab)}
                  >
                    {tab === "journey"
                      ? "Journey"
                      : tab === "model"
                        ? "OKRs & model"
                        : tab === "evidence"
                          ? "Evidence"
                          : "Next moves"}
                  </Button>
                )
              )}
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
                                  <Text font="secondary-body">
                                    {item.actor}
                                  </Text>
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
                </>
              )}
              {view === "model" && (
                <>
                  <Content
                    title={t("behaviorToOutcomes")}
                    description={t("targetsGuideModel")}
                    sizePreset="main-ui"
                    variant="section"
                  />
                  {(brief?.keyResults ?? []).map((kr) => (
                    <div key={kr.id} className="executive-evidence-row">
                      <Text as="h3" font="main-ui-action">
                        {kr.metric}
                      </Text>
                      <Text
                        as="p"
                        font="secondary-body"
                      >{`${kr.direction} · ${kr.unit}`}</Text>
                      <Text
                        as="p"
                        font="main-ui-body"
                      >{`Baseline: ${kr.baseline.text}`}</Text>
                      <Evidence note={kr.baseline} />
                      <Text
                        as="p"
                        font="main-ui-body"
                      >{`Target: ${kr.target.text}`}</Text>
                      <Evidence note={kr.target} />
                      <Text
                        as="p"
                        font="secondary-body"
                      >{`Deadline: ${kr.deadline.text}`}</Text>
                    </div>
                  ))}
                  {brief?.model && (
                    <div className="executive-model-note">
                      <Text as="h3" font="main-ui-action">
                        {t("proposedDriverEquation")}
                      </Text>
                      <Text as="p" font="main-ui-body">
                        {brief.model.equation.text}
                      </Text>
                      <Text as="p" font="secondary-body">
                        {t("noMeasuredEffect")}
                      </Text>
                      {brief.model.inputs.map((input) => (
                        <div key={input.id} className="executive-evidence-row">
                          <Text
                            as="p"
                            font="main-ui-action"
                          >{`${input.name} (${input.unit})`}</Text>
                          <Text as="p" font="secondary-body">
                            {input.value.text}
                          </Text>
                          <Evidence note={input.value} />
                        </div>
                      ))}
                      {brief.model.gaps.map((gap) => (
                        <div key={gap.text} className="executive-evidence-row">
                          <Text as="p" font="main-ui-action">
                            {gap.text}
                          </Text>
                          <Text as="p" font="secondary-body">
                            {gap.impact}
                          </Text>
                          {gap.parked && (
                            <Text font="secondary-action">
                              {t("parkedNoRepeat")}
                            </Text>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="executive-step-detail">
                    <Text as="h3" font="main-ui-action">
                      {readiness.ready
                        ? "Ready for model review"
                        : "Before the model handoff"}
                    </Text>
                    {readiness.missing.map((gap) => (
                      <Text key={gap} as="p" font="secondary-body">
                        {gap}
                      </Text>
                    ))}
                    <Text as="p" font="secondary-body">
                      {t("reviewModelExplanation")}
                    </Text>
                    <Text as="p" font="secondary-body">
                      {t("automaticDraftBoundary")}
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
                  {projection.stale
                    ? "New answers received"
                    : projection.updateFailed
                      ? "Brief update invalid · previous draft retained"
                      : projection.updating
                        ? "Brief updating · previous draft shown"
                        : preview
                          ? "Illustrative case · no customer records"
                          : brief
                            ? "Saved interview draft"
                            : "Waiting for a business objective"}
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
        )}
      </div>
    </section>
  );
}
