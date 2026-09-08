import * as yup from "yup";

// A display projection of a saved Onyx conversation, never an accepted ontology.
const noteSchema = yup.object({
  text: yup.string().required().trim().min(1).max(600),
  status: yup
    .mixed<"executive" | "research" | "assumption" | "unknown">()
    .oneOf(["executive", "research", "assumption", "unknown"])
    .required(),
  quote: yup.string().required().max(1200).optional(),
  url: yup.string().required().max(2000).optional(),
});
const briefSchema = yup.object({
  version: yup.number().oneOf([1]).required(),
  company: yup.string().required().trim().min(1).max(160),
  objective: noteSchema,
  horizon: yup.string().required().max(160).default("Not established"),
  journey: yup
    .array(
      noteSchema.shape({
        id: yup
          .string()
          .required()
          .matches(/^[a-z0-9_-]{1,50}$/),
        actor: yup.string().required().min(1).max(100),
      })
    )
    .max(8)
    .required(),
  interventions: yup
    .array(
      yup.object({
        text: yup.string().required().min(1).max(240),
        journeyId: yup.string().required().max(50),
        rationale: yup.string().required().min(1).max(500),
      })
    )
    .max(4)
    .default([]),
  conflicts: yup
    .array(
      yup.object({
        text: yup.string().required().min(1).max(400),
        quotes: yup
          .array(yup.string().required().min(1).max(1200))
          .length(2)
          .required(),
      })
    )
    .max(4)
    .default([]),
});
export type InterviewBrief = yup.InferType<typeof briefSchema>;
export type BriefNote = yup.InferType<typeof noteSchema>;
export type InterviewMessage = {
  type: string;
  message: string;
  packets?: readonly { obj: { type: string; content?: string } }[];
  documents?: { link?: string | null; blurb?: string | null }[] | null;
};
export const EXECUTIVE_AGENT_NAME = "Executive interview";
export const isExecutiveAgent = (agent?: { name: string } | null) =>
  agent?.name === EXECUTIVE_AGENT_NAME;
const OPEN = "<interview-brief>";
const CLOSE = "</interview-brief>";
const normalized = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

export function visibleInterviewText(text: string): string {
  const index = text.indexOf(OPEN);
  if (index >= 0) return text.slice(0, index).trimEnd();
  // A streaming packet can end anywhere inside the marker.
  for (let size = Math.min(OPEN.length - 1, text.length); size >= 2; size--) {
    if (text.endsWith(OPEN.slice(0, size)))
      return text.slice(0, -size).trimEnd();
  }
  return text;
}

export function safeSourceUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export type BriefProjection = {
  brief: InterviewBrief | null;
  updateFailed: boolean;
  updating: boolean;
};

export function projectBrief(
  messages: readonly InterviewMessage[]
): BriefProjection {
  let brief: InterviewBrief | null = null;
  let updateFailed = false;
  let updating = false;
  const statements: string[] = [];
  const sources = new Map<string, string>();
  const quoteTurn = (quote?: string) =>
    quote && normalized(quote).length >= 12
      ? statements.findLastIndex((text) => text.includes(normalized(quote)))
      : -1;
  const quoted = (quote?: string) => quoteTurn(quote) >= 0;
  const observedQuote = (quote?: string) => {
    const turn = quoteTurn(quote);
    if (turn < 0) return false;
    // Exact text alone cannot promote explicitly hypothetical or external-case input.
    const context = statements[turn]!;
    return !/\b(?:scenario|hypothetical|hypothesis|assume|suppose|public case|case study|benchmark)\b/.test(
      context
    );
  };
  const ground = <T extends BriefNote>(note: T): T => {
    if (note.status === "executive" && observedQuote(note.quote)) return note;
    const url = safeSourceUrl(note.url);
    if (
      note.status === "research" &&
      url &&
      note.quote &&
      sources.get(url)?.includes(normalized(note.quote))
    )
      return { ...note, url };
    if (note.status === "unknown")
      return { ...note, quote: undefined, url: undefined };
    return { ...note, status: "assumption", quote: undefined, url: undefined };
  };
  for (const message of messages) {
    if (message.type === "user") statements.push(normalized(message.message));
    if (message.type !== "assistant") continue;
    for (const doc of message.documents ?? []) {
      const url = safeSourceUrl(doc.link);
      if (url && doc.blurb) sources.set(url, normalized(doc.blurb));
    }
    const streamed = message.packets
      ?.filter((packet) =>
        ["message_start", "message_delta"].includes(packet.obj.type)
      )
      .map((packet) => packet.obj.content ?? "")
      .join("");
    const text = streamed || message.message;
    const start = text.indexOf(OPEN);
    if (start < 0) continue;
    const markerEnd = text.indexOf(CLOSE, start + OPEN.length);
    // Native Onyx may omit a trailing XML tag from live packets. A terminal
    // packet permits parsing, but only a complete, schema-valid object commits.
    const ended = message.packets?.some((packet) => packet.obj.type === "stop");
    const end = markerEnd < 0 && ended ? text.length : markerEnd;
    updating = end < 0;
    if (updating) continue;
    try {
      const value = briefSchema.validateSync(
        JSON.parse(text.slice(start + OPEN.length, end)),
        { strict: true }
      );
      const ids = new Set(value.journey.map((step) => step.id));
      if (ids.size !== value.journey.length)
        throw new Error("Duplicate journey stages");
      const preserveCorrection = <T extends BriefNote>(
        incoming: T,
        previous?: T
      ): T => {
        if (
          previous?.status === "executive" &&
          (incoming.status !== "executive" ||
            quoteTurn(incoming.quote) < quoteTurn(previous.quote))
        )
          return previous;
        return incoming;
      };
      const objective: BriefNote = preserveCorrection(
        ground(value.objective),
        brief?.objective
      );
      const prior: InterviewBrief | null = brief;
      const horizon: string =
        prior && objective === prior.objective ? prior.horizon : value.horizon;
      brief = {
        ...value,
        objective,
        horizon,
        journey: value.journey.map((step) =>
          preserveCorrection(
            ground(step),
            brief?.journey.find((previous) => previous.id === step.id)
          )
        ),
        conflicts: value.conflicts.filter(
          (conflict) =>
            normalized(conflict.quotes[0]!) !==
              normalized(conflict.quotes[1]!) && conflict.quotes.every(quoted)
        ),
        interventions:
          objective.status === "unknown"
            ? []
            : value.interventions.filter((item) => ids.has(item.journeyId)),
      };
      updateFailed = false;
    } catch {
      updateFailed = true;
    }
  }
  return { brief, updateFailed, updating };
}

export function briefMarkdown(brief: InterviewBrief): string {
  return `# ${brief.company} — interview draft\n\nObjective: ${brief.objective.text} (${brief.objective.status})\nHorizon: ${brief.horizon}\n\n## Customer journey\n\n${brief.journey.map((step, index) => `${index + 1}. ${step.actor}: ${step.text} (${step.status})${step.quote ? `\n   Evidence: “${step.quote}”` : ""}`).join("\n")}\n\n## Proposed interventions\n\n${brief.interventions.map((item) => `- ${item.text}: ${item.rationale}`).join("\n")}\n\nInterview projection only. No operating results or accepted market records are implied.\n`;
}
