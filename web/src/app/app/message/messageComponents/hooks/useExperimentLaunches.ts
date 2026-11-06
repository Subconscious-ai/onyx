import { useMemo } from "react";
import { Packet } from "@/app/app/services/streamingModels";

export interface ExperimentLaunch {
  runId: string;
  launchState: string;
}

const LAUNCH_STATES = new Set(["dispatching", "submitted", "dispatch_unknown"]);

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

/** Tool results arrive either already parsed or as JSON text. */
function parseJson(value: JsonValue | undefined): JsonValue | undefined {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isRecord(value: JsonValue | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The launch described by one tool result, if it is one.
 *
 * A live result arrives as `{ tool_result: "<json>" }`; after a reload the same
 * result arrives as the saved JSON text of that object. Both are read, and the
 * result is recognised by its fields, not by what the tool is called.
 */
function launchFromData(data: JsonValue | undefined): ExperimentLaunch | null {
  const outer = parseJson(data);
  if (!isRecord(outer)) return null;
  const inner = parseJson(outer.tool_result);
  if (!isRecord(inner)) return null;
  const { wandb_run_id: runId, launch_state: launchState } = inner;
  if (typeof runId !== "string" || runId.length === 0) return null;
  if (typeof launchState !== "string" || !LAUNCH_STATES.has(launchState)) {
    return null;
  }
  return { runId, launchState };
}

export function findExperimentLaunches(
  rawPackets: Packet[]
): ExperimentLaunch[] {
  const launches = new Map<string, ExperimentLaunch>();
  for (const packet of rawPackets) {
    if (packet.obj.type !== "custom_tool_delta") continue;
    const launch = launchFromData(packet.obj.data);
    if (launch && !launches.has(launch.runId)) {
      launches.set(launch.runId, launch);
    }
  }
  return [...launches.values()];
}

/**
 * Experiments launched during this message, one entry per run.
 *
 * The chat appends to `rawPackets` in place while a message streams, so the
 * length is part of the key: identity alone would never see a later launch.
 */
export function useExperimentLaunches(
  rawPackets: Packet[]
): ExperimentLaunch[] {
  const packetCount = rawPackets.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packetCount stands in for in-place growth of rawPackets
  return useMemo(
    () => findExperimentLaunches(rawPackets),
    [rawPackets, packetCount]
  );
}
