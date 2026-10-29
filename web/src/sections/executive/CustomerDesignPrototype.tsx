"use client";

/* oxlint-disable i18n/no-raw-jsx-text -- Development-only, throwaway English fixture review; no production strings. */
// Three customer layouts on /executive-preview?variant=A|B|C. No API or persistence.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button, InputTextArea, InputTypeIn, Text } from "@opal/components";
import {
  SvgArrowLeft,
  SvgArrowRight,
  SvgArrowUp,
  SvgArrowUpRight,
  SvgBookOpen,
  SvgBubbleText,
  SvgClock,
  SvgFileText,
  SvgPaperclip,
  SvgPlus,
  SvgSearch,
  SvgSidebar,
  SvgStop,
  SvgX,
} from "@opal/icons";
import { cn } from "@opal/utils";
import { DagMark } from "@/sections/brand/dag-mark";
import { Wordmark } from "@/sections/brand/wordmark";
import {
  modelReadiness,
  type InterviewBrief,
  type InterviewMessage,
} from "@/lib/executive/brief";
import "./customer-design-contract.css";
import "./customer-design-prototype.css";

const variants = ["A", "B", "C"] as const;
const variantNames = { A: "Focus", B: "Studio", C: "Canvas" };
const reviewStates = ["Active", "Empty", "Streaming", "Error"] as const;

interface CustomerDesignPrototypeProps {
  messages: readonly InterviewMessage[];
  brief: InterviewBrief;
}

interface LayoutProps {
  company: string;
  conversation: ReactNode;
  brief: ReactNode;
  onHistory: () => void;
  onBrief: () => void;
  onSources: () => void;
  onNew: () => void;
}

interface ContextHeadingProps {
  company: string;
}

interface HistoryProps extends ContextHeadingProps {
  onNew: () => void;
  onOpen: () => void;
}

function ContextHeading({ company }: ContextHeadingProps) {
  return (
    <div className="cdp-context">
      <span className="cdp-meta">{company}</span>
      <Text as="h1" font="main-ui-action" color="inherit">
        First customer value
      </Text>
    </div>
  );
}

function History({ company, onNew, onOpen }: HistoryProps) {
  return (
    <div className="cdp-history-content">
      <div className="cdp-history-actions">
        <Button
          prominence="secondary"
          icon={SvgPlus}
          onClick={onNew}
          width="full"
        >
          New conversation
        </Button>
        <Button
          prominence="tertiary"
          icon={SvgSearch}
          onClick={onOpen}
          width="full"
        >
          Search conversations
        </Button>
      </div>
      <span className="cdp-eyebrow">Recent</span>
      <div className="cdp-history-current">
        <Button
          prominence="tertiary"
          icon={SvgBubbleText}
          onClick={onOpen}
          width="full"
        >
          First customer value
        </Button>
        <span className="cdp-meta">{company}</span>
      </div>
      <div className="cdp-workspace-note">
        <span className="cdp-avatar">M</span>
        <span>Meridian workspace</span>
      </div>
    </div>
  );
}

export function FocusVariant(props: LayoutProps) {
  return (
    <div className="cdp-focus">
      <aside className="cdp-focus-sidebar" aria-label="Conversation history">
        <Wordmark />
        <History
          company={props.company}
          onNew={props.onNew}
          onOpen={props.onHistory}
        />
      </aside>
      <main className="cdp-focus-main">
        <header className="cdp-workspace-header">
          <div className="cdp-mobile-history">
            <Button
              prominence="tertiary"
              icon={SvgSidebar}
              aria-label="Open conversation history"
              onClick={props.onHistory}
            />
          </div>
          <ContextHeading company={props.company} />
          <div className="cdp-header-actions">
            <Button
              prominence="tertiary"
              icon={SvgBookOpen}
              onClick={props.onSources}
              aria-label="Open sources"
            />
            <Button
              prominence="secondary"
              icon={SvgFileText}
              onClick={props.onBrief}
            >
              Brief
            </Button>
          </div>
        </header>
        {props.conversation}
      </main>
    </div>
  );
}

