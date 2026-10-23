import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExecutiveWorkspace, {
  ExecutiveModelAction,
  ExecutiveWelcome,
} from "./ExecutiveWorkspace";
import { useAutomaticBrief, useExecutiveContext } from "@/lib/executive/hooks";
import { createModelHandoff } from "@/lib/executive/model-handoff";
import { SWRConfig } from "swr";

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
    href,
    "aria-expanded": expanded,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: string }) =>
    href ? (
      <a href={href}>{children}</a>
    ) : (
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
  it("does not ask the executive to select a capability", async () => {
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
    expect(await screen.findByText("marketMemorySource")).toBeInTheDocument();
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
      json: async () => ({
        digest: "empty",
        library: { nodes: [], omitted: 0, truncated: false },
      }),
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
  it("refreshes saved memory after provider publication without another chat message", async () => {
    const messages = [
      { type: "user", message: "We want more paid pilots." },
      { type: "assistant", message: "I retained that objective." },
    ];
    (useAutomaticBrief as jest.Mock).mockReturnValue({
      phase: "saved",
      savedMessage: "I retained that objective.",
      retry,
    });
    (useExecutiveContext as jest.Mock).mockReturnValue({
      profileStatus: "PDL professional match loaded",
      research: { status: "running" },
      contextRevision: "pdl-ready",
    });
    const memory = (text: string) => ({
      digest: text,
      library: {
        nodes: [
          { id: "source", type: "message", properties: { text }, evidence: [] },
        ],
        omitted: 0,
        truncated: false,
      },
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => memory("Saved profile claim"),
    });
    const cache = new Map();
    const workspace = () => (
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <ExecutiveWorkspace
          active
          chatId="source-refresh-chat"
          messages={messages}
        >
          <textarea aria-label="Message" />
        </ExecutiveWorkspace>
      </SWRConfig>
    );
    const result = render(workspace());
    expect(await screen.findByText("Saved profile claim")).toBeInTheDocument();
    (useAutomaticBrief as jest.Mock).mockReturnValue({
      phase: "updating",
      savedMessage: "I retained that objective.",
      retry,
    });
    (useExecutiveContext as jest.Mock).mockReturnValue({
      profileStatus: "PDL professional match loaded",
      research: { status: "ready", report: "New research receipt" },
      contextRevision: "pdl-ready,research-ready",
    });
    result.rerender(workspace());
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => memory("Saved research claim"),
    });
    (useAutomaticBrief as jest.Mock).mockReturnValue({
      phase: "saved",
      savedMessage: "I retained that objective.",
      retry,
    });
    result.rerender(workspace());
    expect(await screen.findByText("Saved research claim")).toBeInTheDocument();
    expect(screen.queryByText("Saved profile claim")).not.toBeInTheDocument();
  });
  it("shows loaded profile and research as attributed source context before an interview exists", () => {
    (useExecutiveContext as jest.Mock).mockReturnValue({
      profileStatus: "PDL professional match loaded",
      dossier: {
        profile: { company: "Acme", role: "Founder" },
        source: "pdl",
      },
      research: {
        status: "ready",
        report: "Acme sells paid pilots before broader contracts.",
        source_urls: ["https://acme.example/research", "javascript:alert(1)"],
      },
    });
    render(
      <ExecutiveWorkspace active messages={[]}>
        <textarea aria-label="Message" />
      </ExecutiveWorkspace>
    );
    fireEvent.click(screen.getByRole("button", { name: "Brief" }));
    fireEvent.click(screen.getByRole("button", { name: "Evidence" }));
    expect(screen.getByText("Acme")).toBeVisible();
    expect(screen.getByText("Founder")).toBeVisible();
    expect(screen.getByText("companyProfile.provider")).toBeVisible();
    expect(screen.getByText("publicResearchSource")).toBeVisible();
    expect(screen.getByText("providerClaimNotice")).toBeVisible();
    expect(
      screen.getByText("Acme sells paid pilots before broader contracts.")
    ).toBeVisible();
    expect(
      screen
        .getAllByRole("link", { name: "acme.example" })
        .every(
          (link) =>
            link.getAttribute("href") === "https://acme.example/research"
        )
    ).toBe(true);
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
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

it("shows the available company research when Beca opens instead of an unrelated generic greeting", () => {
  (useExecutiveContext as jest.Mock).mockReturnValue({
    dossier: { profile: { name: "Pat", company: "Acme" }, source: "pdl" },
    research: {
      status: "ready",
      report:
        "# Company research\n\nAcme sells paid pilots before broader contracts.",
      source_urls: ["https://acme.com/products"],
    },
    profileStatus: "PDL professional match loaded · Acme",
  });
  (useAutomaticBrief as jest.Mock).mockReturnValue({ phase: "idle" });
  render(
    <ExecutiveWorkspace active messages={[]}>
      <ExecutiveWelcome />
    </ExecutiveWorkspace>
  );
  expect(screen.getByText(/Acme sells paid pilots/)).toBeVisible();
  expect(screen.getByText(/Pat/)).toBeVisible();
});
