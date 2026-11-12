import { render, screen } from "@tests/setup/test-utils";
import AgentMessage from "./AgentMessage";
import { Packet, PacketType } from "../../services/streamingModels";

jest.mock("@/providers/VoiceModeProvider", () => ({
  useVoiceMode: () => ({
    streamTTS: jest.fn(),
    resetTTS: jest.fn(),
    stopTTS: jest.fn(),
  }),
}));

const approvalRequest = (turn: number, tab: number): Packet =>
  ({
    placement: { turn_index: turn, tab_index: tab },
    obj: {
      type: PacketType.CUSTOM_TOOL_APPROVAL_REQUEST,
      tool_name: "start_experiment",
      approval_id: "a1",
      message: "Approve one paid experiment?\nSpecification hash: sha256:abc",
      title: "Paid experiment approval",
      expires_in_seconds: 180,
    },
  }) as Packet;

const text = (turn: number, content: string): Packet[] => [
  {
    placement: { turn_index: turn, tab_index: 0 },
    obj: {
      type: PacketType.MESSAGE_START,
      id: "m",
      content: "",
      final_documents: null,
    },
  } as Packet,
  {
    placement: { turn_index: turn, tab_index: 0 },
    obj: { type: PacketType.MESSAGE_DELTA, content },
  } as Packet,
  {
    placement: { turn_index: turn, tab_index: 0 },
    obj: { type: PacketType.SECTION_END },
  } as Packet,
];

const toolStart = (turn: number, tab: number): Packet =>
  ({
    placement: { turn_index: turn, tab_index: tab },
    obj: { type: PacketType.CUSTOM_TOOL_START, tool_name: "start_experiment" },
  }) as Packet;

function renderMessage(rawPackets: Packet[]) {
  return render(
    <AgentMessage
      rawPackets={rawPackets}
      packetCount={rawPackets.length}
      chatState={{ agent: { id: 1, tools: [] } } as never}
      nodeId={1}
      llmManager={null}
      hideFooter
      disableTTS
    />
  );
}

it("shows the question when the assistant wrote a line before calling the tool", () => {
  renderMessage([
    ...text(0, "I will launch it now."),
    toolStart(1, 0),
    approvalRequest(1, 0),
  ]);

  expect(
    screen.getByRole("button", { name: "Approve this exact action" })
  ).toBeInTheDocument();
});

// With the card inside its tool step, this fails: the collapsed parallel view
// shows only the first tab, so a launch in the third tab went unseen and expired.
it("shows the question when the launch is one of several parallel calls", () => {
  renderMessage([
    toolStart(0, 0),
    toolStart(0, 1),
    toolStart(0, 2),
    approvalRequest(0, 2),
  ]);

  expect(
    screen.getByRole("button", { name: "Approve this exact action" })
  ).toBeInTheDocument();
});

it("shows nothing extra when no tool asked anything", () => {
  renderMessage([...text(0, "Hello.")]);

  expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
});
