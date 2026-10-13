import {
  createCauslBridge,
  openCauslWorkspace,
  parseCauslMessage,
  CauslWorkspaceError,
} from "./bridge";
import type { CauslContextMessage, CauslWorkspace } from "./types";

const message = (
  revision: number,
  page: "library" | "models" = "library"
): CauslContextMessage => ({
  kind: "causl:context",
  nonce: "frame-nonce",
  revision,
  actor: { orgId: "org_b", userId: "auth0|alice" },
  selection: { page, marketId: "market_b" },
});
const workspace: CauslWorkspace = {
  chatId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  agentId: 11,
  scopeKey: "b".repeat(64),
  contextDigest: "c".repeat(64),
};

function pending() {
  let resolve!: (result: CauslWorkspace) => void;
  const promise = new Promise<CauslWorkspace>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("native workspace context bridge", () => {
  test("rejects draft handoff while a newer page context is pending and after a scope switch", async () => {
    const next = pending();
    const open = jest
      .fn()
      .mockResolvedValueOnce(workspace)
      .mockReturnValueOnce(next.promise);
    const onError = jest.fn();
    const controller = createCauslBridge({
      nonce: "frame-nonce",
      open,
      onReady: jest.fn(),
      onError,
    });
    controller.receive(message(1));
    await controller.prepareSubmission();
    controller.receive(message(2, "models"));
    const draft = {
      ...message(2, "models"),
      kind: "causl:draft",
      id: "ed27d121-b407-4920-b43a-c3281ed9d62e",
      text: "Explain this model",
    };
    expect(controller.receiveDraft(draft)).toBeNull();
    expect(
      controller.receiveDraft({ ...draft, ...message(1), kind: "causl:draft" })
    ).toBeNull();
    next.resolve(workspace);
    await controller.prepareSubmission();
    expect(controller.receiveDraft(draft)).toEqual({
      id: draft.id,
      text: draft.text,
    });
    controller.receive({
      ...message(3, "models"),
      actor: { orgId: "org_c", userId: "auth0|alice" },
    });
    expect(onError).toHaveBeenCalledWith("changed");
    expect(
      controller.receiveDraft({
        ...draft,
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      })
    ).toBeNull();
  });
  test("accepts one bounded question only for the exact verified caller, selection and revision", async () => {
    const controller = createCauslBridge({
      nonce: "frame-nonce",
      open: jest.fn().mockResolvedValue(workspace),
      onReady: jest.fn(),
      onError: jest.fn(),
    });
    const context = message(1, "models");
    const draft = {
      ...context,
      kind: "causl:draft",
      id: "ed27d121-b407-4920-b43a-c3281ed9d62e",
      text: "Explain the selected model",
    };
    expect(controller.receiveDraft(draft)).toBeNull();
    controller.receive(context);
    await controller.prepareSubmission();
    expect(
      controller.receiveDraft({
        ...draft,
        actor: { ...context.actor, orgId: "foreign" },
      })
    ).toBeNull();
    expect(
      controller.receiveDraft({
        ...draft,
        selection: { ...context.selection, marketId: "foreign" },
      })
    ).toBeNull();
    expect(controller.receiveDraft({ ...draft, revision: 0 })).toBeNull();
    expect(controller.receiveDraft({ ...draft, nonce: "foreign" })).toBeNull();
    expect(
      controller.receiveDraft({ ...draft, text: "x".repeat(4001) })
    ).toBeNull();
    expect(controller.receiveDraft(draft)).toEqual({
      id: draft.id,
      text: draft.text,
    });
    expect(controller.receiveDraft(draft)).toBeNull();
    controller.dispose();
    expect(
      controller.receiveDraft({ ...draft, id: "a".repeat(36) })
    ).toBeNull();
  });
  test("forwards an exact saved report selection and rejects malformed report identities", async () => {
    const selected: CauslContextMessage = {
      ...message(1),
      selection: {
        page: "reports",
        marketId: "market_b",
        runId: "run_b",
        studioId: "ed27d121-b407-4920-b43a-c3281ed9d62e",
      },
    };
    const open = jest.fn().mockResolvedValue(workspace);
    const controller = createCauslBridge({
      nonce: "frame-nonce",
      open,
      onReady: jest.fn(),
      onError: jest.fn(),
    });
    controller.receive(selected);
    expect(await controller.prepareSubmission()).toEqual(selected.selection);
    expect(open).toHaveBeenCalledWith(selected, expect.any(AbortSignal));
    expect(
      parseCauslMessage({
        ...selected,
        selection: { ...selected.selection, studioId: "-".repeat(36) },
      })
    ).toBeNull();
  });

  test("retains the conversation and uses the latest page before sending", async () => {
    const open = jest.fn().mockResolvedValue(workspace);
    const onReady = jest.fn();
    const controller = createCauslBridge({
      nonce: "frame-nonce",
      open,
      onReady,
      onError: jest.fn(),
    });
    controller.receive(message(1));
    expect(await controller.prepareSubmission()).toEqual({
      page: "library",
      marketId: "market_b",
    });
    controller.receive(message(2, "models"));
    expect(await controller.prepareSubmission()).toEqual({
      page: "models",
      marketId: "market_b",
    });
    expect(onReady.mock.calls.map(([ready]) => ready.chatId)).toEqual([
      workspace.chatId,
      workspace.chatId,
    ]);
  });

  test("rejects another frame and reordered page updates", async () => {
    const open = jest.fn().mockResolvedValue(workspace);
    const controller = createCauslBridge({
      nonce: "frame-nonce",
      open,
      onReady: jest.fn(),
      onError: jest.fn(),
    });
    controller.receive({ ...message(1), nonce: "other-frame" });
    expect(open).not.toHaveBeenCalled();
    controller.receive(message(3, "models"));
    controller.receive(message(2));
    expect(await controller.prepareSubmission()).toEqual({
      page: "models",
      marketId: "market_b",
    });
    expect(open).toHaveBeenCalledTimes(1);
  });

  test("fences a late context response and a pending submission after navigation", async () => {
    const first = pending();
    const second = pending();
    const open = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onReady = jest.fn();
    const controller = createCauslBridge({
      nonce: "frame-nonce",
      open,
      onReady,
      onError: jest.fn(),
    });
    controller.receive(message(1));
    const submitted = controller.prepareSubmission();
    const rejected = expect(submitted).rejects.toMatchObject({
      reason: "changed",
    });
    controller.receive(message(2, "models"));
    expect(open.mock.calls[0][1].aborted).toBe(true);
    first.resolve(workspace);
    await rejected;
    expect(onReady).not.toHaveBeenCalled();
    second.resolve(workspace);
    expect(await controller.prepareSubmission()).toEqual({
      page: "models",
      marketId: "market_b",
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test.each(["organization", "caller", "market"])(
    "requires a new frame for a changed %s",
    async (field) => {
      const result = pending();
      const onReady = jest.fn();
      const onError = jest.fn();
      const controller = createCauslBridge({
        nonce: "frame-nonce",
        open: jest.fn().mockReturnValue(result.promise),
        onReady,
        onError,
      });
      controller.receive(message(1));
      const next = message(2);
      if (field === "organization") next.actor.orgId = "org_a";
      if (field === "caller") next.actor.userId = "auth0|bob";
      if (field === "market") next.selection.marketId = "market_a";
      controller.receive(next);
      result.resolve(workspace);
      await expect(controller.prepareSubmission()).rejects.toMatchObject({
        reason: "changed",
      });
      expect(onReady).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith("changed");
    }
  );

  test("refuses a disposed frame even if its context request succeeds later", async () => {
    const result = pending();
    const onReady = jest.fn();
    const controller = createCauslBridge({
      nonce: "frame-nonce",
      open: jest.fn().mockReturnValue(result.promise),
      onReady,
      onError: jest.fn(),
    });
    controller.receive(message(1));
    controller.dispose();
    result.resolve(workspace);
    await expect(controller.prepareSubmission()).rejects.toBeInstanceOf(
      CauslWorkspaceError
    );
    expect(onReady).not.toHaveBeenCalled();
  });

  test("rejects malformed page references without opening a conversation", () => {
    expect(
      parseCauslMessage({
        ...message(1),
        selection: { page: "admin", record: { id: "foreign" } },
      })
    ).toBeNull();
    expect(parseCauslMessage({ ...message(1), revision: NaN })).toBeNull();
  });

  test("uses native authenticated transport and refuses an invalid response", async () => {
    const original = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...workspace, agentId: -1 }))
      );
    global.fetch = fetchMock;
    try {
      await expect(
        openCauslWorkspace(message(1), new AbortController().signal)
      ).rejects.toMatchObject({ reason: "unavailable" });
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/chat/causl-workspace");
      expect(JSON.parse(options.body)).toEqual({
        actor: message(1).actor,
        selection: message(1).selection,
      });
      expect(options.headers.Authorization).toBeUndefined();
    } finally {
      global.fetch = original;
    }
  });
});
