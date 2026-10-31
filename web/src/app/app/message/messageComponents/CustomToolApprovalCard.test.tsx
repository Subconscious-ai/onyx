import { render, screen, waitFor } from "@tests/setup/test-utils";
import userEvent from "@testing-library/user-event";
import CustomToolApprovalCard from "./CustomToolApprovalCard";
import { CustomToolApprovalRequest } from "../../services/streamingModels";

const SPEC =
  "Approve one paid experiment for this exact normalized specification?\n\n" +
  "Specification hash: sha256:abc123\n<b>not markup</b>";

const request: CustomToolApprovalRequest = {
  type: "custom_tool_approval_request",
  tool_name: "mcp_rehoboam_start_experiment",
  approval_id: "a1",
  message: SPEC,
  title: "Paid experiment approval",
  description: "Approve this exact specification and no other.",
  expires_in_seconds: 180,
};

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function answerWith(status: number) {
  fetchMock.mockResolvedValue({ ok: status >= 200 && status < 300, status });
}

it("shows the server's exact words as plain text with the server's labels", () => {
  render(<CustomToolApprovalCard request={request} outcome={null} />);

  expect(screen.getByText("Paid experiment approval")).toBeInTheDocument();
  expect(
    screen.getByText("Approve this exact specification and no other.")
  ).toBeInTheDocument();
  const exact = screen.getByTestId("approval-exact-action");
  expect(exact.textContent).toBe(SPEC);
  expect(exact.querySelector("b")).toBeNull(); // markup is text, never elements
});

it("approving posts that approval's own id and the approve decision", async () => {
  answerWith(204);
  const user = userEvent.setup();
  render(<CustomToolApprovalCard request={request} outcome={null} />);

  await user.click(
    screen.getByRole("button", { name: "Approve this exact action" })
  );

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/mcp/elicitation/a1");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ decision: "approve" });
});

it("declining posts the decline decision", async () => {
  answerWith(204);
  const user = userEvent.setup();
  render(<CustomToolApprovalCard request={request} outcome={null} />);

  await user.click(screen.getByRole("button", { name: "Decline" }));

  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    decision: "decline",
  });
});

it("cannot be answered twice once an answer was sent", async () => {
  answerWith(204);
  const user = userEvent.setup();
  render(<CustomToolApprovalCard request={request} outcome={null} />);

  await user.click(
    screen.getByRole("button", { name: "Approve this exact action" })
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Approve this exact action" })
    ).toBeDisabled()
  );
  expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("lets the user try again when the answer could not be sent", async () => {
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  const user = userEvent.setup();
  render(<CustomToolApprovalCard request={request} outcome={null} />);

  await user.click(
    screen.getByRole("button", { name: "Approve this exact action" })
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your answer could not be sent. Try again."
  );
  expect(
    screen.getByRole("button", { name: "Approve this exact action" })
  ).toBeEnabled();
});

it("reports an expired request when the server no longer has it", async () => {
  answerWith(404);
  const user = userEvent.setup();
  render(<CustomToolApprovalCard request={request} outcome={null} />);

  await user.click(
    screen.getByRole("button", { name: "Approve this exact action" })
  );

  expect(
    await screen.findByText("No answer in time. Nothing was run.")
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Approve this exact action" })
  ).toBeNull();
});

it.each([
  ["approved", "Approved. mcp_rehoboam_start_experiment is running."],
  ["declined", "Declined. Nothing was run."],
  ["expired", "No answer in time. Nothing was run."],
] as const)(
  "once the server closed it as %s the card reports it, keeps the exact action, and has no buttons",
  (outcome, text) => {
    render(<CustomToolApprovalCard request={request} outcome={outcome} />);

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByTestId("approval-exact-action").textContent).toBe(SPEC);
    expect(screen.queryByRole("button")).toBeNull();
  }
);
