import {
  projectBrief,
  modelReadiness,
  visibleInterviewText,
  type InterviewMessage,
} from "./brief";

const statement =
  "The priority is reducing time to first value over the next six months.";
const draft = {
  version: 1,
  company: "Example software company",
  objective: {
    text: "Reduce time to first value",
    status: "executive",
    quote: statement,
  },
  horizon: "Six months",
  journey: [
    {
      id: "activate",
      actor: "Administrator",
      text: "Completes the first workflow",
      status: "assumption",
    },
  ],
  interventions: [],
  conflicts: [],
};
const answer = (value: unknown): InterviewMessage => ({
  type: "assistant",
  message: `**Sarah · Journey**\nWhat prevents the first workflow?\n\n<interview-brief>${JSON.stringify(value)}</interview-brief>`,
});
const history: InterviewMessage[] = [
  { type: "user", message: statement },
  answer(draft),
];

describe("executive brief provenance and reload", () => {
  test("reconstructs the private objective and behavioral journey from persisted conversation", () => {
    const restored = projectBrief(JSON.parse(JSON.stringify(history)));
    expect(restored.brief?.objective.status).toBe("executive");
    expect(restored.brief?.journey[0]?.text).toBe(
      "Completes the first workflow"
    );
    expect(restored.brief?.journey[0]?.status).toBe("assumption");
  });
  test("updates immediately from native streaming packets before cached message text is saved", () => {
    const live = {
      ...answer(draft),
      message: "",
      packets: [
        { obj: { type: "message_start", content: "**Sarah · Journey**" } },
        {
          obj: {
            type: "message_delta",
            content: `<interview-brief>${JSON.stringify(draft)}</interview-brief>`,
          },
        },
      ],
    };
    expect(projectBrief([history[0]!, live]).brief?.objective.status).toBe(
      "executive"
    );
  });
  test("native stream completion can finish a valid brief when a trailing closing tag is omitted", () => {
    const live = {
      type: "assistant",
      message: "",
      packets: [
        {
          obj: {
            type: "message_delta",
            content: `<interview-brief>${JSON.stringify(draft)}`,
          },
        },
        { obj: { type: "stop" } },
      ],
    };
    const result = projectBrief([history[0]!, live]);
    expect(result.brief?.objective.status).toBe("executive");
    expect(result.updating).toBe(false);
  });
  test("refuses fabricated executive attribution and unsupported public citations", () => {
    const result = projectBrief([
      answer({
        ...draft,
        objective: {
          text: "Double revenue",
          status: "research",
          url: "https://invented.example/",
        },
      }),
    ]);
    expect(result.brief?.objective.status).toBe("assumption");
    expect(projectBrief([answer(draft)]).brief?.objective.status).toBe(
      "assumption"
    );
  });
  test("retains the last valid brief during an interrupted or malformed update", () => {
    expect(
      projectBrief([
        ...history,
        { type: "assistant", message: "<interview-brief>{" },
      ]).brief
    ).toEqual(projectBrief(history).brief);
    expect(
      projectBrief([...history, answer({ ...draft, journey: "broken" })])
        .updateFailed
    ).toBe(true);
  });
  test("accepts a later executive correction without looking at an unrelated conversation", () => {
    const corrected = "The priority has changed to improving pilot conversion.";
    const result = projectBrief([
      ...history,
      { type: "user", message: corrected },
      answer({
        ...draft,
        objective: {
          text: "Improve pilot conversion",
          status: "executive",
          quote: corrected,
        },
      }),
    ]);
    expect(result.brief?.objective.text).toBe("Improve pilot conversion");
    expect(projectBrief([]).brief).toBeNull();
  });
  test("a later ungrounded rewrite cannot erase the stated executive objective", () => {
    const result = projectBrief([
      ...history,
      answer({
        ...draft,
        objective: { text: "Double revenue", status: "assumption" },
        horizon: "Not established",
      }),
    ]);
    expect(result.brief?.objective.text).toBe("Reduce time to first value");
    expect(result.brief?.objective.status).toBe("executive");
    expect(result.brief?.horizon).toBe("Six months");
  });
  test("a quoted old priority cannot override a more recent executive correction", () => {
    const correction = "The current priority is improving pilot conversion.";
    const corrected = answer({
      ...draft,
      objective: {
        text: "Improve pilot conversion",
        status: "executive",
        quote: correction,
      },
    });
    expect(
      projectBrief([
        ...history,
        { type: "user", message: correction },
        corrected,
        answer(draft),
      ]).brief?.objective.text
    ).toBe("Improve pilot conversion");
  });
  test("research attribution requires an exact retrieved excerpt at the original URL", () => {
    const text = "The platform supports hospital administration.";
    const objective = {
      text: "Hospital administration",
      status: "research",
      quote: text,
      url: "https://example.org/product",
    };
    expect(
      projectBrief([
        {
          ...answer({ ...draft, objective }),
          documents: [{ link: objective.url, blurb: text }],
        },
      ]).brief?.objective.status
    ).toBe("research");
    expect(
      projectBrief([
        {
          ...answer({
            ...draft,
            objective: { ...objective, url: "javascript:alert(1)" },
          }),
          documents: [{ link: "javascript:alert(1)", blurb: text }],
        },
      ]).brief?.objective.status
    ).toBe("assumption");
  });
  test("a contradiction requires two distinct quotes actually present in executive evidence", () => {
    const conflict = {
      text: "Different priorities",
      quotes: [statement, "An invented conflicting answer"],
    };
    expect(
      projectBrief([...history, answer({ ...draft, conflicts: [conflict] })])
        .brief?.conflicts
    ).toEqual([]);
  });
  test("interventions must reference an existing journey transition and an explicit objective", () => {
    const result = projectBrief([
      ...history,
      answer({
        ...draft,
        interventions: [
          {
            text: "Simplify activation",
            journeyId: "missing",
            rationale: "Reduce time to value",
          },
        ],
      }),
    ]);
    expect(result.brief?.interventions).toEqual([]);
  });
  test("never streams metadata into the visible question, including a split opening marker", () => {
    expect(visibleInterviewText("A question?\n<interview-br")).toBe(
      "A question?"
    );
    expect(visibleInterviewText(answer(draft).message)).toBe(
      "**Sarah · Journey**\nWhat prevents the first workflow?"
    );
    expect(visibleInterviewText("Use <table> for a comparison.")).toBe(
      "Use <table> for a comparison."
    );
  });
});

