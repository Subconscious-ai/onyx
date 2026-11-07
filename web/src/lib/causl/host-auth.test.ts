import {
  createHostTokenProvider,
  installHostAuthentication,
} from "./host-auth";

test("embedded requests use the host token without sending an Onyx cookie", async () => {
  const underlying = jest.fn().mockResolvedValue(new Response("{}"));
  const fetcher = installHostAuthentication({
    origin: "https://chat.example",
    fetch: underlying,
    token: async () => "verified-host-token",
  });
  await fetcher("https://chat.example/api/chat/causl-workspace", {
    method: "POST",
  });
  expect(underlying).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ credentials: "omit", cache: "no-store" })
  );
  expect(
    new Headers(underlying.mock.calls[0][1].headers).get("authorization")
  ).toBe("Bearer verified-host-token");
  expect(
    new Headers(underlying.mock.calls[0][1].headers).get("x-causl-host-auth")
  ).toBe("1");
  await fetcher("https://unrelated.example/api/chat");
  expect(underlying.mock.calls[1][1]).toBeUndefined();
});

test("a failed host session never falls back to an Onyx cookie", async () => {
  const underlying = jest.fn();
  const fetcher = installHostAuthentication({
    origin: "https://chat.example",
    fetch: underlying,
    token: async () => {
      throw new Error("Host session ended");
    },
  });
  await expect(fetcher("https://chat.example/api/me")).rejects.toThrow(
    "Host session ended"
  );
  expect(underlying).not.toHaveBeenCalled();
});

function frame() {
  let request = 0;
  const listeners = new Set<(event: MessageEvent) => void>();
  const parent = { postMessage: jest.fn() };
  const child = {
    parent,
    crypto: {
      randomUUID: () =>
        ++request === 1 ? "request-uuid" : `request-uuid-${request}`,
    },
    addEventListener: (
      _type: string,
      listener: (event: MessageEvent) => void
    ) => listeners.add(listener),
    removeEventListener: (
      _type: string,
      listener: (event: MessageEvent) => void
    ) => listeners.delete(listener),
  };
  const provider = createHostTokenProvider({
    window: child as unknown as Window,
    parentOrigin: "https://kb.example",
    nonce: "frame-nonce",
  });
  const reply = (
    changes: Record<string, unknown> = {},
    data: Record<string, unknown> = {}
  ) => {
    const event = {
      source: parent,
      origin: "https://kb.example",
      data: {
        kind: "causl:auth",
        nonce: "frame-nonce",
        id: parent.postMessage.mock.calls.at(-1)?.[0].id,
        token: "fresh-token",
        expiresAt: Date.now() / 1000 + 300,
        ...data,
      },
      ...changes,
    };
    listeners.forEach((listener) => listener(event as unknown as MessageEvent));
  };
  return { provider, parent, listeners, reply };
}

test("a delayed host reply retries once before sending the authenticated workspace request", async () => {
  jest.useFakeTimers();
  const f = frame();
  const underlying = jest.fn().mockResolvedValue(new Response("{}"));
  const fetcher = installHostAuthentication({
    origin: "https://chat.example",
    fetch: underlying,
    token: f.provider.token,
  });
  try {
    const result = fetcher("/api/chat/causl-workspace").then(
      (response) => response.status,
      (error: Error) => error.message
    );
    await jest.advanceTimersByTimeAsync(15_000);
    expect(underlying).not.toHaveBeenCalled();
    f.reply({}, { id: "request-uuid", token: "late-first-token" });
    await Promise.resolve();
    expect(underlying).not.toHaveBeenCalled();
    f.reply();
    expect(await result).toBe(200);
    expect(underlying).toHaveBeenCalledTimes(1);
    const options = underlying.mock.calls[0][1];
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer fresh-token"
    );
    expect(options.credentials).toBe("omit");
  } finally {
    f.provider.dispose();
    jest.useRealTimers();
  }
});

test("two unanswered handshakes stop without sending an unauthenticated request", async () => {
  jest.useFakeTimers();
  const f = frame();
  const underlying = jest.fn();
  const fetcher = installHostAuthentication({
    origin: "https://chat.example",
    fetch: underlying,
    token: f.provider.token,
  });
  try {
    const result = fetcher("/api/chat/causl-workspace").catch(
      (error: Error) => error.message
    );
    await jest.advanceTimersByTimeAsync(30_000);
    expect(await result).toBe("Host session unavailable");
    expect(f.parent.postMessage).toHaveBeenCalledTimes(2);
    expect(underlying).not.toHaveBeenCalled();
    expect(f.listeners.size).toBe(0);
  } finally {
    f.provider.dispose();
    jest.useRealTimers();
  }
});

test("host handshake rejects unrelated origins, windows, nonces and request ids", async () => {
  const f = frame();
  const pending = f.provider.token();
  const settled = jest.fn();
  void pending.then(settled);
  expect(f.parent.postMessage).toHaveBeenCalledWith(
    { kind: "causl:auth-request", nonce: "frame-nonce", id: "request-uuid" },
    "https://kb.example"
  );
  f.reply({ origin: "https://evil.example" });
  f.reply({ source: {} });
  f.reply({}, { nonce: "other-frame" });
  f.reply({}, { id: "old-request" });
  f.reply({}, { expiresAt: 1 });
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  f.reply();
  await expect(pending).resolves.toBe("fresh-token");
  expect(f.listeners.size).toBe(0);
  f.provider.dispose();
});

test("concurrent API calls share one live request and later calls recheck the host session", async () => {
  const f = frame();
  const first = f.provider.token();
  const concurrent = f.provider.token();
  expect(first).toBe(concurrent);
  f.reply();
  await first;
  const next = f.provider.token();
  expect(f.parent.postMessage).toHaveBeenCalledTimes(2);
  f.reply({}, { kind: "causl:auth-error" });
  await expect(next).rejects.toThrow("Host session ended");
  f.provider.dispose();
});

test("unmount cancels the handshake and rejects later credential requests", async () => {
  const f = frame();
  const pending = f.provider.token();
  f.provider.dispose();
  await expect(pending).rejects.toThrow("Host session ended");
  await expect(f.provider.token()).rejects.toThrow("Host session ended");
  expect(f.listeners.size).toBe(0);
});
