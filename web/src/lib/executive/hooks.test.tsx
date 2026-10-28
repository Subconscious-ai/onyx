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
  it("recovers a stalled background brief through the existing locked POST", async () => {
    const fetcher = jest.spyOn(global, "fetch").mockImplementation(
      async (_url, init) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            init?.method === "POST"
              ? { saved: true, message: "latest saved evidence" }
              : { saved: false, background: true },
        }) as Response
    );
    const { result } = renderHook(() =>
      useAutomaticBrief({
        active: true,
        chatId: "stalled-chat",
        busy: false,
        messages,
      })
    );
    for (let i = 0; i < 7; i++) {
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
    }
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(1);
    expect(result.current.savedMessage).toBe("latest saved evidence");
  });
  it("checks Library delivery even when the message already contains a ready draft", async () => {
    const quote = "Grow renewals";
    const brief = {
      version: 2,
      company: "Example",
      horizon: "Unknown",
      objective: { text: quote, status: "executive", quote },
      journey: [
        {
          id: "use",
          actor: "Buyer",
          text: "Uses product",
          status: "assumption",
        },
        { id: "renew", actor: "Buyer", text: "Renews", status: "assumption" },
      ],
      keyResults: [
        {
          id: "renewals",
          metric: "Renewals",
          unit: "customers",
          direction: "increase",
          baseline: { text: "Unknown", status: "unknown" },
          target: { text: "Unknown", status: "unknown" },
          deadline: { text: "Unknown", status: "unknown" },
          journeyIds: ["renew"],
        },
      ],
      transitions: [
        {
          id: "renewal",
          from: "use",
          to: "renew",
          behavior: { text: "Chooses to renew", status: "assumption" },
          metric: "Renewal rate",
        },
      ],
      model: {
        equation: { text: "Users times renewal rate", status: "assumption" },
        inputs: [
          {
            id: "users",
            name: "Users",
            unit: "customers",
            value: { text: "Unknown", status: "unknown" },
          },
        ],
        gaps: [],
      },
      interventions: [],
      conflicts: [],
    };
    const fetcher = jest.spyOn(global, "fetch").mockImplementation(
      async (_url, init) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            init?.method === "POST"
              ? { saved: true, message: "Library saved evidence" }
              : { saved: false, background: false },
        }) as Response
    );
    const { result } = renderHook(() =>
      useAutomaticBrief({
        active: true,
        chatId: "ready-inline",
        busy: false,
        messages: [
          { type: "user", message: quote },
          {
            type: "assistant",
            message: `<interview-brief>${JSON.stringify(brief)}</interview-brief>`,
          },
        ],
      })
    );
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    await act(async () => {
      jest.advanceTimersByTime(10);
    });
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
      "GET",
      "POST",
    ]);
    expect(result.current.savedMessage).toBe("Library saved evidence");
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
  it("reads background progress without starting a competing extraction", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ saved: false, background: true }),
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
      "/api/chat/executive-brief?chat_id=chat-a",
      expect.objectContaining({ method: "GET" })
    );
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.savedMessage).toBe("worker evidence");
    expect(
      fetcher.mock.calls.every(([, options]) => options?.method === "GET")
    ).toBe(true);
  });
  it("cancels pending polls and never schedules after an unmounted read completes", async () => {
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
        ok: true,
        json: async () => ({ saved: false, background: true }),
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
  it("exposes the editable profile when the API supports correction revisions", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ready",
        profile: { company: "Corrected" },
        checked_at: 1234,
        job_id: "retained-operation",
        correction: { revision: 2, fields: { company: "Corrected" } },
        research: { status: "needs_company" },
      }),
    } as Response);
    const { result } = renderHook(() => useExecutiveContext(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.profile?.correction.revision).toBe(2);
    expect(result.current.profile?.checked_at).toBe(1234);
    expect(result.current.profile?.job_id).toBe("retained-operation");
    expect(global.fetch).toHaveBeenCalledWith("/api/chat/executive-profile", {
      method: "POST",
    });
    expect(result.current.profileStatus).toContain("Your company context");
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
