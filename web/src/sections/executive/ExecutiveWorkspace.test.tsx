import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExecutiveWorkspace, {
  ExecutiveModelAction,
  ExecutiveWelcome,
} from "./ExecutiveWorkspace";
import { useAutomaticBrief, useExecutiveContext } from "@/lib/executive/hooks";
import { createModelHandoff } from "@/lib/executive/model-handoff";

jest.mock("@/lib/executive/model-handoff", () => ({
  ...jest.requireActual("@/lib/executive/model-handoff"),
  createModelHandoff: jest.fn(),
}));

jest.mock("@/lib/executive/hooks", () => ({
  useAutomaticBrief: jest.fn(),
  useExecutiveContext: jest.fn(),
}));
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@opal/components", () => ({
  Text: ({
    as: Tag = "span",
    children,
  }: {
    as?: React.ElementType;
    children?: React.ReactNode;
  }) => <Tag>{children}</Tag>,
  Button: ({
    children,
    onClick,
    disabled,
    "aria-expanded": expanded,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} aria-expanded={expanded}>
      {children}
    </button>
  ),
}));
jest.mock("@opal/layouts", () => ({ Content: () => null }));
jest.mock("@opal/utils", () => ({
  richNodes: (value: unknown) => value,
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));
jest.mock("@opal/icons", () => ({
  SvgArrowUpRight: () => null,
  SvgCheck: () => null,
  SvgDownload: () => null,
}));

describe("conversation-first brief access", () => {
  it("does not ask the executive to select a capability", () => {
    render(
      <ExecutiveWorkspace active messages={[]}>
        <textarea aria-label="Message" />
        <ExecutiveModelAction />
      </ExecutiveWorkspace>
    );
    expect(
      screen.queryByRole("button", { name: "actions.open" })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeVisible();
  });
  const retry = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    (useExecutiveContext as jest.Mock).mockReturnValue({
      profileStatus: "PDL: no confident match",
      research: { status: "needs_company" },
    });
    (useAutomaticBrief as jest.Mock).mockReturnValue({ phase: "idle", retry });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "not_found" }),
    });
  });
  it("shows extracted evidence alongside chat and preserves composer text on mobile return", async () => {
    render(
      <ExecutiveWorkspace active messages={[]}>
        <textarea aria-label="Message" defaultValue="Retain this draft" />
      </ExecutiveWorkspace>
    );
    expect(screen.getByLabelText("workingBusinessBrief")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Brief" }));
    expect(screen.getByLabelText("workingBusinessBrief")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText("PDL: no confident match")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: "Conversation" }));
    expect(screen.getByLabelText("Message")).toHaveValue("Retain this draft");
    expect(screen.getByLabelText("Message")).toBeVisible();
  });
  it("keeps extraction failure and retry reachable without a permanent chat footer", async () => {
    (useAutomaticBrief as jest.Mock).mockReturnValue({ phase: "error", retry });
    render(
      <ExecutiveWorkspace active messages={[]}>
        <textarea aria-label="Message" />
        <ExecutiveModelAction />
      </ExecutiveWorkspace>
    );
    expect(
      screen.getByRole("button", { name: "retryDraft" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Brief · retry" }));
    fireEvent.click(screen.getByRole("button", { name: "retryDraft" }));
    expect(retry).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByText("PDL: no confident match")).toBeInTheDocument()
    );
  });

  it("keeps saved model recovery available while the new brief cannot be prepared", () => {
    process.env.NEXT_PUBLIC_BURN_MODEL_WORKSPACE =
      "https://causl.example/dashboard/burn-import";
    const recover = jest.fn();
    const connection = { recover, open: jest.fn(), dispose: jest.fn() };
    jest
      .mocked(createModelHandoff)
      .mockReturnValue(
        connection as unknown as ReturnType<typeof createModelHandoff>
      );
    (useAutomaticBrief as jest.Mock).mockReturnValue({ phase: "error", retry });
    const result = render(
      <ExecutiveWorkspace active chatId="saved-chat" messages={[]}>
        <textarea aria-label="Message" />
        <ExecutiveModelAction />
      </ExecutiveWorkspace>
    );
    fireEvent.click(screen.getByRole("button", { name: "Brief · retry" }));
    fireEvent.click(screen.getByRole("button", { name: "modelSavedOpen" }));
    expect(recover).toHaveBeenCalledTimes(1);
    expect(connection.open).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    result.unmount();
    delete process.env.NEXT_PUBLIC_BURN_MODEL_WORKSPACE;
  });

  it("transfers interview, dossier and research through the existing model button", () => {
    process.env.NEXT_PUBLIC_BURN_MODEL_WORKSPACE =
      "https://causl.example/dashboard/burn-import";
    window.history.replaceState({}, "", "?chatId=saved-chat");
    const open = jest.fn();
    jest
      .mocked(createModelHandoff)
      .mockReturnValue({ open, dispose: jest.fn() } as unknown as ReturnType<
        typeof createModelHandoff
      >);
    const dossier = { profile: { company: "Acme" }, source: "pdl" };
    const research = {
      status: "ready",
      report: "Public buyer research",
      source_urls: ["https://example.com/research"],
    };
    (useExecutiveContext as jest.Mock).mockReturnValue({ dossier, research });
    const quote = "Our goal is 100 dollars in revenue by 2027.";
    const note = { text: quote, status: "executive", quote };
    const brief = {
      version: 2,
      company: "Acme",
      objective: note,
      horizon: "2027",
      journey: [
        {
          id: "discover",
          actor: "Buyer",
          text: "Discovers product",
          status: "assumption",
        },
        {
          id: "buy",
          actor: "Buyer",
          text: "Buys product",
          status: "assumption",
        },
      ],
      transitions: [
        {
          id: "purchase",
          from: "discover",
          to: "buy",
          behavior: { text: "Chooses to buy", status: "assumption" },
          metric: "Purchase rate",
        },
      ],
      keyResults: [
        {
          id: "revenue",
          metric: "Revenue",
          unit: "USD",
          direction: "increase",
          baseline: { text: "Unknown", status: "unknown" },
          target: note,
          deadline: note,
          journeyIds: ["buy"],
        },
      ],
      model: {
        equation: {
          text: "Revenue = buyers times price",
          status: "assumption",
        },
        inputs: [
          {
            id: "buyers",
            name: "Buyers",
            unit: "customers",
            value: { text: "Unknown", status: "unknown" },
          },
        ],
        gaps: [],
      },
      interventions: [],
      conflicts: [],
    };
    const messages = [
      { type: "user", message: quote },
      {
        type: "assistant",
        message: `<interview-brief>${JSON.stringify(brief)}</interview-brief>`,
      },
    ];
    const result = render(
      <ExecutiveWorkspace active chatId="saved-chat" messages={messages}>
        <textarea aria-label="Message" />
        <ExecutiveModelAction />
      </ExecutiveWorkspace>
    );
    // A ready model must be reachable directly from the conversation.
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        messages,
        businessContext: {
          profile: dossier.profile,
          profileSource: "pdl",
          research,
        },
      })
    );
    result.unmount();
    window.history.replaceState({}, "", "/");
    delete process.env.NEXT_PUBLIC_BURN_MODEL_WORKSPACE;
  });
});

it("opens with the interviewer question without a customer start command", () => {
  render(<ExecutiveWelcome />);
  expect(screen.getByText("openingQuestion")).toBeVisible();
});