export function StudioVariant(props: LayoutProps) {
  return (
    <div className="cdp-studio">
      <nav className="cdp-rail" aria-label="Workspace">
        <DagMark />
        <Button
          prominence="tertiary"
          icon={SvgPlus}
          aria-label="New conversation"
          onClick={props.onNew}
        />
        <Button
          prominence="tertiary"
          icon={SvgSearch}
          aria-label="Search conversations"
          onClick={props.onHistory}
        />
        <span className="cdp-rail-rule" />
        <div className="cdp-rail-selected">
          <Button
            prominence="tertiary"
            icon={SvgBubbleText}
            aria-label="Current conversation"
            onClick={props.onHistory}
          />
        </div>
        <Button
          prominence="tertiary"
          icon={SvgBookOpen}
          aria-label="Open sources"
          onClick={props.onSources}
        />
        <span className="cdp-rail-avatar cdp-avatar">M</span>
      </nav>
      <main className="cdp-studio-main">
        <header className="cdp-workspace-header">
          <ContextHeading company={props.company} />
          <div className="cdp-mobile-brief">
            <Button
              prominence="secondary"
              icon={SvgFileText}
              onClick={props.onBrief}
            >
              Brief
            </Button>
          </div>
          <span className="cdp-working-label">
            <span />
            Working conversation
          </span>
        </header>
        {props.conversation}
      </main>
      <aside className="cdp-studio-brief" aria-label="Working business brief">
        {props.brief}
      </aside>
    </div>
  );
}

export function CanvasVariant(props: LayoutProps) {
  return (
    <div className="cdp-canvas">
      <header className="cdp-canvas-header">
        <Wordmark />
        <nav aria-label="Conversation views">
          <Button
            prominence="tertiary"
            icon={SvgClock}
            aria-label="Open conversation history"
            onClick={props.onHistory}
          />
          <Button prominence="tertiary" onClick={props.onSources}>
            Sources
          </Button>
          <Button prominence="tertiary" onClick={props.onBrief}>
            Brief
          </Button>
        </nav>
        <div className="cdp-canvas-new">
          <Button prominence="secondary" icon={SvgPlus} onClick={props.onNew}>
            New
          </Button>
        </div>
      </header>
      <main className="cdp-canvas-main">
        <header className="cdp-canvas-context">
          <ContextHeading company={props.company} />
          <span className="cdp-meta">Conversation / 01</span>
        </header>
        {props.conversation}
      </main>
      <aside className="cdp-canvas-shelf" aria-label="Working business brief">
        {props.brief}
      </aside>
    </div>
  );
}

interface BriefProps {
  brief: InterviewBrief;
  onSources: () => void;
  onModel: () => void;
}

