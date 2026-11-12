import { act, deferred, renderHook } from "@tests/setup/test-utils";
import { useInterviewLibrary } from "@/lib/executive/library-connection";

const agent = {
  id: 2,
  tools: [{ name: "library_snapshot", mcp_server_id: 22 }],
};

afterEach(() => jest.restoreAllMocks());

test("pauses an unconnected first send and resumes its exact context once after normal OAuth", async () => {
  let connected = false;
  const fetch = jest
    .spyOn(global, "fetch")
    .mockImplementation(async (url, options) => {
      if (url === "/api/mcp/oauth/connect") {
        expect(JSON.parse(String(options?.body))).toMatchObject({
          server_id: 22,
          return_path: "/app?chatId=original",
          force_reauthentication: false,
        });
        connected = true;
        return {
          ok: true,
          json: async () => ({
            status: "authorization_required",
            authorization_url: "https://auth.example/authorize",
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          mcp_servers: [{ id: 22, user_can_authenticate: connected }],
        }),
      } as Response;
    });
  const popup = { closed: false, location: { href: "" }, close: jest.fn() };
  jest.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  const submitted = {
    message: "Target 7%, baseline 5.5%",
    context: "original model receipt",
    files: ["customer.csv"],
  };
  const nativeSend = jest.fn();
  const send = jest.fn(() => {
    nativeSend(submitted);
  });
  const { result } = renderHook(() => useInterviewLibrary(agent, "original"));
  await act(async () => {
    expect(await result.current.prepare(send)).toBe(false);
  });
  expect(send).not.toHaveBeenCalled();
  expect(result.current.needed).toBe(true);
  await act(async () => {
    await result.current.connect("/app?chatId=original");
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(nativeSend).toHaveBeenCalledWith({
    message: "Target 7%, baseline 5.5%",
    context: "original model receipt",
    files: ["customer.csv"],
  });
  expect(popup.location.href).toBe("https://auth.example/authorize");
  expect(popup.close).toHaveBeenCalledTimes(1);
  expect(result.current.needed).toBe(false);
  await act(async () => {
    await result.current.connect("/app?chatId=original");
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    fetch.mock.calls.filter(([url]) => url === "/api/mcp/oauth/connect")
  ).toHaveLength(1);
});

test("a connected workspace sends without opening OAuth", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      mcp_servers: [{ id: 22, user_can_authenticate: true }],
    }),
  } as Response);
  const open = jest.spyOn(window, "open");
  const send = jest.fn();
  const { result } = renderHook(() => useInterviewLibrary(agent, "original"));
  await act(async () => {
    expect(await result.current.prepare(send)).toBe(true);
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
});

test("a failed connection check never accepts or sends the draft", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false } as Response);
  const send = jest.fn();
  const reject = jest.fn();
  const { result } = renderHook(() => useInterviewLibrary(agent, "original"));
  await act(async () => {
    expect(await result.current.prepare(send, reject)).toBe(false);
  });
  expect(send).not.toHaveBeenCalled();
  expect(reject).toHaveBeenCalledTimes(1);
  expect(result.current.failed).toBe(true);
});

test.each(["closed", "blocked"])(
  "a %s OAuth popup leaves the message unsent",
  async (failure) => {
    const popup = { closed: false, location: { href: "" }, close: jest.fn() };
    jest
      .spyOn(window, "open")
      .mockReturnValue(
        failure === "blocked" ? null : (popup as unknown as Window)
      );
    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (url === "/api/mcp/oauth/connect") {
        popup.closed = true;
        return {
          ok: true,
          json: async () => ({
            status: "authorization_required",
            authorization_url: "https://auth.example/authorize",
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          mcp_servers: [{ id: 22, user_can_authenticate: false }],
        }),
      } as Response;
    });
    const send = jest.fn();
    const reject = jest.fn();
    const { result } = renderHook(() => useInterviewLibrary(agent, "original"));
    await act(async () => {
      await result.current.prepare(send, reject);
    });
    expect(reject).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.connect("/app?chatId=original");
    });
    expect(send).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledTimes(1);
    expect(result.current.needed).toBe(false);
    expect(result.current.connecting).toBe(false);
  }
);

test.each(["navigate", "cancel"])(
  "%s during OAuth cannot send the pending message later",
  async (action) => {
    const authorization = deferred<Response>();
    const popup = { closed: false, location: { href: "" }, close: jest.fn() };
    jest.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (url === "/api/mcp/oauth/connect") return authorization.promise;
      return {
        ok: true,
        json: async () => ({
          mcp_servers: [{ id: 22, user_can_authenticate: false }],
        }),
      } as Response;
    });
    const send = jest.fn();
    const reject = jest.fn();
    const { result, rerender } = renderHook(
      ({ scope }) => useInterviewLibrary(agent, scope),
      { initialProps: { scope: "original" } }
    );
    await act(async () => {
      await result.current.prepare(send, reject);
    });
    let connecting: Promise<void>;
    act(() => {
      connecting = result.current.connect("/app?chatId=original");
    });
    act(() => {
      if (action === "navigate") rerender({ scope: "other-chat" });
      else result.current.cancel();
    });
    await act(async () => {
      authorization.resolve({
        ok: true,
        json: async () => ({
          status: "authorization_required",
          authorization_url: "https://auth.example/authorize",
        }),
      } as Response);
      await connecting;
    });
    expect(send).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledTimes(1);
    expect(popup.close).toHaveBeenCalled();
    expect(result.current.needed).toBe(false);
  }
);

test("navigation while the initial connection check waits rejects the old submission", async () => {
  const status = deferred<Response>();
  jest.spyOn(global, "fetch").mockReturnValue(status.promise);
  const send = jest.fn();
  const reject = jest.fn();
  const { result, rerender } = renderHook(
    ({ scope }) => useInterviewLibrary(agent, scope),
    { initialProps: { scope: "original" } }
  );
  let checking: Promise<boolean>;
  act(() => {
    checking = result.current.prepare(send, reject);
  });
  rerender({ scope: "other-chat" });
  await act(async () => {
    status.resolve({
      ok: true,
      json: async () => ({
        mcp_servers: [{ id: 22, user_can_authenticate: true }],
      }),
    } as Response);
    await checking;
  });
  expect(send).not.toHaveBeenCalled();
  expect(reject).toHaveBeenCalledTimes(1);
});

test("double connect starts only one authorization and sends only once", async () => {
  const authorization = deferred<Response>();
  let connected = false;
  const popup = { closed: false, location: { href: "" }, close: jest.fn() };
  const open = jest
    .spyOn(window, "open")
    .mockReturnValue(popup as unknown as Window);
  jest.spyOn(global, "fetch").mockImplementation(async (url) => {
    if (url === "/api/mcp/oauth/connect") return authorization.promise;
    return {
      ok: true,
      json: async () => ({
        mcp_servers: [{ id: 22, user_can_authenticate: connected }],
      }),
    } as Response;
  });
  const send = jest.fn();
  const { result } = renderHook(() => useInterviewLibrary(agent, "original"));
  await act(async () => {
    await result.current.prepare(send);
  });
  let first: Promise<void>;
  act(() => {
    first = result.current.connect("/app?chatId=original");
  });
  await act(async () => {
    await result.current.connect("/app?chatId=original");
  });
  expect(open).toHaveBeenCalledTimes(1);
  await act(async () => {
    connected = true;
    authorization.resolve({
      ok: true,
      json: async () => ({
        status: "authorization_required",
        authorization_url: "https://auth.example/authorize",
      }),
    } as Response);
    await first;
  });
  expect(send).toHaveBeenCalledTimes(1);
});
