import { PacketType, Packet } from "@/app/app/services/streamingModels";
import { renderHook } from "@testing-library/react";
import {
  findExperimentLaunches,
  useExperimentLaunches,
} from "./useExperimentLaunches";

const placement = { turn_index: 0, tab_index: 0 };

function toolResult(data: unknown, toolName = "start_experiment"): Packet {
  return {
    placement,
    obj: {
      type: PacketType.CUSTOM_TOOL_DELTA,
      tool_name: toolName,
      response_type: "json",
      data,
    },
  } as Packet;
}

const launch = {
  wandb_run_id: "9e1bddd9-cffe-4a6c-95b4-66a70eeb69bf",
  launch_state: "submitted",
  specification_hash: "sha256:abc",
};

it("finds a launch in a live result, where the data is an object", () => {
  const packets = [toolResult({ tool_result: JSON.stringify(launch) })];

  expect(findExperimentLaunches(packets)).toEqual([
    { runId: launch.wandb_run_id, launchState: "submitted" },
  ]);
});

it("finds the same launch after a reload, where the data is the saved JSON text", () => {
  const packets = [
    toolResult(JSON.stringify({ tool_result: JSON.stringify(launch) })),
  ];

  expect(findExperimentLaunches(packets)).toEqual([
    { runId: launch.wandb_run_id, launchState: "submitted" },
  ]);
});

it("does not depend on what the tool is called", () => {
  const packets = [
    toolResult({ tool_result: JSON.stringify(launch) }, "Start experiment"),
  ];

  expect(findExperimentLaunches(packets)).toHaveLength(1);
});

it("lists one card per run even if the result appears twice", () => {
  const result = toolResult({ tool_result: JSON.stringify(launch) });

  expect(findExperimentLaunches([result, result])).toHaveLength(1);
});

it.each([
  ["plain text", { tool_result: "Searched 3 sources." }],
  [
    "a status read",
    { tool_result: JSON.stringify({ run_id: "r", status: "running" }) },
  ],
  [
    "an unknown launch state",
    { tool_result: JSON.stringify({ ...launch, launch_state: "weird" }) },
  ],
  [
    "a run id that is not text",
    { tool_result: JSON.stringify({ ...launch, wandb_run_id: 5 }) },
  ],
  ["an error", { error: "Tool execution failed" }],
  ["nothing", undefined],
  ["broken JSON", "{not json"],
])("ignores %s", (_label, data) => {
  expect(findExperimentLaunches([toolResult(data)])).toEqual([]);
});

it("ignores packets that are not tool results", () => {
  const packets = [
    {
      placement,
      obj: {
        type: PacketType.CUSTOM_TOOL_START,
        tool_name: "start_experiment",
      },
    } as Packet,
  ];

  expect(findExperimentLaunches(packets)).toEqual([]);
});

it("sees a launch that arrives later in the same array while the message streams", () => {
  const packets: Packet[] = [];
  const { result, rerender } = renderHook(() => useExperimentLaunches(packets));
  expect(result.current).toEqual([]);

  packets.push(toolResult({ tool_result: JSON.stringify(launch) }));
  rerender();

  expect(result.current).toEqual([
    { runId: launch.wandb_run_id, launchState: "submitted" },
  ]);
});