describe("hypothesis attribution", () => {
  const quote = "Operations managers publish schedules every Monday.";
  const proposed = {
    ...draft,
    journey: [
      {
        id: "schedule",
        actor: "Operations manager",
        text: quote,
        status: "executive",
        quote,
      },
    ],
  };
  test("a later demand scenario does not erase the stated implementation journey", () => {
    const journey =
      "Enterprise sponsors approve a scoped implementation, our consultants deliver it, then the sponsor accepts completion.";
    const source =
      journey + " Demand is sufficient to fill capacity in this scenario.";
    const result = projectBrief([
      { type: "user", message: source },
      answer({
        ...draft,
        journey: [
          {
            id: "approval",
            actor: "Enterprise sponsors",
            text: "approve a scoped implementation",
            status: "executive",
            quote: source,
          },
        ],
      }),
    ]);
    expect(result.brief?.journey[0]?.status).toBe("executive");
    expect(result.brief?.journey[0]?.quote).toBe(journey);
  });
  test.each([
    `For a hypothetical scenario, use the following journey. ${quote}`,
    `In this scenario, ${quote}`,
    `A competitor describes their sales process. ${quote} Demand fills capacity in this scenario.`,
    `A colleague quotes a competitor: "Their sales process follows. ${quote}" Demand fills capacity in this scenario.`,
    `A competitor says ${quote} Demand fills capacity in this scenario.`,
    `"${quote.slice(0, -1)}". Demand fills capacity in this scenario.`,
    `'${quote.slice(0, -1)}'. Demand fills capacity in this scenario.`,
    `“${quote.slice(0, -1)}”. Demand fills capacity in this scenario.`,
  ])(
    "clause recovery does not promote hypothetical or external journey: %s",
    (source) => {
      const result = projectBrief([
        { type: "user", message: source },
        answer({
          ...proposed,
          journey: [
            {
              ...proposed.journey[0]!,
              text: quote.slice(0, -1),
              quote: source,
            },
          ],
        }),
      ]);
      expect(result.brief?.journey[0]?.status).toBe("assumption");
    }
  );
  test("a quoted scenario cannot become observed customer behavior", () => {
    const result = projectBrief([
      { type: "user", message: `For a scenario only: ${quote}` },
      answer(proposed),
    ]);
    expect(result.brief?.journey[0]?.status).toBe("assumption");
  });
  test("a public case repeated by an executive cannot become company evidence", () => {
    const result = projectBrief([
      {
        type: "user",
        message: `A public case describes the following: ${quote}`,
      },
      answer(proposed),
    ]);
    expect(result.brief?.journey[0]?.status).toBe("assumption");
  });
  test("later observed evidence can replace the earlier scenario", () => {
    const result = projectBrief([
      { type: "user", message: `Scenario only: ${quote}` },
      answer(proposed),
      {
        type: "user",
        message: `The actual usage log confirms the behavior. ${quote}`,
      },
      answer(proposed),
    ]);
    expect(result.brief?.journey[0]?.status).toBe("executive");
  });
});