function WorkingBrief({ brief, onSources, onModel }: BriefProps) {
  const readiness = modelReadiness(brief);
  return (
    <div className="cdp-brief-content">
      <div className="cdp-brief-heading">
        <span className="cdp-eyebrow">Working brief</span>
        <span className="cdp-meta">Draft</span>
      </div>
      <section className="cdp-brief-objective">
        <Text as="h2" font="heading-h2" color="inherit">
          {brief.objective.text}
        </Text>
        <span className="cdp-meta">{brief.horizon}</span>
        <div className="cdp-provenance">
          <span className="cdp-status-dot" />
          Executive statement
          <Button
            prominence="tertiary"
            size="xs"
            icon={SvgArrowUpRight}
            aria-label="Read the objective source quote"
            onClick={onSources}
          />
        </div>
      </section>
      <section className="cdp-brief-journey" aria-label="Customer journey">
        <span className="cdp-eyebrow">Customer journey</span>
        <ol>
          {brief.journey.map((step, index) => (
            <li key={step.id} data-evidence={step.status}>
              <span className="cdp-journey-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <Text as="p" font="main-ui-body" color="inherit">
                  {step.text}
                </Text>
                <span className="cdp-meta">{step.actor}</span>
              </div>
              <span className="cdp-evidence-label">
                {step.status === "executive"
                  ? "Stated"
                  : step.status === "research"
                    ? "Research"
                    : step.status === "unknown"
                      ? "Unknown"
                      : "Assumed"}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section className="cdp-next-step">
        <span className="cdp-eyebrow">Next to test</span>
        <Text as="p" font="main-ui-action" color="inherit">
          {brief.interventions[0]?.text ?? "No intervention established."}
        </Text>
        <span className="cdp-meta">
          {brief.interventions.length
            ? "Proposed · outcome unmeasured"
            : "Awaiting conversation evidence"}
        </span>
      </section>
      <div className="cdp-model-action">
        <Button
          prominence="secondary"
          rightIcon={SvgArrowUpRight}
          disabled={!readiness.ready}
          onClick={onModel}
        >
          Review model
        </Button>
        <span className="cdp-meta">
          {readiness.ready
            ? "Preview only · no transfer"
            : `Missing: ${readiness.missing[0]?.toLowerCase()}.`}
        </span>
      </div>
    </div>
  );
}

interface SourcesProps {
  brief: InterviewBrief;
}

function SourceQuotes({ brief }: SourcesProps) {
  const notes = [brief.objective, ...brief.journey];
  const quoted = notes.filter(
    (note, index) =>
      note.quote &&
      notes.findIndex((entry) => entry.quote === note.quote) === index
  );
  return (
    <div className="cdp-source-content">
      <div className="cdp-source-origin">
        <SvgBubbleText />
        <div>
          <Text as="p" font="main-ui-action" color="inherit">
            Executive conversation
          </Text>
          <span className="cdp-meta">
            Meridian fixture · supplied statements
          </span>
        </div>
      </div>
      {quoted.map((note, index) => (
        <figure className="cdp-source-quote" key={note.quote}>
          <figcaption className="cdp-eyebrow">
            Statement {String(index + 1).padStart(2, "0")}
          </figcaption>
          <blockquote>{note.quote}</blockquote>
          <span className="cdp-evidence-label">Executive statement</span>
        </figure>
      ))}
      <div className="cdp-source-boundary">
        <span className="cdp-eyebrow">Evidence boundary</span>
        <Text as="p" font="secondary-body" color="inherit">
          Assumed steps remain assumptions. External research and measured
          outcomes are absent from the fixture.
        </Text>
      </div>
    </div>
  );
}

export default function CustomerDesignPrototype({
  messages,
  brief,
}: CustomerDesignPrototypeProps) {
  const [variant, setVariant] = useState<(typeof variants)[number]>("A");
  const [state, setState] = useState<(typeof reviewStates)[number]>("Active");
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [panel, setPanel] = useState<
    "brief" | "sources" | "history" | "model" | null
  >(null);
  const [search, setSearch] = useState("");
  const [inlineEvidence, setInlineEvidence] = useState(true);
  const [attachment, setAttachment] = useState(false);
  const [notice, setNotice] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const changeVariant = useCallback((next: (typeof variants)[number]) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(window.history.state, "", url);
    setVariant(next);
    setPanel(null);
  }, []);

  useEffect(() => {
    function readVariant() {
      const next = new URLSearchParams(window.location.search).get("variant");
      setVariant(next === "B" || next === "C" ? next : "A");
    }
    readVariant();
    window.addEventListener("popstate", readVariant);
    return () => window.removeEventListener("popstate", readVariant);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || panel) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, [contenteditable], [role='textbox']"
        )
      )
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      changeVariant(
        variants[
          (variants.indexOf(variant) + (event.key === "ArrowRight" ? 1 : 2)) %
            variants.length
        ]!
      );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeVariant, panel, variant]);

  function newConversation() {
    setState("Empty");
    setSubmitted([]);
    setPanel(null);
    composerRef.current?.focus();
  }
  function sendDraft() {
    if (state === "Streaming" || !draft.trim()) return;
    setSubmitted([...submitted, draft.trim()]);
    setDraft("");
    setState("Streaming");
    setNotice("Preview message only. No message was sent.");
  }
  function openSources() {
    setPanel("sources");
  }
  function openBrief() {
    setPanel("brief");
  }
  function openHistory() {
    setPanel("history");
  }
  function openModel() {
    setPanel("model");
  }

  const userMessages = messages.filter((message) => message.type === "user");
  const latestMessage = userMessages.at(-1)?.message;
  const historyMatches = "First customer value Meridian Health Software"
    .toLowerCase()
    .includes(search.toLowerCase());
  const conversation = (
    <section className="cdp-conversation" aria-label="Conversation">
      <div className="cdp-thread" aria-live="polite">
        {state === "Empty" ? (
          <div className="cdp-empty">
            <DagMark />
            <span className="cdp-eyebrow">A useful starting point</span>
            <Text as="h2" font="heading-h1" color="inherit">
              Where does progress stop?
            </Text>
            <Text as="p" font="main-content-body" color="inherit">
              Start with one customer. Describe the last stalled step.
            </Text>
            <div className="cdp-empty-prompt">
              <Button
                prominence="secondary"
                rightIcon={SvgArrowUpRight}
                onClick={() => {
                  setDraft(brief.objective.text);
                  composerRef.current?.focus();
                }}
              >
                Explore the current objective
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="cdp-thread-intro">
              <span className="cdp-eyebrow">The objective</span>
              <Text as="h2" font="heading-h1" color="inherit">
                {brief.objective.text}
              </Text>
            </div>
            {latestMessage && (
              <article className="cdp-user-message">
                <span className="cdp-message-label">Executive</span>
                <Text as="p" font="main-content-body" color="inherit">
                  {latestMessage}
                </Text>
              </article>
            )}
            <article className="cdp-synthesis">
              <div className="cdp-synthesis-label">
                <DagMark size="xs" />
                <span>
                  Beca <span className="cdp-meta">/ Working synthesis</span>
                </span>
              </div>
              <Text as="p" font="main-content-body" color="inherit">
                {brief.interventions[0]?.text ?? brief.objective.text}
              </Text>
              <div className="cdp-synthesis-tools">
                <Button
                  prominence="tertiary"
                  size="sm"
                  icon={SvgBookOpen}
                  onClick={
                    variant === "C"
                      ? () => setInlineEvidence(!inlineEvidence)
                      : openSources
                  }
                  aria-expanded={variant === "C" ? inlineEvidence : undefined}
                >
                  Conversation evidence
                </Button>
                <span className="cdp-meta">Draft · unmeasured</span>
              </div>
            </article>
            {variant === "C" && inlineEvidence && (
              <aside
                className="cdp-inline-evidence"
                aria-label="Inline evidence"
              >
                <span className="cdp-eyebrow">From the conversation</span>
                <blockquote>
                  {brief.journey.find((step) => step.id === "align")?.quote ??
                    brief.objective.quote ??
                    "No source quote available."}
                </blockquote>
                <div className="cdp-inline-evidence-footer">
                  <span className="cdp-evidence-label">
                    Executive statement
                  </span>
                  <Button
                    prominence="tertiary"
                    size="sm"
                    rightIcon={SvgArrowUpRight}
                    onClick={openSources}
                  >
                    All evidence
                  </Button>
                </div>
              </aside>
            )}
          </>
        )}
        {submitted.map((message, index) => (
          <article className="cdp-user-message" key={`${index}-${message}`}>
            <span className="cdp-message-label">Local preview</span>
            <Text as="p" font="main-content-body" color="inherit">
              {message}
            </Text>
          </article>
        ))}
        {state === "Streaming" && (
          <div className="cdp-streaming" role="status">
            <span className="cdp-pulse" />
            <span>Preparing a response</span>
            <Button
              prominence="tertiary"
              size="sm"
              icon={SvgStop}
              onClick={() => {
                setState("Active");
                setNotice("Preview response stopped.");
              }}
            >
              Stop
            </Button>
          </div>
        )}
        {state === "Error" && (
          <div className="cdp-error" role="alert">
            <div>
              <Text as="p" font="main-ui-action" color="inherit">
                The response could not finish.
              </Text>
              <span className="cdp-meta">
                The conversation and draft remain available.
              </span>
            </div>
            <Button
              prominence="secondary"
              size="sm"
              onClick={() => {
                setState("Streaming");
                setNotice("Preview retry. No request was sent.");
              }}
            >
              Retry
            </Button>
          </div>
        )}
      </div>
      <div className="cdp-composer-wrap">
        <form
          className="cdp-composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendDraft();
          }}
        >
          {attachment && (
            <div className="cdp-attachment">
              <SvgFileText />
              <span>Fixture note · local preview</span>
              <Button
                prominence="tertiary"
                size="xs"
                icon={SvgX}
                aria-label="Remove preview attachment"
                onClick={() => setAttachment(false)}
              />
            </div>
          )}
          <InputTextArea
            ref={composerRef}
            aria-label="Message Beca"
            placeholder="Continue the conversation…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            maxRows={5}
            autoResize
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                sendDraft();
              }
            }}
          />
          <div className="cdp-composer-tools">
            <Button
              prominence="tertiary"
              icon={SvgPaperclip}
              aria-label="Add a local preview attachment"
              aria-pressed={attachment}
              onClick={() => setAttachment(!attachment)}
            />
            <span className="cdp-meta">Beca</span>
            <div className="cdp-send">
              <Button
                icon={state === "Streaming" ? SvgStop : SvgArrowUp}
                aria-label={
                  state === "Streaming"
                    ? "Stop preview response"
                    : "Send preview message"
                }
                disabled={state !== "Streaming" && !draft.trim()}
                onClick={
                  state === "Streaming" ? () => setState("Active") : sendDraft
                }
              />
            </div>
          </div>
        </form>
        <span className="cdp-composer-caption">
          Working drafts can contain assumptions.
        </span>
      </div>
    </section>
  );
  const workingBrief = (
    <WorkingBrief brief={brief} onSources={openSources} onModel={openModel} />
  );
  const layoutProps = {
    company: brief.company,
    conversation,
    brief: workingBrief,
    onHistory: openHistory,
    onBrief: openBrief,
    onSources: openSources,
    onNew: newConversation,
  };

  return (
    <div
      className={cn(
        "customer-design-prototype",
        "cdp",
        state === "Empty" && "cdp-is-empty"
      )}
      data-theme="kong"
      data-mode="light"
      data-scale="product"
      data-variant={variant}
    >
      <div className="cdp-fixture-label">
        Design study <span>·</span> Fictional Meridian fixture <span>·</span> No
        live actions
      </div>
      <div className="cdp-product">
        {variant === "A" ? (
          <FocusVariant {...layoutProps} />
        ) : variant === "B" ? (
          <StudioVariant {...layoutProps} />
        ) : (
          <CanvasVariant {...layoutProps} />
        )}
      </div>
      <Dialog.Root
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className="customer-design-prototype cdp-dialog-overlay"
            data-theme="kong"
            data-mode="light"
            data-scale="product"
          />
          <Dialog.Content
            className="customer-design-prototype cdp-dialog"
            data-theme="kong"
            data-mode="light"
            data-scale="product"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              composerRef.current?.focus();
            }}
          >
            <div className="cdp-dialog-header">
              <Dialog.Title>
                {panel === "sources"
                  ? "Conversation evidence"
                  : panel === "history"
                    ? "Conversations"
                    : panel === "model"
                      ? "Model preview"
                      : "Working brief"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button
                  prominence="tertiary"
                  icon={SvgX}
                  aria-label="Close disclosure"
                />
              </Dialog.Close>
            </div>
            <Dialog.Description className="cdp-visually-hidden">
              Read-only Meridian fixture. The conversation draft remains
              available after closing.
            </Dialog.Description>
            {panel === "sources" ? (
              <SourceQuotes brief={brief} />
            ) : panel === "history" ? (
              <div className="cdp-search-content">
                <Button
                  prominence="secondary"
                  icon={SvgPlus}
                  onClick={newConversation}
                >
                  New conversation
                </Button>
                <InputTypeIn
                  searchIcon
                  aria-label="Search conversations"
                  placeholder="Search conversations…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <span className="cdp-eyebrow">Recent conversation</span>
                {historyMatches ? (
                  <div className="cdp-search-result">
                    <Button
                      prominence="tertiary"
                      icon={SvgBubbleText}
                      onClick={() => {
                        setState("Active");
                        setPanel(null);
                      }}
                    >
                      First customer value
                    </Button>
                    <span className="cdp-meta">{brief.company}</span>
                  </div>
                ) : (
                  <Text as="p" color="inherit">
                    No matching conversations.
                  </Text>
                )}
              </div>
            ) : panel === "model" ? (
              <div className="cdp-model-preview">
                <SvgFileText />
                <Text as="p" color="inherit">
                  Model handoff is outside the design preview.
                </Text>
                <span className="cdp-meta">
                  No model was created or transferred.
                </span>
              </div>
            ) : (
              workingBrief
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {process.env.NODE_ENV !== "production" && (
        <aside className="cdp-review" aria-label="Design review controls">
          <div className="cdp-variant-switch">
            <Button
              prominence="tertiary"
              icon={SvgArrowLeft}
              aria-label="Previous design variant"
              onClick={() =>
                changeVariant(variants[(variants.indexOf(variant) + 2) % 3]!)
              }
            />
            <div>
              <span className="cdp-eyebrow">Layout study</span>
              <strong>
                {variant} <span>/</span> {variantNames[variant]}
              </strong>
            </div>
            <Button
              prominence="tertiary"
              icon={SvgArrowRight}
              aria-label="Next design variant"
              onClick={() =>
                changeVariant(variants[(variants.indexOf(variant) + 1) % 3]!)
              }
            />
          </div>
          <div className="cdp-state-switch" aria-label="Preview state">
            {reviewStates.map((value) => (
              <Button
                key={value}
                prominence="tertiary"
                size="sm"
                aria-pressed={state === value}
                onClick={() => setState(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          <span className="cdp-review-state" aria-live="polite">
            {state} · {draft.length} draft characters ·{" "}
            {panel ?? "conversation"}
          </span>
        </aside>
      )}
      <span className="cdp-visually-hidden" role="status">
        {notice}
      </span>
    </div>
  );
}
