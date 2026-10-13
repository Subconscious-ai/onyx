import { sendMessage } from "@/app/app/services/lib";

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
