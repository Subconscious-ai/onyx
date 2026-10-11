import type {
  CauslContextMessage,
  CauslDraft,
  CauslSelection,
  CauslWorkspace,
} from "./types";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function reference(value: unknown, maximum = 500): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum
  );
}

export function parseCauslMessage(value: unknown): CauslContextMessage | null {
  if (
    !object(value) ||
    value.kind !== "causl:context" ||
    !reference(value.nonce) ||
    !Number.isSafeInteger(value.revision) ||
    typeof value.revision !== "number" ||
    value.revision < 0 ||
    !object(value.actor) ||
    !reference(value.actor.orgId, 120) ||
    !reference(value.actor.userId, 512) ||
    !object(value.selection)
  )
    return null;
  const selection = value.selection;
  if (
    selection.page !== "workspace" &&
    selection.page !== "library" &&
    selection.page !== "models" &&
    selection.page !== "reports"
  )
    return null;
  if (selection.marketId !== undefined && !reference(selection.marketId))
    return null;
  if (selection.runId !== undefined && !reference(selection.runId)) return null;
  if (
    selection.studioId !== undefined &&
    (typeof selection.studioId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        selection.studioId
      ))
  )
    return null;
  let record: CauslSelection["record"];
  if (selection.record !== undefined) {
    if (
      !object(selection.record) ||
      !reference(selection.record.type) ||
      !reference(selection.record.id)
    )
      return null;
    record = { type: selection.record.type, id: selection.record.id };
  }
  return {
    kind: "causl:context",
    nonce: value.nonce,
    revision: value.revision,
    actor: { orgId: value.actor.orgId, userId: value.actor.userId },
    selection: {
      page: selection.page,
      ...(selection.marketId !== undefined
        ? { marketId: selection.marketId }
        : {}),
      ...(selection.runId !== undefined ? { runId: selection.runId } : {}),
      ...(selection.studioId !== undefined
        ? { studioId: selection.studioId }
        : {}),
      ...(record ? { record } : {}),
    },
  };
}

export class CauslWorkspaceError extends Error {
  constructor(
    readonly reason: "signin" | "access" | "unavailable" | "changed"
  ) {
    super(reason);
  }
}

export async function openCauslWorkspace(
  message: CauslContextMessage,
  signal: AbortSignal
): Promise<CauslWorkspace> {
  const response = await fetch("/api/chat/causl-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      actor: message.actor,
      selection: message.selection,
    }),
  });
  if (!response.ok)
    throw new CauslWorkspaceError(
      response.status === 401
        ? "signin"
        : response.status === 403
          ? "access"
          : "unavailable"
    );
  const result: unknown = await response.json();
  if (
    !object(result) ||
    typeof result.chatId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      result.chatId
    ) ||
    typeof result.agentId !== "number" ||
    !Number.isSafeInteger(result.agentId) ||
    result.agentId <= 0 ||
    typeof result.scopeKey !== "string" ||
    !/^[a-f0-9]{64}$/i.test(result.scopeKey) ||
    typeof result.contextDigest !== "string" ||
    !/^[a-f0-9]{64}$/i.test(result.contextDigest)
  )
    throw new CauslWorkspaceError("unavailable");
  return {
    chatId: result.chatId,
    agentId: result.agentId,
    scopeKey: result.scopeKey,
    contextDigest: result.contextDigest,
  };
}

/** Page updates retain the chat. A scope change needs a new frame; late responses cannot reopen the old scope. */
export function createCauslBridge(options: {
  nonce: string;
  open: typeof openCauslWorkspace;
  onReady: (workspace: CauslWorkspace) => void;
  onError: (reason: CauslWorkspaceError["reason"]) => void;
}) {
  let scope: string | null = null;
  let current: {
    message: CauslContextMessage;
    controller: AbortController;
    promise: Promise<CauslWorkspace>;
  } | null = null;
  let disposed = false;
  let verified = false;
  const draftIds = new Set<string>();

  function receive(value: unknown) {
    const message = parseCauslMessage(value);
    if (
      disposed ||
      !message ||
      message.nonce !== options.nonce ||
      (current && message.revision <= current.message.revision)
    )
      return;
    const nextScope = JSON.stringify([
      message.actor,
      message.selection.marketId ?? null,
    ]);
    if (scope !== null && nextScope !== scope) {
      dispose();
      options.onError("changed");
      return;
    }
    scope = nextScope;
    current?.controller.abort();
    verified = false;
    const controller = new AbortController();
    const next = {
      message,
      controller,
      promise: options.open(message, controller.signal),
    };
    current = next;
    void next.promise
      .then((workspace) => {
        if (!disposed && current === next) {
          verified = true;
          options.onReady(workspace);
        }
      })
      .catch((error: unknown) => {
        if (!disposed && current === next && !controller.signal.aborted)
          options.onError(
            error instanceof CauslWorkspaceError ? error.reason : "unavailable"
          );
      });
    return true;
  }

  async function prepareSubmission(): Promise<CauslSelection> {
    const snapshot = current;
    if (!snapshot || disposed) throw new CauslWorkspaceError("changed");
    await snapshot.promise;
    if (disposed || current !== snapshot)
      throw new CauslWorkspaceError("changed");
    return snapshot.message.selection;
  }

  function dispose() {
    disposed = true;
    verified = false;
    current?.controller.abort();
  }

  function navigationContext() {
    return !disposed && verified && current ? current.message : null;
  }

  function receiveDraft(value: unknown): CauslDraft | null {
    const context = navigationContext();
    if (
      !context ||
      !object(value) ||
      value.kind !== "causl:draft" ||
      typeof value.id !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value.id
      ) ||
      !reference(value.text, 4000) ||
      !value.text.trim() ||
      draftIds.has(value.id)
    )
      return null;
    const proposed = parseCauslMessage({ ...value, kind: "causl:context" });
    if (
      !proposed ||
      proposed.nonce !== context.nonce ||
      proposed.revision !== context.revision ||
      JSON.stringify(proposed.actor) !== JSON.stringify(context.actor) ||
      JSON.stringify(proposed.selection) !== JSON.stringify(context.selection)
    )
      return null;
    draftIds.add(value.id);
    return { id: value.id, text: value.text };
  }

  return {
    receive,
    receiveDraft,
    prepareSubmission,
    navigationContext,
    dispose,
  };
}