describe("Burn 2.0 model handoff", () => {
  const targetQuote =
    "The annual renewal target is 90 percent by December 2027.";
  const v2 = {
    ...draft,
    version: 2,
    keyResults: [
      {
        id: "renewal",
        metric: "Annual renewal",
        unit: "percent",
        direction: "increase",
        baseline: { text: "Unknown", status: "unknown" },
        target: { text: "90 percent", status: "executive", quote: targetQuote },
        deadline: {
          text: "December 2027",
          status: "executive",
          quote: targetQuote,
        },
        journeyIds: ["activate"],
      },
    ],
    transitions: [],
    model: {
      equation: {
        text: "Eligible customers × renewal rate",
        status: "assumption",
      },
      inputs: [
        {
          id: "eligible",
          name: "Eligible customers",
          unit: "customers",
          value: { text: "Unknown", status: "unknown" },
        },
      ],
      gaps: [
        {
          text: "Eligible customer count",
          impact: "Required for a numeric renewal forecast",
          parked: true,
        },
      ],
    },
  };
  test("retains a usable symbolic draft without inventing a numeric baseline", () => {
    const result = projectBrief([
      ...history,
      { type: "user", message: targetQuote },
      answer(v2),
    ]);
    expect(result.updateFailed).toBe(false);
    expect(result.brief?.keyResults?.[0]?.baseline.status).toBe("unknown");
    expect(result.brief?.keyResults?.[0]?.target.status).toBe("executive");
    expect(result.brief?.model?.equation.status).toBe("assumption");
  });
  test("allows a named success measure and journey to build a symbolic model with unknown targets", () => {
    const symbolic = projectBrief([
      ...history,
      answer({
        ...v2,
        keyResults: [
          {
            ...v2.keyResults[0],
            target: { text: "Unknown", status: "unknown" },
            deadline: { text: "Unknown", status: "unknown" },
          },
        ],
        journey: [
          ...v2.journey,
          {
            id: "renew",
            actor: "Administrator",
            text: "Renews",
            status: "assumption",
          },
        ],
        transitions: [
          {
            id: "renewal",
            from: "activate",
            to: "renew",
            behavior: { text: "Chooses to renew", status: "assumption" },
            metric: "Annual renewal",
          },
        ],
      }),
    ]).brief;
    expect(modelReadiness(symbolic).ready).toBe(true);
    expect(symbolic?.keyResults?.[0]?.target.status).toBe("unknown");
    expect(
      modelReadiness(symbolic && { ...symbolic, keyResults: [] }).ready
    ).toBe(false);
  });
  test("a quoted scenario cannot become a company baseline or target", () => {
    const quote = "Assume a renewal baseline of 80 percent for a scenario.";
    const result = projectBrief([
      ...history,
      { type: "user", message: quote },
      answer({
        ...v2,
        keyResults: [
          {
            ...v2.keyResults[0],
            baseline: { text: "80 percent", status: "executive", quote },
          },
        ],
      }),
    ]);
    expect(result.brief?.keyResults?.[0]?.baseline.status).toBe("assumption");
    expect(result.brief?.keyResults?.[0]?.target.status).toBe("assumption");
  });
  test("rejects dangling journey and key result links without replacing the previous brief", () => {
    const result = projectBrief([
      ...history,
      answer({
        ...v2,
        transitions: [
          {
            id: "missing",
            from: "activate",
            to: "missing",
            behavior: { text: "Renews", status: "assumption" },
            metric: "Renewal rate",
          },
        ],
      }),
    ]);
    expect(result.updateFailed).toBe(true);
    expect(result.brief?.version).toBe(1);
  });
  test("retains a corrected target when a later model response cites an older answer", () => {
    const corrected =
      "The annual renewal target is 95 percent by December 2027.";
    const updated = {
      ...v2,
      keyResults: [
        {
          ...v2.keyResults[0],
          target: { text: "95 percent", status: "executive", quote: corrected },
        },
      ],
    };
    const result = projectBrief([
      ...history,
      { type: "user", message: targetQuote },
      answer(v2),
      { type: "user", message: corrected },
      answer(updated),
      answer(v2),
    ]);
    expect(result.brief?.keyResults?.[0]?.target.text).toBe("95 percent");
  });
});

