import { ChatFileType } from "@/app/app/interfaces";
import { buildChatUrl, sendMessage } from "@/app/app/services/lib";

test("sends the selected workspace with the existing native chat transport", async () => {
  const selection = { page: "models" as const, marketId: "market_b" };
  const response = new Response('{"obj":{"type":"stop"}}\n');
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(response);
  try {
    const stream = sendMessage({
      message: "Explain the current model",
      chatSessionId: "owned-native-chat",
      parentMessageId: -1,
      filters: null,
      causlSelection: selection,
    });
    expect(await stream.next()).toMatchObject({
      value: { obj: { type: "stop" } },
    });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/chat/send-chat-message");
    const payload = JSON.parse(String(options?.body));
    expect(payload.chat_session_id).toBe("owned-native-chat");
    expect(payload.causl_selection).toEqual(selection);
    expect(payload.actor).toBeUndefined();
    expect(payload.organizationId).toBeUndefined();
  } finally {
    fetchMock.mockRestore();
  }
});

test("keeps Twenty record scope and native attachment descriptors together", async () => {
  const files = [
    { id: "owned-file", type: ChatFileType.PLAIN_TEXT, name: "notes.txt" },
  ];
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response('{"obj":{"type":"stop"}}\n'));
  try {
    const stream = sendMessage({
      message: "Read this attachment",
      chatSessionId: "personal-chat",
      parentMessageId: -1,
      filters: null,
      fileDescriptors: files,
      twentyContextId: "opaque-context",
    });
    await stream.next();
    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.file_descriptors).toEqual(files);
    expect(payload.twenty_context_id).toBe("opaque-context");
    expect(payload.causl_selection).toBeUndefined();
  } finally {
    fetchMock.mockRestore();
  }
});

test("native first-send navigation keeps the Twenty host session", () => {
  const params = new URLSearchParams({
    hostAuth: "1",
    pageKind: "twenty",
    parentOrigin: "https://twenty.example",
    bridge: "nonce",
  });
  const result = buildChatUrl(
    params as import("next/navigation").ReadonlyURLSearchParams,
    "personal-chat",
    0
  );
  expect(result).toMatch(/^\/causl\?/);
  expect(
    new URL(result, "https://onyx.example").searchParams.get("parentOrigin")
  ).toBe("https://twenty.example");
});
