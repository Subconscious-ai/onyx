import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExecutiveWorkspace, {
  ExecutiveModelAction,
  ExecutiveWelcome,
} from "./ExecutiveWorkspace";
import { useAutomaticBrief, useExecutiveContext } from "@/lib/executive/hooks";
import { createModelHandoff } from "@/lib/executive/model-handoff";
import { useAskAssistant } from "@/app/app/message/messageComponents/AskAssistantContext";

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
    ref,
    type = "button",
    "aria-label": label,
    "aria-expanded": expanded,
    "aria-controls": controls,
    "aria-describedby": describedBy,
  }: React.ComponentPropsWithRef<"button">) => (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-describedby={describedBy}
    >
      {children}
    </button>
  ),
  Modal: jest.requireActual("@opal/components/modal/components").Modal,
  InputTypeIn: ({
    variant,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & { variant?: string }) => (
    <input {...props} disabled={variant === "disabled"} />
  ),
}));
jest.mock("@opal/layouts", () => ({
  Content: ({ title }: { title?: React.ReactNode }) => <span>{title}</span>,
  Section: ({ children, ref }: React.ComponentPropsWithRef<"div">) => (
    <div ref={ref}>{children}</div>
  ),
}));
jest.mock("@opal/utils", () => ({
  richNodes: (value: unknown) => value,
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));
jest.mock("@opal/icons", () => ({
  SvgAlertCircle: () => <svg aria-hidden="true" />,
  SvgArrowUpRight: () => null,
  SvgCheck: () => null,
  SvgDownload: () => null,
  SvgLoader: () => <svg aria-hidden="true" />,
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
      json: async () => ({
        digest: "test",
        library: { nodes: [], omitted: 0, truncated: false },
      }),
    });
  });
  it("delivers research that finishes after the saved brief once per job and chat", async () => {
    const note = {
      text: "Grow renewals",
      status: "executive",
      quote: "Grow renewals",
    };
    const message = `<interview-brief>${JSON.stringify({ version: 1, company: "Example", objective: note, horizon: "Unknown", journey: [], interventions: [], conflicts: [] })}</interview-brief>`;
    const messages = [
      { type: "user", message: "Grow renewals" },
      { type: "assistant", message },
    ];
    (useAutomaticBrief as jest.Mock).mockReturnValue({
      phase: "saved",
      savedMessage: message,
      retry,
    });
    const context = {
      profileStatus: "PDL ready",
      research: { status: "running", job_id: "native-job" },
    };
    (useExecutiveContext as jest.Mock).mockReturnValue(context);
    const { rerender } = render(
      <ExecutiveWorkspace active chatId="chat-one" messages={messages}>
        <span>Chat</span>
      </ExecutiveWorkspace>
    );
    expect(retry).not.toHaveBeenCalled();
    context.research = { status: "ready", job_id: "native-job" };
    rerender(
      <ExecutiveWorkspace active chatId="chat-one" messages={messages}>
        <span>Chat</span>
      </ExecutiveWorkspace>
    );
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(
      <ExecutiveWorkspace active chatId="chat-one" messages={messages}>
        <span>Chat</span>
      </ExecutiveWorkspace>
    );
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(
      <ExecutiveWorkspace active chatId="chat-two" messages={messages}>
        <span>Chat</span>
      </ExecutiveWorkspace>
    );
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(2));
  });
  it("opens the brief as a modal and returns focus without losing the conversation draft", async () => {
    render(
      <ExecutiveWorkspace active messages={[]}>
        <textarea aria-label="Message" />
      </ExecutiveWorkspace>
    );
    const composer = screen.getByLabelText("Message");
    fireEvent.change(composer, { target: { value: "Retain this draft" } });
    const trigger = screen.getByRole("button", {
      name: "briefControl",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute("aria-controls");
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "workingBusinessBrief",
    });
    expect(dialog).toBeVisible();
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    await waitFor(() =>
      expect(screen.getByText("PDL: no confident match")).toBeInTheDocument()
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).not.toHaveAttribute("aria-controls");
    expect(screen.getByLabelText("Message")).toBe(composer);
    expect(screen.getByLabelText("Message")).toHaveValue("Retain this draft");
    expect(screen.getByLabelText("Message")).toBeVisible();
  });
  it("shows brief updates and failures before opening the brief without losing the conversation draft", () => {
    (useAutomaticBrief as jest.Mock).mockReturnValue({
      phase: "waiting",
      retry,
    });
    const content = (
      <ExecutiveWorkspace active messages={[]}>
        <textarea aria-label="Message" />
      </ExecutiveWorkspace>
    );
    const { rerender } = render(content);
    const composer = screen.getByLabelText("Message");
    fireEvent.change(composer, { target: { value: "Retain this draft" } });
    const trigger = screen.getByRole("button", { name: "briefControl" });

    expect(screen.getByRole("status")).toHaveTextContent("progress.updating");
    expect(screen.getByRole("status")).toBeVisible();
    expect(trigger).toHaveAccessibleDescription("progress.updating");

    for (const phase of ["updating", "error", "saved"]) {
      (useAutomaticBrief as jest.Mock).mockReturnValue({ phase, retry });
      rerender(
        <ExecutiveWorkspace active messages={[]}>
          <textarea aria-label="Message" />
        </ExecutiveWorkspace>
      );
      const status =
        phase === "error"
          ? "progress.failed"
          : phase === "updating"
            ? "progress.updating"
            : "";
      if (status) expect(screen.getByRole("status")).toHaveTextContent(status);
      else expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(trigger).toHaveAccessibleDescription(status);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Message")).toBe(composer);
      expect(composer).toHaveValue("Retain this draft");
    }
  });
  it("retains correction input and the failed refresh operation when the brief reopens", async () => {
    const reload = jest.fn();
    (useExecutiveContext as jest.Mock).mockReturnValue({
      profile: {
        profile: { company: "Example" },
        checked_at: 10,
        correction: { revision: 3, fields: {} },
      },
      research: { status: "needs_company" },
      reload,
    });
    // POST /api/chat/executive-profile loses the first refresh response.
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockImplementationOnce(async (_url, request) => ({
        ok: true,
        json: async () => ({
          job_id: JSON.parse(request.body).operation_id,
          preparation_status: "ready",
        }),
      }));
    global.fetch = fetcher;
    render(
      <ExecutiveWorkspace active messages={[]}>
        <textarea aria-label="Message" />
      </ExecutiveWorkspace>
    );
    fireEvent.click(screen.getByRole("button", { name: "briefControl" }));
    fireEvent.click(screen.getByText("researchContextAndLenses"));
    fireEvent.click(screen.getByRole("button", { name: "title" }));
    fireEvent.change(screen.getByLabelText("fields.company"), {
      target: { value: "Corrected company" },
    });
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("refreshFailed")
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(screen.queryByLabelText("fields.company")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "briefControl" }));
    fireEvent.click(screen.getByText("researchContextAndLenses"));
    expect(screen.getByLabelText("fields.company")).toHaveValue(
      "Corrected company"
    );
    expect(screen.getByRole("alert")).toHaveTextContent("refreshFailed");
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
    expect(screen.getByLabelText("fields.company")).toHaveValue(
      "Corrected company"
    );
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(screen.queryByLabelText("fields.company")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "title" }));
    expect(screen.getByLabelText("fields.company")).toHaveValue("Example");
  });
  it.each([
    {
      action: "exploreTheFriction",
      tab: null,
      request:
        "Focus on the journey stage “Renews subscription”. Identify the most consequential missing private context before proposing an intervention.",
    },
    {
      action: "shapeAnExperiment",
      tab: "Next moves",
      request:
        "Explore the proposed intervention “Test a renewal reminder”. Define the behavior to change, the evidence required, and a practical experiment. No experiment execution without an explicit instruction.",
    },
  ])(
    "returns to the mounted conversation after $action",
    async ({ action, tab, request }) => {
      const onAsk = jest.fn();
      const brief = {
        version: 1,
        company: "Example",
        objective: { text: "Grow renewals", status: "assumption" },
        horizon: "2027",
        journey: [
          {
            id: "renew",
            actor: "Buyer",
            text: "Renews subscription",
            status: "assumption",
          },
        ],
        interventions: [
          {
            text: "Test a renewal reminder",
            journeyId: "renew",
            rationale: "Check the proposed renewal support.",
          },
        ],
        conflicts: [],
      };
      render(
        <ExecutiveWorkspace
          active
          onAsk={onAsk}
          messages={[
            {
              type: "assistant",
              message: `<interview-brief>${JSON.stringify(brief)}</interview-brief>`,
            },
          ]}
        >
          <textarea aria-label="Message" />
        </ExecutiveWorkspace>
      );
      const composer = screen.getByLabelText("Message");
      fireEvent.change(composer, { target: { value: "Retain this draft" } });
      fireEvent.click(screen.getByRole("button", { name: "briefControl" }));
      if (tab) fireEvent.click(screen.getByRole("button", { name: tab }));
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(onAsk).toHaveBeenCalledTimes(1);
      expect(onAsk).toHaveBeenCalledWith(request);
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      );
      expect(screen.getByLabelText("Message")).toBe(composer);
      expect(composer).toBeVisible();
      expect(composer).toHaveValue("Retain this draft");
    }
  );
  it("keeps extraction failure and retry reachable without a permanent chat footer", async () => {
    (useAutomaticBrief as jest.Mock).mockReturnValue({ phase: "error", retry });
    render(
      <ExecutiveWorkspace active messages={[]}>
        <textarea aria-label="Message" />
        <ExecutiveModelAction />
      </ExecutiveWorkspace>
    );
    expect(
      screen.queryByRole("button", { name: "retryDraft" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "briefControl" }));
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
    fireEvent.click(screen.getByRole("button", { name: "briefControl" }));
    fireEvent.click(screen.getByRole("button", { name: "modelSavedOpen" }));
    expect(recover).toHaveBeenCalledTimes(1);
    expect(connection.open).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    result.unmount();
    delete process.env.NEXT_PUBLIC_BURN_MODEL_WORKSPACE;
  });

  it("transfers interview, dossier and research through the existing model button", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "goal: captured" }));
    const dialog = screen.getByRole("dialog", {
      name: "workingBusinessBrief",
    });
    expect(screen.getByText("proposedDriverEquation")).toBeVisible();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
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

