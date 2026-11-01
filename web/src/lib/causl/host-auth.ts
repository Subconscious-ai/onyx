/** Host credentials stay in memory and are sent only to this Onyx API. */
export function installHostAuthentication(options: {
  origin: string;
  fetch: typeof fetch;
  token: () => Promise<string>;
}): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      options.origin
    );
    if (url.origin !== options.origin || !url.pathname.startsWith("/api/"))
      return options.fetch(input, init);
    const token = await options.token();
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Causl-Host-Auth", "1");
    return options.fetch(input, {
      ...init,
      headers,
      credentials: "omit",
      cache: "no-store",
    });
  };
}

export function isHostAuthenticatedWorkspace(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.pathname === "/causl" &&
    new URLSearchParams(window.location.search).get("hostAuth") === "1"
  );
}

class HostSessionTimeoutError extends Error {}

export function createHostTokenProvider(options: {
  window: Window;
  parentOrigin: string;
  nonce: string;
}) {
  let pending: Promise<string> | null = null;
  let disposed = false;
  let cancel: (() => void) | undefined;
  function token(): Promise<string> {
    if (disposed) return Promise.reject(new Error("Host session ended"));
    if (pending) return pending;
    // A delayed parent reply must not discard the open conversation.
    pending = requestToken()
      .catch((error: Error) => {
        if (error instanceof HostSessionTimeoutError && !disposed)
          return requestToken();
        throw error;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }
  function requestToken(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const id = options.window.crypto.randomUUID();
      const timeout = setTimeout(
        () => finish(new HostSessionTimeoutError("Host session unavailable")),
        15000
      );
      function finish(result: Error | string) {
        clearTimeout(timeout);
        options.window.removeEventListener("message", receive);
        cancel = undefined;
        if (result instanceof Error) reject(result);
        else resolve(result);
      }
      function receive(event: MessageEvent) {
        const value = event.data;
        if (
          event.source !== options.window.parent ||
          event.origin !== options.parentOrigin ||
          !value ||
          value.nonce !== options.nonce ||
          value.id !== id
        )
          return;
        if (value.kind === "causl:auth-error")
          finish(new Error("Host session ended"));
        else if (
          value.kind === "causl:auth" &&
          typeof value.token === "string" &&
          value.token.length > 0 &&
          value.token.length < 32768 &&
          typeof value.expiresAt === "number" &&
          value.expiresAt * 1000 > Date.now()
        )
          finish(value.token);
      }
      cancel = () => finish(new Error("Host session ended"));
      options.window.addEventListener("message", receive);
      options.window.parent.postMessage(
        { kind: "causl:auth-request", nonce: options.nonce, id },
        options.parentOrigin
      );
    });
  }
  return {
    token,
    dispose() {
      disposed = true;
      cancel?.();
    },
  };
}
