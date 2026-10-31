import { render, screen } from "@tests/setup/test-utils";
import CustomToolRenderer from "./CustomToolRenderer";
import { RenderType, RendererOutput } from "../interfaces";
import {
  CustomToolPacket,
  PacketType,
} from "../../../services/streamingModels";

const placement = { turn_index: 0, tab_index: 0 };
const TOOL = "mcp_rehoboam_start_experiment";

const start: CustomToolPacket = {
  placement,
  obj: { type: PacketType.CUSTOM_TOOL_START, tool_name: TOOL },
};
const approvalRequest: CustomToolPacket = {
  placement,
  obj: {
    type: PacketType.CUSTOM_TOOL_APPROVAL_REQUEST,
    tool_name: TOOL,
    approval_id: "a1",
    message: "Approve one paid experiment?\nSpecification hash: sha256:abc",
    title: "Paid experiment approval",
    description: "Approve this exact specification and no other.",
    expires_in_seconds: 180,
  },
};
const approvalResult = (
  outcome: "approved" | "declined" | "expired"
): CustomToolPacket => ({
  placement,
  obj: {
    type: PacketType.CUSTOM_TOOL_APPROVAL_RESULT,
    approval_id: "a1",
    outcome,
  },
});

function renderTool(packets: CustomToolPacket[], renderType: RenderType) {
  return render(
    <CustomToolRenderer
      packets={packets}
      state={{}}
      onComplete={jest.fn()}
      renderType={renderType}
      animate={false}
      stopPacketSeen={false}
    >
      {(results: RendererOutput) => (
        <div data-testid="step">
          {results.map((result, index) => (
            <div key={index}>{result.content}</div>
          ))}
        </div>
      )}
    </CustomToolRenderer>
  );
}

it("shows a pending approval with its buttons, unclipped, in the compact streaming view", () => {
  renderTool([start, approvalRequest], RenderType.COMPACT);

  expect(
    screen.getByRole("button", { name: "Approve this exact action" })
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  // The compact view clips to 6rem; an approval must never be hidden by that.
  expect(document.querySelector(".max-h-24")).toBeNull();
});

it("replaces the waiting dots while the tool waits on the user", () => {
  renderTool([start, approvalRequest], RenderType.FULL);

  expect(screen.queryByText(/waiting for response/i)).toBeNull();
});

it.each([
  ["approved", `Approved. ${TOOL} is running.`],
  ["declined", "Declined. Nothing was run."],
  ["expired", "No answer in time. Nothing was run."],
] as const)(
  "reports the %s outcome once the server closes it",
  (outcome, text) => {
    renderTool(
      [start, approvalRequest, approvalResult(outcome)],
      RenderType.FULL
    );

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  }
);

it("leaves an ordinary tool call exactly as before", () => {
  renderTool(
    [
      start,
      {
        placement,
        obj: {
          type: PacketType.CUSTOM_TOOL_DELTA,
          tool_name: TOOL,
          response_type: "json",
          data: { tool_result: "ok" },
        },
      },
    ],
    RenderType.FULL
  );

  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText(/tool_result/)).toBeInTheDocument();
});
