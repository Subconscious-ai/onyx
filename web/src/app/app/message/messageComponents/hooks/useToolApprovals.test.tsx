import { renderHook } from "@testing-library/react";
import { Packet, PacketType } from "@/app/app/services/streamingModels";
import { findToolApprovals, useToolApprovals } from "./useToolApprovals";

const placement = { turn_index: 1, tab_index: 2 };

const request = (id: string): Packet =>
  ({
    placement,
    obj: {
      type: PacketType.CUSTOM_TOOL_APPROVAL_REQUEST,
      tool_name: "start_experiment",
      approval_id: id,
      message: `Approve ${id}?`,
      expires_in_seconds: 180,
    },
  }) as Packet;

const result = (id: string, outcome: string): Packet =>
  ({
    placement,
    obj: {
      type: PacketType.CUSTOM_TOOL_APPROVAL_RESULT,
      approval_id: id,
      outcome,
    },
  }) as Packet;

it("lists an open request with no outcome", () => {
  const [approval] = findToolApprovals([request("a")]);

  expect(approval?.request.approval_id).toBe("a");
  expect(approval?.outcome).toBeNull();
});

it("attaches the server's close to its own request only", () => {
  const approvals = findToolApprovals([
    request("a"),
    request("b"),
    result("b", "declined"),
  ]);

  expect(approvals.map((a) => [a.request.approval_id, a.outcome])).toEqual([
    ["a", null],
    ["b", "declined"],
  ]);
});

it("ignores a close with no request and unrelated packets", () => {
  const other = {
    placement,
    obj: { type: PacketType.CUSTOM_TOOL_START, tool_name: "x" },
  } as Packet;

  expect(findToolApprovals([other, result("zzz", "approved")])).toEqual([]);
});

it("sees a request that arrives later in the same array while the message streams", () => {
  const packets: Packet[] = [];
  const { result: hook, rerender } = renderHook(() =>
    useToolApprovals(packets)
  );
  expect(hook.current).toEqual([]);

  packets.push(request("a"));
  rerender();
  expect(hook.current).toHaveLength(1);
  expect(hook.current[0]?.outcome).toBeNull();

  packets.push(result("a", "approved"));
  rerender();
  expect(hook.current[0]?.outcome).toBe("approved");
});
