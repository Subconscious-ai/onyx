import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExecutiveWorkspace from "./ExecutiveWorkspace";
import { useAutomaticBrief } from "@/lib/executive/hooks";

jest.mock("@/lib/executive/hooks", () => ({
  useAutomaticBrief: jest.fn(),
  useExecutiveContext: () => ({
    profileStatus: "PDL: no confident match",
    research: { status: "needs_company" },
  }),
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
  const retry = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    (useAutomaticBrief as jest.Mock).mockReturnValue({ phase: "idle", retry });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "not_found" }),
    });
  });
  it("keeps the draft out of chat until requested and preserves composer text on return", async () => {
    render(
      <ExecutiveWorkspace active messages={[]}>
        <textarea aria-label="Message" defaultValue="Retain this draft" />
      </ExecutiveWorkspace>
    );
    expect(
      screen.queryByLabelText("workingBusinessBrief")
    ).not.toBeInTheDocument();
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
      </ExecutiveWorkspace>
    );
    expect(
      screen.queryByRole("button", { name: "Retry draft update" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Brief · retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry draft update" }));
    expect(retry).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByText("PDL: no confident match")).toBeInTheDocument()
    );
  });
});
