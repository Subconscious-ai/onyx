import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolSnapshot } from "@/lib/tools/types";
import type { MCPServersResponse } from "@/lib/tools/types";
import {
  getMCPUserOAuthNavigationUrl,
  startMCPUserOAuth,
} from "@/lib/tools/svc";

interface InterviewLibraryAgent {
  id: number;
  tools: readonly Pick<ToolSnapshot, "name" | "mcp_server_id">[];
}

export async function prepareInterviewLibrary(
  agent: InterviewLibraryAgent,
  signal?: AbortSignal
): Promise<{ serverId: number; connected: boolean }> {
  const ids = new Set(
    agent.tools
      .filter(
        (tool) =>
          tool.name === "library_snapshot" ||
          tool.name.endsWith("_library_snapshot")
      )
      .map((tool) => tool.mcp_server_id)
      .filter((id): id is number => typeof id === "number" && id > 0)
  );
  if (ids.size !== 1)
    throw new Error("Workspace connection is not configured.");
  const serverId = [...ids][0]!;
  const response = await fetch(`/api/mcp/servers/persona/${agent.id}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Workspace connection is unavailable.");
  const data: MCPServersResponse = await response.json();
  const server = data.mcp_servers.find((item) => item.id === serverId);
  if (!server) throw new Error("Workspace connection is unavailable.");
  return { serverId, connected: server.user_can_authenticate === true };
}

/** Keep the native draft and queue in their original tab during existing MCP OAuth. */
export async function connectInterviewLibrary(
  agent: InterviewLibraryAgent,
  serverId: number,
  popup: Window,
  returnPath: string,
  signal: AbortSignal
): Promise<boolean> {
  try {
    const started = await startMCPUserOAuth(serverId, returnPath);
    if (signal.aborted || popup.closed) return false;
    popup.location.href = getMCPUserOAuthNavigationUrl(started);
    const deadline = Date.now() + 120_000;
    while (!signal.aborted && !popup.closed && Date.now() < deadline) {
      const current = await prepareInterviewLibrary(agent, signal);
      if (signal.aborted || popup.closed) return false;
      if (current.serverId === serverId && current.connected) return true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  } finally {
    if (!popup.closed) popup.close();
  }
}
export function useInterviewLibrary(
  agent: InterviewLibraryAgent | undefined,
  scope: string | null
) {
  const [serverId, setServerId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const pending = useRef<{
    send: () => Promise<void> | void;
    reject?: () => void;
  } | null>(null);
  const checking = useRef(false);
  const generation = useRef(0);
  const connection = useRef<{ abort: AbortController; popup: Window } | null>(
    null
  );
  useEffect(() => {
    generation.current += 1;
    pending.current = null;
    checking.current = false;
    setServerId(null);
    setFailed(false);
    setConnecting(false);
    setPreparing(false);
    return () => {
      generation.current += 1;
      pending.current?.reject?.();
      pending.current = null;
      connection.current?.abort.abort();
      connection.current?.popup.close();
      connection.current = null;
    };
  }, [agent?.id, scope]);

  const prepare = useCallback(
    async (
      send: () => Promise<void> | void,
      reject?: () => void
    ): Promise<boolean> => {
      if (!agent || checking.current || connection.current || pending.current) {
        reject?.();
        return false;
      }
      checking.current = true;
      setPreparing(true);
      const currentGeneration = generation.current;
      try {
        const current = await prepareInterviewLibrary(agent);
        if (generation.current !== currentGeneration) {
          reject?.();
          return false;
        }
        setFailed(false);
        if (!current.connected) {
          pending.current = { send, reject };
          setServerId(current.serverId);
          return false;
        }
        pending.current = null;
        setServerId(null);
        await send();
        return true;
      } catch {
        if (generation.current === currentGeneration) setFailed(true);
        reject?.();
        return false;
      } finally {
        if (generation.current === currentGeneration) {
          checking.current = false;
          setPreparing(false);
        }
      }
    },
    [agent]
  );

  const connect = useCallback(
    async (returnPath: string) => {
      if (!agent || !serverId || connection.current || !pending.current) return;
      const popup = window.open("about:blank", "beca-workspace-connect");
      if (!popup) {
        pending.current?.reject?.();
        pending.current = null;
        setServerId(null);
        setFailed(true);
        return;
      }
      const active = { abort: new AbortController(), popup };
      connection.current = active;
      const timer = setTimeout(() => active.abort.abort(), 120_000);
      setConnecting(true);
      setFailed(false);
      try {
        const ready = await connectInterviewLibrary(
          agent,
          serverId,
          popup,
          returnPath,
          active.abort.signal
        );
        if (connection.current !== active) return;
        if (active.abort.signal.aborted || !ready) {
          pending.current?.reject?.();
          pending.current = null;
          setServerId(null);
          return;
        }
        const submission = pending.current;
        pending.current = null;
        setServerId(null);
        await submission?.send();
      } catch {
        if (connection.current === active) {
          pending.current?.reject?.();
          pending.current = null;
          setServerId(null);
          setFailed(true);
        }
      } finally {
        clearTimeout(timer);
        if (connection.current === active) {
          connection.current = null;
          setConnecting(false);
        }
      }
    },
    [agent, serverId]
  );
  const cancel = useCallback(() => {
    generation.current += 1;
    pending.current?.reject?.();
    pending.current = null;
    connection.current?.abort.abort();
    connection.current?.popup.close();
    connection.current = null;
    checking.current = false;
    setPreparing(false);
    setServerId(null);
    setConnecting(false);
    setFailed(false);
  }, []);
  return {
    prepare,
    connect,
    cancel,
    needed: serverId !== null,
    connecting,
    preparing,
    failed,
  };
}
