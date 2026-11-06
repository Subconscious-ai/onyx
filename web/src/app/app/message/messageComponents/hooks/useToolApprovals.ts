import { useMemo } from "react";
import {
  CustomToolApprovalOutcome,
  CustomToolApprovalRequest,
  Packet,
} from "@/app/app/services/streamingModels";

export interface ToolApproval {
  request: CustomToolApprovalRequest;
  /** Null until the server has closed the request. */
  outcome: CustomToolApprovalOutcome | null;
}

export function findToolApprovals(rawPackets: Packet[]): ToolApproval[] {
  const closed = new Map<string, CustomToolApprovalOutcome>();
  for (const packet of rawPackets) {
    if (packet.obj.type === "custom_tool_approval_result") {
      closed.set(packet.obj.approval_id, packet.obj.outcome);
    }
  }
  const approvals: ToolApproval[] = [];
  for (const packet of rawPackets) {
    if (packet.obj.type === "custom_tool_approval_request") {
      approvals.push({
        request: packet.obj,
        outcome: closed.get(packet.obj.approval_id) ?? null,
      });
    }
  }
  return approvals;
}

/**
 * Questions tool servers put to the user during this message.
 *
 * They are read from the raw packets, not from a tool step, because a step
 * collapses once the assistant has written any text and sits behind a tab among
 * parallel calls, and a paid launch that nobody can see expires unanswered. The
 * chat appends to `rawPackets` in place, so the length is part of the key.
 */
export function useToolApprovals(rawPackets: Packet[]): ToolApproval[] {
  const packetCount = rawPackets.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packetCount stands in for in-place growth of rawPackets
  return useMemo(
    () => findToolApprovals(rawPackets),
    [rawPackets, packetCount]
  );
}
