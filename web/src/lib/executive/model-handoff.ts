import { parseModelContext, type ModelContext } from "@/lib/executive/model-context";

/** One origin-bound review window. Native Onyx remains the only conversation. */
export function createModelHandoff(options: {
  destination: string;
  onStatus: (status: string) => void;
  onConnected: (connected: boolean) => void;
  onContext?: (context: ModelContext | null) => void;
}) {
  const target = new URL(options.destination);
  let nonce = crypto.randomUUID();
  let child: Window | null = null;
  let marketId: string | null = null;
  let context: ModelContext | null = null;
  let pending: Record<string, unknown> | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function openWindow(url: URL, message: Record<string, unknown> | null) {
    // Reject previous-page heartbeats while the named window navigates.
    nonce = crypto.randomUUID();
    pending = message;
    url.searchParams.set("handoff", nonce);
    child = window.open(url.href, "burn-model-review");
    if (!child) {
      pending = null;
      options.onStatus("blocked");
      return;
    }
    child.focus();
    options.onStatus("waiting");
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      pending = null;
      options.onStatus("expired");
    }, 600_000);
  }

  function receive(event: MessageEvent) {
    if (
      event.origin !== target.origin ||
      event.source !== child ||
      event.data?.nonce !== nonce
    )
      return;
    if (event.data.context !== undefined) {
      const incoming = parseModelContext(event.data.context);
      if (
        incoming &&
        context?.modelId === incoming.modelId &&
        context.revision > incoming.revision
      )
        return;
      if (
        !incoming ||
        incoming.marketId !== event.data.marketId ||
        incoming.revision !== event.data.revision
      ) {
        context = null;
        marketId = null;
        options.onContext?.(null);
        options.onConnected(false);
        options.onStatus("unavailable");
        return;
      }
      if (
        event.data.type !== "burn-model-context" &&
        event.data.type !== "burn-scenario-result"
      )
        return;
      if (
        event.data.type === "burn-scenario-result" &&
        incoming.state !== event.data.status
      )
        return;
      context = incoming;
      options.onContext?.(context);
    }
    if (event.data.type === "burn-ready" && pending) {
      child?.postMessage({ ...pending, nonce }, target.origin);
      pending = null;
      clearTimeout(timeout);
      options.onStatus("transferred");
    }
    if (
      event.data.type === "burn-model-context" &&
      typeof event.data.marketId === "string" &&
      event.data.marketId.length > 0 &&
      event.data.marketId.length <= 200 &&
      Number.isInteger(event.data.revision) &&
      event.data.revision > 0
    ) {
      if (
        event.data.context === undefined &&
        context &&
        (context.marketId !== event.data.marketId ||
          context.revision !== event.data.revision)
      ) {
        context = null;
        options.onContext?.(null);
      }
      marketId = event.data.marketId;
      clearTimeout(timeout);
      options.onConnected(true);
      options.onStatus("connected");
    }
    if (
      event.data.type === "burn-scenario-result" &&
      ["proposed", "saved", "rejected", "error"].includes(event.data.status)
    ) {
      if (event.data.context === undefined) {
        context = null;
        options.onContext?.(null);
      }
      options.onStatus(event.data.status);
    }
  }
  window.addEventListener("message", receive);

  return {
    recover() {
      marketId = null;
      options.onConnected(false);
      context = null;
      options.onContext?.(null);
      openWindow(new URL(target), null);
    },
    open(payload: unknown) {
      marketId = null;
      options.onConnected(false);
      context = null;
      options.onContext?.(null);
      openWindow(new URL(target), { type: "burn-handoff", payload });
    },
    request(instruction: string) {
      if (!marketId || !instruction.trim() || instruction.length > 4000) {
        options.onStatus("unavailable");
        return;
      }
      const url = new URL("/dashboard/model-scenarios", target);
      url.searchParams.set("market", marketId);
      if (context) {
        context = {
          ...context,
          state: "awaiting-preview",
          calculation: undefined,
        };
        options.onContext?.(context);
      }
      openWindow(url, { type: "burn-scenario-request", instruction });
    },
    dispose() {
      clearTimeout(timeout);
      pending = null;
      context = null;
      options.onContext?.(null);
      window.removeEventListener("message", receive);
    },
  };
}
