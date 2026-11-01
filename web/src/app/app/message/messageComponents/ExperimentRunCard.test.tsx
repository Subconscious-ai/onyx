import { render, screen, waitFor } from "@tests/setup/test-utils";
import userEvent from "@testing-library/user-event";
import ExperimentRunCard from "./ExperimentRunCard";
import { AskAssistantProvider } from "./AskAssistantContext";
import { useChatSessionStore } from "@/app/app/stores/useChatSessionStore";

const RUN_ID = "9e1bddd9-cffe-4a6c-95b4-66a70eeb69bf";
const fetchMock = jest.fn();

function status(partial: Record<string, unknown>) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ run_id: RUN_ID, ...partial }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  useChatSessionStore.setState({ currentSessionId: "session-1" });
  delete process.env.NEXT_PUBLIC_HOLODECK_URL;
});

it("asks for this run's status in this conversation", async () => {
  status({ status: "running", terminal: false, successful: null });

  render(<ExperimentRunCard runId={RUN_ID} />);

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock.mock.calls[0][0]).toBe(
    `/api/mcp/experiment-run/${RUN_ID}?chat_session_id=session-1`
  );
});

it.each([
  [
    { status: "in-queue", terminal: false, successful: null },
    "Waiting in the queue.",
  ],
  [
    { status: "running", terminal: false, successful: null },
    "Running. This can take several minutes.",
  ],
  [
    { status: "finished", terminal: true, successful: true },
    "Finished. Ask Beca for the results.",
  ],
  [
    { status: "crashed", terminal: true, successful: false },
    "Did not finish (crashed). Ask Beca what to do next.",
  ],
])("reports %j as %s", async (body, text) => {
  status(body);

  render(<ExperimentRunCard runId={RUN_ID} />);

  expect(await screen.findByText(text)).toBeInTheDocument();
  expect(screen.getByText("Experiment 9e1bddd9")).toBeInTheDocument();
});

it("says the status is unavailable when it cannot be read, without calling the run failed", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 502,
    json: async () => ({ detail: "The run status is unavailable right now." }),
  });

  render(<ExperimentRunCard runId={RUN_ID} />);

  expect(
    await screen.findByText(
      "The status is unavailable right now. Checking again."
    )
  ).toBeInTheDocument();
  expect(screen.queryByText(/Did not finish/)).toBeNull();
});

it("shows nothing when there is no conversation, as in a shared read-only view", () => {
  useChatSessionStore.setState({ currentSessionId: null });

  const { container } = render(<ExperimentRunCard runId={RUN_ID} />);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(container).toBeEmptyDOMElement();
});

it("does not call a run failed or finished when it ended without a verdict", async () => {
  status({ status: "unknown", terminal: true, successful: null });

  render(<ExperimentRunCard runId={RUN_ID} />);

  await screen.findByText("Starting.");
  expect(screen.queryByText(/Did not finish/)).toBeNull();
  expect(screen.queryByText(/^Finished/)).toBeNull();
});

it("links to the results of a finished run only where the deployment knows its address", async () => {
  process.env.NEXT_PUBLIC_HOLODECK_URL = "https://app.example.com/";
  status({ status: "finished", terminal: true, successful: true });

  render(<ExperimentRunCard runId={RUN_ID} />);

  const link = await screen.findByRole("link", { name: /Open results/ });
  expect(link).toHaveAttribute(
    "href",
    `https://app.example.com/insights/${RUN_ID}`
  );
});

it("offers no results link while the run is still going", async () => {
  process.env.NEXT_PUBLIC_HOLODECK_URL = "https://app.example.com";
  status({ status: "running", terminal: false, successful: null });

  render(<ExperimentRunCard runId={RUN_ID} />);

  await screen.findByText("Running. This can take several minutes.");
  expect(screen.queryByRole("link")).toBeNull();
});

it("never builds a link from an address that is not http or https", async () => {
  process.env.NEXT_PUBLIC_HOLODECK_URL = "javascript:alert(1)";
  status({ status: "finished", terminal: true, successful: true });

  render(<ExperimentRunCard runId={RUN_ID} />);

  await screen.findByText("Finished. Ask Beca for the results.");
  expect(screen.queryByRole("link")).toBeNull();
});

describe("follow-ups after a result", () => {
  const finished = { status: "finished", terminal: true, successful: true };

  function renderWithAsk(ask: jest.Mock, busy = false) {
    return render(
      <AskAssistantProvider value={{ ask, busy }}>
        <ExperimentRunCard runId={RUN_ID} />
      </AskAssistantProvider>
    );
  }

  it("offers one-click next steps once the run finished", async () => {
    status(finished);
    renderWithAsk(jest.fn());

    for (const label of [
      "Explain this result",
      "Replace weak attributes",
      "Compare segments",
      "Try another audience",
    ]) {
      expect(await screen.findByRole("button", { name: label })).toBeEnabled();
    }
  });

  it("sends the chosen next step to the assistant as the user's own message", async () => {
    status(finished);
    const ask = jest.fn();
    const user = userEvent.setup();
    renderWithAsk(ask);

    await user.click(
      await screen.findByRole("button", { name: "Replace weak attributes" })
    );

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toMatch(/replaces them/);
    // Every proposal is shown for review first; nothing runs from a chip.
    expect(ask.mock.calls[0][0]).toMatch(/before anything runs/);
  });

  it("holds the next steps while the assistant is already answering", async () => {
    status(finished);
    renderWithAsk(jest.fn(), true);

    expect(
      await screen.findByRole("button", { name: "Explain this result" })
    ).toBeDisabled();
  });

  it("offers nothing while the run is still going", async () => {
    status({ status: "running", terminal: false, successful: null });
    renderWithAsk(jest.fn());

    await screen.findByText("Running. This can take several minutes.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers nothing when the run did not finish", async () => {
    status({ status: "failed", terminal: true, successful: false });
    renderWithAsk(jest.fn());

    await screen.findByText(/Did not finish/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers nothing where messages cannot be sent", async () => {
    status(finished);
    render(<ExperimentRunCard runId={RUN_ID} />);

    await screen.findByText("Finished. Ask Beca for the results.");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