describe("follow-ups from inside a message", () => {
  function Asker() {
    const assistant = useAskAssistant();
    return (
      <button
        disabled={!assistant || assistant.busy}
        onClick={() => assistant?.ask("next step")}
      >
        {assistant ? "ask" : "no assistant"}
      </button>
    );
  }

  it("lets the chat ask the assistant, even when the interview panel is off", () => {
    const onAsk = jest.fn();
    render(
      <ExecutiveWorkspace active={false} messages={[]} onAsk={onAsk}>
        <Asker />
      </ExecutiveWorkspace>
    );

    fireEvent.click(screen.getByRole("button", { name: "ask" }));

    expect(onAsk).toHaveBeenCalledWith("next step");
  });

  it("holds the ask while the assistant is answering", () => {
    render(
      <ExecutiveWorkspace active={false} messages={[]} busy onAsk={jest.fn()}>
        <Asker />
      </ExecutiveWorkspace>
    );

    expect(screen.getByRole("button", { name: "ask" })).toBeDisabled();
  });

  it("offers nothing where there is nowhere to send", () => {
    render(
      <ExecutiveWorkspace active={false} messages={[]}>
        <Asker />
      </ExecutiveWorkspace>
    );

    expect(screen.getByRole("button", { name: "no assistant" })).toBeDisabled();
  });
});
