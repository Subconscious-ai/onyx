import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InterviewProgress from "./InterviewProgress";
import type { InterviewBrief } from "@/lib/executive/brief";
import confetti from "canvas-confetti";
import messages from "@/i18n/messages/en.json";
jest.mock("canvas-confetti", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, args?: Record<string, number>) =>
    (
      (messages.executive.progress as Record<string, string>)[key] ?? key
    ).replace("{count}", String(args?.count ?? "")),
}));
jest.mock("@opal/components", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
jest.mock("@opal/icons", () => ({
  SvgArrowUpRight: () => null,
  SvgCheck: () => null,
}));
const fact = {
  text: "7% in three months",
  status: "executive" as const,
  quote: "7% in three months",
};
const brief: InterviewBrief = {
  version: 2,
  company: "Energy",
  objective: fact,
  horizon: "Three months",
  journey: [
    {
      id: "view",
      actor: "Homeowner",
      text: "Sees offer",
      status: "executive",
      quote: "Sees offer",
    },
    {
      id: "buy",
      actor: "Homeowner",
      text: "Signs up",
      status: "executive",
      quote: "Signs up",
    },
  ],
  transitions: [
    {
      id: "convert",
      from: "view",
      to: "buy",
      behavior: fact,
      metric: "Conversion",
    },
  ],
  keyResults: [
    {
      id: "conversion",
      metric: "Conversion",
      unit: "%",
      direction: "increase",
      baseline: { text: "Unknown", status: "unknown" },
      target: fact,
      deadline: fact,
      journeyIds: ["buy"],
    },
  ],
  model: {
    equation: {
      text: "Customers = visitors * conversion",
      status: "assumption",
    },
    inputs: [
      {
        id: "visitors",
        name: "Visitors",
        unit: "people",
        value: { text: "Unknown", status: "unknown" },
      },
    ],
    gaps: [],
  },
  conflicts: [],
  interventions: [],
};
const props = {
  brief: null,
  stale: false,
  phase: "saved",
  busy: false,
  chatId: "test",
  hasAnswer: true,
  onOpen: jest.fn(),
  onRetry: jest.fn(),
  onAsk: jest.fn(),
  onReview: jest.fn(),
};
beforeEach(() => jest.clearAllMocks());
it("shows missing work and routes help to the existing chat", () => {
  render(
    <InterviewProgress
      {...props}
      brief={{ ...brief, journey: [], transitions: [] }}
    />
  );
  expect(screen.getByText("2 of 3 essentials captured")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Customer journey/ }));
  expect(props.onAsk).toHaveBeenCalledWith(
    expect.stringContaining("customer journey")
  );
  expect(
    screen.queryByRole("button", { name: "Complete model brief" })
  ).not.toBeInTheDocument();
});
it("opens the model without requiring unknown inputs", () => {
  render(<InterviewProgress {...props} brief={brief} />);
  fireEvent.click(screen.getByRole("button", { name: "Build business model" }));
  expect(props.onOpen).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Enough for a first model.")).toBeVisible();
});
it("does not offer stale work while saving corrections", () => {
  render(<InterviewProgress {...props} brief={brief} stale phase="updating" />);
  expect(
    screen.queryByRole("button", { name: "Build business model" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Updating your brief…" })
  ).not.toBeInTheDocument();
});
it("exposes retry while preserving captured progress", () => {
  render(<InterviewProgress {...props} brief={brief} phase="error" />);
  fireEvent.click(screen.getByRole("button", { name: "Retry brief update" }));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByText("3 of 3 essentials captured")).toBeVisible();
});
it("celebrates newly saved progress once and respects reduced motion", async () => {
  const view = render(<InterviewProgress {...props} brief={null} />);
  expect(confetti).not.toHaveBeenCalled();
  view.rerender(<InterviewProgress {...props} busy />);
  view.rerender(<InterviewProgress {...props} brief={brief} />);
  await waitFor(() => expect(confetti).toHaveBeenCalledTimes(1));
  expect(confetti).toHaveBeenCalledWith(
    expect.objectContaining({ disableForReducedMotion: true })
  );
  view.rerender(<InterviewProgress {...props} brief={brief} />);
  expect(confetti).toHaveBeenCalledTimes(1);
});
it("does not celebrate a loaded conversation", () => {
  render(<InterviewProgress {...props} brief={brief} />);
  expect(confetti).not.toHaveBeenCalled();
});

it("waits for current company context before handing off a ready brief", () => {
  const view = render(
    <InterviewProgress {...props} brief={brief} contextPending />
  );
  const button = screen.getByRole("button", {
    name: "Finishing company research…",
  });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(props.onOpen).not.toHaveBeenCalled();
  view.rerender(
    <InterviewProgress {...props} brief={brief} contextPending={false} />
  );
  fireEvent.click(screen.getByRole("button", { name: "Build business model" }));
  expect(props.onOpen).toHaveBeenCalledTimes(1);
});

it("retains captured progress while a new turn is being extracted, but resets for another chat", () => {
  const { rerender } = render(<InterviewProgress {...props} brief={brief} />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "3");
  rerender(<InterviewProgress {...props} brief={null} busy phase="updating" />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "3");
  rerender(<InterviewProgress {...props} brief={null} chatId="other" />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
});
