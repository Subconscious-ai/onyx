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
export const briefSchema = yup.object({
  version: yup.number().oneOf([1, 2]).required(),
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
  keyResults: yup
    .array(
      yup.object({
        id: yup
          .string()
          .required()
          .matches(/^[a-z0-9_-]{1,50}$/),
        metric: yup.string().required().max(120),
        unit: yup.string().required().max(80),
        direction: yup
          .mixed<"increase" | "decrease" | "maintain">()
          .oneOf(["increase", "decrease", "maintain"])
          .required(),
        baseline: noteSchema,
        target: noteSchema,
        deadline: noteSchema,
        journeyIds: yup
          .array(yup.string().required().max(50))
          .max(8)
          .required(),
      })
    )
    .max(4)
    .optional(),
  transitions: yup
    .array(
      yup.object({
        id: yup
          .string()
          .required()
          .matches(/^[a-z0-9_-]{1,50}$/),
        from: yup.string().required().max(50),
        to: yup.string().required().max(50),
        behavior: noteSchema,
        metric: yup.string().required().max(120),
      })
    )
    .max(12)
    .optional(),
  model: yup
    .object({
      equation: noteSchema,
      inputs: yup
        .array(
          yup.object({
            id: yup
              .string()
              .required()
              .matches(/^[a-z0-9_-]{1,50}$/),
            name: yup.string().required().max(120),
            unit: yup.string().required().max(80),
            value: noteSchema,
          })
        )
        .max(16)
        .required(),
      gaps: yup
        .array(
          yup.object({
            text: yup.string().required().max(240),
            impact: yup.string().required().max(400),
            parked: yup.boolean().required(),
          })
        )
        .max(8)
        .required(),
    })
    .optional()
    .default(undefined),
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
  [EXECUTIVE_AGENT_NAME, "Burn 2.0"].includes(agent?.name ?? "");
const OPEN = "<interview-brief>";
const CLOSE = "</interview-brief>";
const normalized = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

export function visibleInterviewText(text: string): string {
  text = text
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((part) =>
      part.startsWith("`") ? part : part.replace(/\s*—\s*/g, ", ")
    )
    .join("");
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

export function interviewMessageText(message: InterviewMessage): string {
  const streamed = message.packets
    ?.filter((packet) =>
      ["message_start", "message_delta"].includes(packet.obj.type)
    )
    .map((packet) => packet.obj.content ?? "")
    .join("");
  return message.message.includes(CLOSE)
    ? message.message
    : streamed || message.message;
}

export type BriefProjection = {
  brief: InterviewBrief | null;
  updateFailed: boolean;
  updating: boolean;
  stale: boolean;
};

export function projectBrief(
  messages: readonly InterviewMessage[]
): BriefProjection {
  let brief: InterviewBrief | null = null;
  let updateFailed = false;
  let updating = false;
  let preparedAt = 0;
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
    const text = interviewMessageText(message);
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
      const unique = (items: { id: string }[]) =>
        new Set(items.map((item) => item.id)).size === items.length;
      if (
        !unique(value.keyResults ?? []) ||
        !unique(value.transitions ?? []) ||
        !unique(value.model?.inputs ?? [])
      )
        throw new Error("Duplicate model identifiers");
      if (
        value.keyResults?.some((item) =>
          item.journeyIds.some((id) => !ids.has(id))
        ) ||
        value.transitions?.some(
          (item) =>
            !ids.has(item.from) || !ids.has(item.to) || item.from === item.to
        )
      )
        throw new Error("Invalid journey references");
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
        keyResults: value.keyResults?.map(
          (item): NonNullable<InterviewBrief["keyResults"]>[number] => {
            // SAFETY: prior is the last schema-validated brief; the assertion prevents closure narrowing to never.
            const previous:
              | NonNullable<InterviewBrief["keyResults"]>[number]
              | undefined = (prior as InterviewBrief | null)?.keyResults?.find(
              (kr) => kr.id === item.id
            );
            return {
              ...item,
              baseline: preserveCorrection(
                ground(item.baseline),
                previous?.baseline
              ),
              target: preserveCorrection(ground(item.target), previous?.target),
              deadline: preserveCorrection(
                ground(item.deadline),
                previous?.deadline
              ),
            };
          }
        ),
        transitions: value.transitions?.map((item) => ({
          ...item,
          behavior: ground(item.behavior),
        })),
        model: value.model
          ? {
              ...value.model,
              // A proposed equation never establishes a measured causal effect.
              equation: {
                ...value.model.equation,
                status: "assumption",
                quote: undefined,
                url: undefined,
              },
              // SAFETY: prior is schema-validated and optional; no new data is asserted.
              inputs: value.model.inputs.map((item) => ({
                ...item,
                value: preserveCorrection(
                  ground(item.value),
                  (prior as InterviewBrief | null)?.model?.inputs.find(
                    (previous) => previous.id === item.id
                  )?.value
                ),
              })),
            }
          : undefined,
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
      preparedAt = statements.length;
    } catch {
      updateFailed = true;
    }
  }
  return {
    brief,
    updateFailed,
    updating,
    stale: brief !== null && preparedAt < statements.length,
  };
}

export function briefMarkdown(brief: InterviewBrief): string {
  const note = (item: BriefNote) =>
    `${item.text} [${item.status}]${item.quote ? ` — source quote: “${item.quote}”` : ""}${item.url ? ` (${item.url})` : ""}`;
  return (
    [
      `# ${brief.company} — Burn 2.0 model brief`,
      `Objective: ${note(brief.objective)}\nHorizon: ${brief.horizon}`,
      `## Key results\n${(brief.keyResults ?? []).map((kr) => `- ${kr.metric} (${kr.unit}; ${kr.direction})\n  Baseline: ${note(kr.baseline)}\n  Target: ${note(kr.target)}\n  Deadline: ${note(kr.deadline)}\n  Journey: ${kr.journeyIds.join(", ")}`).join("\n") || "Not established"}`,
      `## Customer journey\n${brief.journey.map((step) => `- ${step.id} · ${step.actor}: ${note(step)}`).join("\n")}`,
      `## Behavior transitions\n${(brief.transitions ?? []).map((edge) => `- ${edge.from} → ${edge.to}: ${note(edge.behavior)}; measure ${edge.metric}`).join("\n")}`,
      `## Proposed model\n${brief.model ? note(brief.model.equation) : "Structure not established"}`,
      ...(brief.model?.inputs.map(
        (input) => `- ${input.name} (${input.unit}): ${note(input.value)}`
      ) ?? []),
      `## Material unknowns\n${brief.model?.gaps.map((gap) => `- ${gap.text}: ${gap.impact}${gap.parked ? " (parked; do not repeat)" : ""}`).join("\n") ?? "Not assessed"}`,
      `## Experiment candidates\n${brief.interventions.map((item) => `- ${item.text} (${item.journeyId}): ${item.rationale}`).join("\n")}`,
      "Draft for review. Targets are not observations. Proposed relationships are not measured causal effects. Missing operating inputs remain unknown. No accepted market records or completed experiments are implied.",
    ].join("\n\n") + "\n"
  );
}

export type ModelReadiness = { ready: boolean; missing: string[] };
export function modelReadiness(brief: InterviewBrief | null): ModelReadiness {
  const missing: string[] = [];
  if (!brief || brief.objective.status !== "executive")
    missing.push("An executive objective");
  if (
    !brief?.keyResults?.some(
      (kr) =>
        kr.target.status === "executive" && kr.deadline.status === "executive"
    )
  )
    missing.push("A measurable target and deadline");
  if ((brief?.journey.length ?? 0) < 2)
    missing.push("Customer behavior before and after a decision");
  if (!brief?.transitions?.length)
    missing.push("A behavior transition linked to a measure");
  if (!brief?.model?.equation.text || !brief.model.inputs.length)
    missing.push("A proposed driver equation and named inputs");
  if (brief?.conflicts.length)
    missing.push("Resolution of conflicting executive statements");
  return { ready: missing.length === 0, missing };
}
