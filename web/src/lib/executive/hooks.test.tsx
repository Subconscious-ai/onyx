import { act, renderHook, waitFor } from "@testing-library/react";
import { useAutomaticBrief, useExecutiveContext } from "./hooks";

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
  it("publishes each completed native turn even when its inline brief is already usable", async () => {
    // POST /api/chat/executive-brief validates the native brief and publishes shared memory.
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true, message: "published evidence" }),
    } as Response);
    const brief = {
      version: 2,
      company: "Example",
      horizon: "2027",
      objective: {
        text: "Reach $10 million",
        status: "executive",
        quote: messages[0]!.message,
      },
      journey: [
        {
          id: "consider",
          actor: "Buyer",
          text: "Considers",
          status: "assumption",
        },
        { id: "buy", actor: "Buyer", text: "Buys", status: "assumption" },
      ],
      keyResults: [
        {
          id: "revenue",
          metric: "Revenue",
          unit: "USD",
          direction: "increase",
          baseline: { text: "Unknown", status: "unknown" },
          target: {
            text: "$10 million",
            status: "executive",
            quote: messages[0]!.message,
          },
          deadline: {
            text: "2027",
            status: "executive",
            quote: messages[0]!.message,
          },
          journeyIds: ["buy"],
        },
      ],
      transitions: [
        {
          id: "purchase",
          from: "consider",
          to: "buy",
          metric: "Revenue",
          behavior: { text: "Chooses to buy", status: "assumption" },
        },
      ],
      model: {
        equation: { text: "buyers * spend", status: "assumption" },
        inputs: [
          {
            id: "buyers",
            name: "Buyers",
            unit: "buyers",
            value: { text: "Unknown", status: "unknown" },
          },
        ],
        gaps: [],
      },
      interventions: [],
      conflicts: [],
    };
    const completed = [
      messages[0]!,
      {
        type: "assistant",
        message: `Your first draft is ready. <interview-brief>${JSON.stringify(brief)}</interview-brief>`,
      },
    ];
    const { result, rerender } = renderHook(
      ({ busy, messages }) =>
        useAutomaticBrief({
          active: true,
          chatId: "native-chat",
          busy,
          messages,
        }),
      { initialProps: { busy: false, messages: completed } }
    );
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/chat/executive-brief",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chat_id: "native-chat" }),
      })
    );
    expect(result.current.savedMessage).toBe("published evidence");
    rerender({ busy: true, messages: completed });
    rerender({ busy: false, messages: completed });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    rerender({
      busy: false,
      messages: [
        ...completed,
        { type: "user", message: "Make the journey direct sales." },
        {
          type: "assistant",
          message: `Updated the journey. <interview-brief>${JSON.stringify(brief)}</interview-brief>`,
        },
      ],
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("exposes a failed publication and retries through the existing POST", async () => {
    // POST /api/chat/executive-brief fails once, then the existing retry succeeds.
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ saved: true, message: "latest saved evidence" }),
      } as Response);
    const { result } = renderHook(() =>
      useAutomaticBrief({
        active: true,
        chatId: "stalled-chat",
        busy: false,
        messages,
      })
    );
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.phase).toBe("error");
    act(() => result.current.retry());
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(([, init]) => init?.method === "POST")
    ).toBe(true);
    expect(result.current.savedMessage).toBe("latest saved evidence");
  });
  it("publishes completed provider receipts without another executive turn or clearing the saved brief", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        saved: true,
        message: "saved evidence",
        memory_saved: true,
      }),
    } as Response);
    const { result, rerender } = renderHook(
      ({ contextRevision, busy }) =>
        useAutomaticBrief({
          active: true,
          chatId: "chat-a",
          busy,
          messages,
          contextRevision,
        }),
      { initialProps: { contextRevision: "pdl-100", busy: false } }
    );
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.savedMessage).toBe("saved evidence");
    rerender({ contextRevision: "pdl-100,research-101", busy: false });
    expect(result.current.savedMessage).toBe("saved evidence");
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(([, init]) => init?.method === "POST")
    ).toBe(true);
    rerender({ contextRevision: "pdl-100,research-101", busy: true });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    rerender({ contextRevision: "pdl-100,research-101", busy: false });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.savedMessage).toBe("saved evidence");
  });
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
  it("retries a locked brief through the same publication endpoint", async () => {
    // POST /api/chat/executive-brief respects the backend's single-flight lock.
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ detail: "Brief update in progress" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ saved: true, message: "worker evidence" }),
      } as Response);
    const { result } = renderHook(() =>
      useAutomaticBrief({
        active: true,
        chatId: "chat-a",
        busy: false,
        messages,
      })
    );
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.phase).toBe("updating");
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/chat/executive-brief",
      expect.objectContaining({ method: "POST" })
    );
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.savedMessage).toBe("worker evidence");
    expect(
      fetcher.mock.calls.every(([, options]) => options?.method === "POST")
    ).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("stops retrying a locked brief after 90 seconds and preserves manual retry", async () => {
    // POST /api/chat/executive-brief remains locked; stop automatic retries.
    const fetcher = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: "Brief update in progress" }),
    } as Response);
    const { result } = renderHook(() =>
      useAutomaticBrief({
        active: true,
        chatId: "locked",
        busy: false,
        messages,
      })
    );
    for (let i = 0; i < 47; i++) {
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
    }
    expect(result.current.phase).toBe("error");
    const calls = fetcher.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(fetcher).toHaveBeenCalledTimes(calls);
    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true, message: "published after retry" }),
    } as Response);
    act(() => result.current.retry());
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(result.current.savedMessage).toBe("published after retry");
  });
  it("cancels pending retries and never schedules after an unmounted publication completes", async () => {
    const schedule = jest.spyOn(global, "setTimeout");
    let finish!: (value: Response) => void;
    const fetcher = jest.spyOn(global, "fetch").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { unmount } = renderHook(() =>
      useAutomaticBrief({
        active: true,
        chatId: "chat-a",
        busy: false,
        messages,
      })
    );
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    unmount();
    const allocations = schedule.mock.calls.length;
    await act(async () => {
      finish({
        ok: false,
        status: 409,
        json: async () => ({ detail: "Brief update in progress" }),
      } as Response);
    });
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(allocations);
  });
  it("refreshes agent-corrected company context after a newly saved brief", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "not_found",
          research: { status: "needs_company" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ready",
          profile: { company: "Confirmed company" },
          correction: { revision: 1 },
          research: {
            status: "ready",
            report: "Fresh research",
            source_urls: ["https://example.com"],
          },
        }),
      } as Response);
    const { result, rerender } = renderHook(
      ({ brief }) => useExecutiveContext(true, brief),
      { initialProps: { brief: "" } }
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.dossier).toBeNull();
    rerender({ brief: "newly saved brief after company tool" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.dossier?.profile.company).toBe("Confirmed company");
    expect(result.current.research.report).toBe("Fresh research");
  });
  it("loads persisted public sources after profile startup without repeating enrichment", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ready",
          profile: { company: "Example" },
          research: { status: "queued" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ready",
          source_urls: ["https://example.com/product"],
        }),
      } as Response);
    const { result, unmount } = renderHook(() => useExecutiveContext(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.research.status).toBe("queued");
    expect(result.current.profile).toBeNull(); // Older APIs cannot save corrections.
    expect(result.current.dossier).toEqual({
      profile: { company: "Example" },
      source: "pdl",
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.research.source_urls).toEqual([
      "https://example.com/product",
    ]);
    expect(fetcher).toHaveBeenLastCalledWith("/api/chat/executive-research", {
      method: "GET",
    });
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("changes provider revision only for completed receipts, not running polls", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ready",
          checked_at: 100,
          profile: { company: "Example" },
          research: { status: "queued" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "running", checked_at: 101 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ready",
          checked_at: 102,
          source_urls: ["https://example.com/research"],
          report: "Completed research",
        }),
      } as Response);
    const { result } = renderHook(() => useExecutiveContext(true));
    await act(async () => {
      await Promise.resolve();
    });
    const profileRevision = result.current.contextRevision;
    expect(JSON.parse(profileRevision).profile).toContain("100");
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.research.status).toBe("running");
    expect(result.current.contextRevision).toBe(profileRevision);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.contextRevision).not.toBe(profileRevision);
    expect(JSON.parse(result.current.contextRevision).research).toContain(
      "Completed research"
    );
    expect(JSON.parse(result.current.contextRevision).profile).toBe(
      JSON.parse(profileRevision).profile
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("exposes the editable profile when the API supports correction revisions", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ready",
        profile: { company: "Corrected" },
        correction: { revision: 2, fields: { company: "Corrected" } },
        research: { status: "needs_company" },
      }),
    } as Response);
    const { result } = renderHook(() => useExecutiveContext(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.profile?.correction.revision).toBe(2);
    expect(result.current.profileStatus).toContain("Your company context");
  });
  it("refreshes completed source receipts when unchanged sources are saved to shared memory", async () => {
    let memorySaved = false;
    jest.spyOn(global, "fetch").mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({
            status: "ready",
            memory_saved: memorySaved,
            checked_at: 100,
            profile: { company: "Example" },
            research: {
              status: "ready",
              checked_at: 101,
              report: "Completed research",
              source_urls: ["https://example.com/research"],
            },
          }),
        }) as Response
    );
    const { result } = renderHook(() => useExecutiveContext(true));
    await act(async () => {
      await Promise.resolve();
    });
    const loaded = JSON.parse(result.current.contextRevision);
    memorySaved = true;
    act(() => result.current.reload());
    await act(async () => {
      await Promise.resolve();
    });
    const saved = JSON.parse(result.current.contextRevision);
    expect(saved.profile).not.toBe(loaded.profile);
    expect(saved.research).not.toBe(loaded.research);
    expect(result.current.dossier?.profile.company).toBe("Example");
    expect(result.current.research.report).toBe("Completed research");
  });
});

it("refreshes an incomplete saved brief instead of trapping the customer", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue({
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
