import { act, renderHook, waitFor } from "@testing-library/react";
import { useAutomaticBrief } from "./hooks";

describe("automatic saved evidence", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const messages = [
    { type: "user", message: "Reach $10 million by 2027" },
    { type: "assistant", message: "Which customer decision matters?" },
  ];
  it("waits for streaming and prepares once without a page reload", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true, message: "saved evidence" }),
    } as Response);
    const { result, rerender } = renderHook(
      ({ busy }) =>
        useAutomaticBrief({ active: true, chatId: "chat-a", busy, messages }),
      { initialProps: { busy: true } }
    );
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(fetcher).not.toHaveBeenCalled();
    rerender({ busy: false });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    await waitFor(() =>
      expect(result.current.savedMessage).toBe("saved evidence")
    );
    rerender({ busy: false });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("extracts completed native packet answers before a page reload", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true, message: "saved packet evidence" }),
    } as Response);
    const live = [
      messages[0]!,
      {
        type: "assistant",
        message: "",
        packets: [
          {
            obj: {
              type: "message_start",
              content: "The baseline remains unknown.",
            },
          },
          { obj: { type: "stop" } },
        ],
      },
    ];
    const { result } = renderHook(() =>
      useAutomaticBrief({
        active: true,
        chatId: "live-chat",
        busy: false,
        messages: live,
      })
    );
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.savedMessage).toBe("saved packet evidence");
  });
  it("does not apply an old chat response to a different conversation", async () => {
    let finish!: (value: Response) => void;
    jest.spyOn(global, "fetch").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { result, rerender } = renderHook(
      ({ chatId }) =>
        useAutomaticBrief({ active: true, chatId, busy: false, messages }),
      { initialProps: { chatId: "chat-a" } }
    );
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    rerender({ chatId: "chat-b" });
    await act(async () => {
      finish({
        ok: true,
        json: async () => ({ saved: true, message: "wrong chat" }),
      } as Response);
    });
    expect(result.current.savedMessage).toBeNull();
  });
});

it("refreshes an incomplete saved brief instead of trapping the customer", async () => {
  jest.useFakeTimers();
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true, message: "updated saved brief" }),
    });
  const messages = [
    { type: "user", message: "The goal is 95 percent annual renewal." },
    {
      type: "assistant",
      message:
        'A draft. <interview-brief>{"version":2,"company":"Example","horizon":"Unknown","objective":{"text":"95 percent renewal","status":"executive","quote":"The goal is 95 percent annual renewal."},"journey":[],"keyResults":[],"transitions":[],"model":{"equation":{"text":"Renewals divided by accounts","status":"assumption"},"inputs":[],"gaps":[]},"interventions":[],"conflicts":[]}</interview-brief>',
    },
  ];
  renderHook(() =>
    useAutomaticBrief({
      active: true,
      chatId: "partial",
      busy: false,
      messages,
    })
  );
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