test("a new executive answer marks the saved model brief stale until preparation", () => {
  expect(
    projectBrief([
      ...history,
      { type: "user", message: "The target has changed." },
    ]).stale
  ).toBe(true);
  expect(projectBrief(history).stale).toBe(false);
});

test("uses the prepared saved brief instead of older native answer packets", () => {
  const saved = answer(draft);
  saved.packets = [
    {
      obj: {
        type: "message_start",
        content: "The spoken answer before preparation.",
      },
    },
    { obj: { type: "stop" } },
  ];
  const result = projectBrief([{ type: "user", message: statement }, saved]);
  expect(result.brief?.objective.text).toBe("Reduce time to first value");
});

// Product typography must not rewrite saved evidence or executable examples.
it("removes em dashes from spoken prose while retaining fenced code", () => {
  expect(
    visibleInterviewText("Baseline unknown—target retained.\n```\nx = '—'\n```")
  ).toBe("Baseline unknown, target retained.\n```\nx = '—'\n```");
});

describe("source URL citations", () => {
  const url = "https://example.org/experiments/result?view=summary#effect";
  const marker = `【${url}】`;

  test("makes a completed source marker usable by the native link renderer", () => {
    expect(visibleInterviewText(`Source: experiment run${marker}`)).toBe(
      `Source: experiment run[example.org](<${url}>)`
    );
  });

  test("keeps source examples in code and unfinished streaming markers intact", () => {
    const text = `\`${marker}\`\n\`\`\`text\n${marker}\n\`\`\`\nSource: 【${url}`;
    expect(visibleInterviewText(text)).toBe(text);
  });

  test.each([
    "``MARKER``",
    "~~~text\nMARKER\n~~~",
    "    MARKER",
    "````text\nMARKER\n````",
    "[MARKER](https://example.org/other)",
  ])("keeps Markdown code and existing link labels intact: %s", (template) => {
    const text = template.replace("MARKER", marker);
    expect(visibleInterviewText(text)).toBe(text);
  });

  test("preserves numbered citations and refuses credential-bearing URL markers", () => {
    const text =
      "Result [[1]](https://example.org/run), 【2】, 【https://user:password@example.org/run】, 【javascript:alert(1)】";
    expect(visibleInterviewText(text)).toBe(text);
  });
});
