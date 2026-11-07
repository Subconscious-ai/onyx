import React from "react";
import { act, render, screen, waitFor } from "@tests/setup/test-utils";
import WorkspaceChat from "./WorkspaceChat";
import { CauslWorkspaceError, openCauslWorkspace } from "./bridge";
import type { CauslDraft } from "./types";

const mockWorkspace = {
  chatId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  agentId: 11,
  scopeKey: "b".repeat(64),
  contextDigest: "c".repeat(64),
};
let mockPrepare: (() => Promise<unknown>) | undefined;
let mockHostAuth = false;
let mockConsume: ((id: string) => void) | undefined;
jest.mock("./bridge", () => ({
  ...jest.requireActual("./bridge"),
  openCauslWorkspace: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () =>
    new URLSearchParams(
      `chatId=${mockWorkspace.chatId}&agentId=11${mockHostAuth ? "&hostAuth=1" : ""}`
    ),
}));
const mockRouter = { replace: jest.fn() };
function mockWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
jest.mock("@/lib/projects/providers", () => ({
  ProjectsProvider: mockWrapper,
}));
jest.mock("@/lib/searchFilters/providers", () => ({
  SearchFiltersProvider: mockWrapper,
}));
jest.mock("@/providers/VoiceModeProvider", () => ({
  VoiceModeProvider: mockWrapper,
}));
jest.mock("@opal/layouts", () => ({ RootLayout: { Root: mockWrapper } }));
jest.mock("@/layouts/chromes/AppChrome", () => ({
  __esModule: true,
  default: mockWrapper,
}));
jest.mock("@/views/AppPage", () => ({
  __esModule: true,
  default: ({
    causlWorkspace,
  }: {
    causlWorkspace: {
      prepareSubmission: () => Promise<unknown>;
      draft?: CauslDraft;
      onDraftConsumed: (id: string) => void;
    };
  }) => {
    const { useWorkspaceAiUx } = jest.requireActual(
      "@/lib/causl/WorkspaceAiUx"
    );
    const workspaceAi = useWorkspaceAiUx();
    mockConsume = causlWorkspace.onDraftConsumed;
    mockPrepare = causlWorkspace.prepareSubmission;
    return (
      <>
        <div data-testid="pending-draft">
          {causlWorkspace.draft?.text ?? "No pending question"}
        </div>
        <span>
          {workspaceAi ? "Workspace AI controls" : "Standard controls"}
        </span>
      </>
    );
  },
}));

const context = {
  kind: "causl:context",
  nonce: "frame-nonce",
  revision: 1,
  actor: { orgId: "org_b", userId: "auth0|alice" },
  selection: { page: "models", marketId: "market_b" },
};
const question = {
  ...context,
  kind: "causl:draft",
  id: "ed27d121-b407-4920-b43a-c3281ed9d62e",
  text: "Explain the model",
};
let parentFrame: HTMLIFrameElement;
let parentDescriptor: PropertyDescriptor | undefined;
let post: jest.SpyInstance;

beforeEach(() => {
  mockHostAuth = false;
  jest.mocked(openCauslWorkspace).mockResolvedValue(mockWorkspace);
  mockConsume = undefined;
  parentFrame = document.createElement("iframe");
  document.body.appendChild(parentFrame);
  parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: parentFrame.contentWindow,
  });
  post = jest.spyOn(window.parent, "postMessage");
});
afterEach(() => {
  post.mockRestore();
  if (parentDescriptor)
    Object.defineProperty(window, "parent", parentDescriptor);
  parentFrame.remove();
  jest.clearAllMocks();
});
function receive(data: unknown) {
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://kb.example",
        source: window.parent,
        data,
      })
    )
  );
}
async function open() {
  render(
    <WorkspaceChat
      parentOrigin="https://kb.example"
      nonce="frame-nonce"
      authenticated
      libraryServerId={null}
    />
  );
  receive(context);
  await screen.findByText("No pending question");
  receive(question);
  await screen.findByText("Explain the model");
}

test("acknowledges the exact handoff only after the native input consumes it", async () => {
  await open();
  expect(post.mock.calls.map(([data]) => data.kind)).not.toContain(
    "causl:draft-consumed"
  );
  receive(context);
  expect(screen.getByTestId("pending-draft")).toHaveTextContent(
    "Explain the model"
  );
  act(() => mockConsume?.("foreign-id"));
  expect(screen.getByTestId("pending-draft")).toHaveTextContent(
    "Explain the model"
  );
  act(() => mockConsume?.(question.id));
  await waitFor(() =>
    expect(screen.getByTestId("pending-draft")).toHaveTextContent(
      "No pending question"
    )
  );
  expect(post).toHaveBeenCalledWith(
    { ...context, kind: "causl:draft-consumed", id: question.id },
    "https://kb.example"
  );
  receive(question);
  expect(screen.getByTestId("pending-draft")).toHaveTextContent(
    "No pending question"
  );
});

test("invalidates a pending handoff before delayed input restoration on a new page", async () => {
  await open();
  const lateConsumption = mockConsume;
  receive({
    ...context,
    revision: 2,
    selection: { page: "library", marketId: "market_b" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("pending-draft")).toHaveTextContent(
      "No pending question"
    )
  );
  act(() => lateConsumption?.(question.id));
  expect(post.mock.calls.map(([data]) => data.kind)).not.toContain(
    "causl:draft-consumed"
  );
  receive(question);
  expect(screen.getByTestId("pending-draft")).toHaveTextContent(
    "No pending question"
  );
});

test("Colossus requests fresh page context before native submission and freezes the prepared turn", async () => {
  const nativeFetch = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      actor: context.actor,
      issuer: "https://auth.example/",
    }),
  } as Response);
  try {
    render(
      <WorkspaceChat
        parentOrigin="https://kb.example"
        nonce="frame-nonce"
        authenticated
        libraryServerId={null}
        pageKind="colossus"
      />
    );
    await waitFor(() =>
      expect(post.mock.calls.some(([data]) => data.protocol === 2)).toBe(true)
    );
    const snapshot = {
      version: 1,
      revision: 1,
      map_view: {},
      selected_place: { id: "USA" },
      layers: {},
      filters: {},
      dates: {},
      visible_results: {},
      evidence_links: {},
      omissions: [],
      privacy: "Browser-local overlays excluded",
    };
    receive({ ...context, selection: { page: "colossus", snapshot } });
    await screen.findByText("No pending question");
    let prepared: Promise<unknown>;
    act(() => {
      prepared = mockPrepare!();
    });
    const request = post.mock.calls
      .map(([data]) => data)
      .find((data) => data.kind === "causl:request-context");
    expect(request.requestId).toBeTruthy();
    receive({
      ...context,
      requestId: request.requestId,
      revision: 2,
      selection: {
        page: "colossus",
        snapshot: { ...snapshot, revision: 2, selected_place: { id: "CHN" } },
      },
    });
    await expect(prepared!).resolves.toMatchObject({
      page: "colossus",
      snapshot: { revision: 2, selected_place: { id: "CHN" } },
    });
  } finally {
    nativeFetch.mockRestore();
  }
});

test("Colossus identity failure reports access without opening a conversation", async () => {
  const nativeFetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValue({ ok: false, status: 403 } as Response);
  try {
    render(
      <WorkspaceChat
        parentOrigin="https://kb.example"
        nonce="frame-nonce"
        authenticated
        libraryServerId={null}
        pageKind="colossus"
      />
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        { kind: "causl:status", nonce: "frame-nonce", reason: "access" },
        "https://kb.example"
      )
    );
    expect(openCauslWorkspace).not.toHaveBeenCalled();
  } finally {
    nativeFetch.mockRestore();
  }
});

test("Colossus identity loss cancels delayed workspace authorization", async () => {
  let finishOpen!: (value: typeof mockWorkspace) => void;
  jest.mocked(openCauslWorkspace).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishOpen = resolve;
      })
  );
  const nativeFetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        actor: context.actor,
        issuer: "https://auth.example/",
      }),
    } as Response)
    .mockResolvedValue({ ok: false, status: 403 } as Response);
  try {
    render(
      <WorkspaceChat
        parentOrigin="https://kb.example"
        nonce="frame-nonce"
        authenticated
        libraryServerId={null}
        pageKind="colossus"
      />
    );
    await waitFor(() =>
      expect(post.mock.calls.some(([data]) => data.protocol === 2)).toBe(true)
    );
    receive({
      ...context,
      selection: {
        page: "colossus",
        snapshot: {
          version: 1,
          revision: 1,
          map_view: {},
          selected_place: {},
          layers: {},
          filters: {},
          dates: {},
          visible_results: {},
          evidence_links: {},
          omissions: [],
          privacy: "Browser-local overlays excluded",
        },
      },
    });
    await waitFor(() => expect(openCauslWorkspace).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() =>
      expect(
        post.mock.calls.some(
          ([data]) => data.kind === "causl:status" && data.reason === "access"
        )
      ).toBe(true)
    );
    await act(async () => {
      finishOpen(mockWorkspace);
    });
    expect(screen.queryByTestId("pending-draft")).not.toBeInTheDocument();
    expect(post.mock.calls.map(([data]) => data.kind)).not.toContain(
      "causl:authorized"
    );
  } finally {
    nativeFetch.mockRestore();
  }
});

test("transient and unchanged identity checks preserve pending Colossus turns and still announce principal changes", async () => {
  const identity = { actor: context.actor, issuer: "https://auth.example/" };
  const nativeFetch = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => identity,
  } as Response);
  try {
    render(
      <WorkspaceChat
        parentOrigin="https://kb.example"
        nonce="frame-nonce"
        authenticated
        libraryServerId={null}
        pageKind="colossus"
      />
    );
    await waitFor(() => expect(nativeFetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        post.mock.calls.filter(([data]) => data.kind === "causl:ready")
      ).toHaveLength(1)
    );
    const snapshot = {
      version: 1,
      revision: 1,
      map_view: {},
      selected_place: {},
      layers: {},
      filters: {},
      dates: {},
      visible_results: {},
      evidence_links: {},
      omissions: [],
      privacy: "Browser-local overlays excluded",
    };
    receive({ ...context, selection: { page: "colossus", snapshot } });
    await screen.findByText("No pending question");
    let finishOpen!: (value: typeof mockWorkspace) => void;
    jest.mocked(openCauslWorkspace).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOpen = resolve;
        })
    );
    let prepared!: Promise<unknown>;
    act(() => {
      prepared = mockPrepare!();
    });
    const request = post.mock.calls
      .map(([data]) => data)
      .find((data) => data.kind === "causl:request-context");
    receive({
      ...context,
      revision: 2,
      requestId: request.requestId,
      selection: { page: "colossus", snapshot: { ...snapshot, revision: 2 } },
    });
    for (const failure of [503, "network"] as const) {
      if (failure === "network")
        nativeFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      else
        nativeFetch.mockResolvedValueOnce({
          ok: false,
          status: failure,
        } as Response);
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(screen.getByTestId("pending-draft")).toBeInTheDocument();
      expect(
        post.mock.calls.some(([data]) => data.kind === "causl:status")
      ).toBe(false);
    }
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(nativeFetch).toHaveBeenCalledTimes(4);
    expect(
      post.mock.calls.filter(([data]) => data.kind === "causl:ready")
    ).toHaveLength(1);
    await act(async () => {
      finishOpen(mockWorkspace);
    });
    await expect(prepared).resolves.toMatchObject({
      page: "colossus",
      snapshot: { revision: 2 },
    });
    nativeFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...identity,
        actor: { ...context.actor, orgId: "org_changed" },
      }),
    } as Response);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(
      post.mock.calls.filter(([data]) => data.kind === "causl:ready")
    ).toHaveLength(2);
    expect(post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "causl:ready",
        actor: { ...context.actor, orgId: "org_changed" },
      }),
      "https://kb.example"
    );
  } finally {
    nativeFetch.mockRestore();
  }
});

test.each(["signin", "access"] as const)(
  "host authentication never offers a second login after a %s failure",
  async (reason) => {
    mockHostAuth = true;
    jest
      .mocked(openCauslWorkspace)
      .mockRejectedValue(new CauslWorkspaceError(reason));
    render(
      <WorkspaceChat
        parentOrigin="https://kb.example"
        nonce="frame-nonce"
        authenticated
        libraryServerId={22}
      />
    );
    receive(context);
    await screen.findByText(
      "The workspace context is unavailable. Your saved conversation is retained."
    );
    expect(screen.queryByText("Sign in to Onyx")).not.toBeInTheDocument();
    expect(screen.queryByText("Connect Library")).not.toBeInTheDocument();
    expect(screen.getByText("Reopen conversation")).toBeInTheDocument();
  }
);

test.each(["models:proposal", "models:view"])(
  "standalone native Onyx forwards %s to the authenticated Models host",
  async (kind) => {
    jest
      .mocked(openCauslWorkspace)
      .mockResolvedValue({ ...mockWorkspace, actor: context.actor });
    render(
      <WorkspaceChat
        parentOrigin="https://kb.example"
        nonce="frame-nonce"
        authenticated
        libraryServerId={null}
      />
    );
    receive({ kind: "models:open", nonce: "frame-nonce" });
    await screen.findByText("No pending question");
    post.mockClear();
    const data = {
      kind,
      version: 1,
      captureId: "capture",
      workspaceScope: "local:one",
      baseRevision: "revision-1",
      arguments: { metricId: "profit" },
    };
    act(() =>
      window.dispatchEvent(
        new CustomEvent("models:tool-result", { detail: data })
      )
    );
    expect(post).toHaveBeenCalledWith(
      { ...data, nonce: "frame-nonce" },
      "https://kb.example"
    );
  }
);

test("standalone Models enables the shared composer, citation, and progress presentation", async () => {
  jest.mocked(openCauslWorkspace).mockResolvedValue({
    ...mockWorkspace,
    actor: context.actor,
  });
  render(
    <WorkspaceChat
      parentOrigin="https://kb.example"
      nonce="frame-nonce"
      authenticated
      libraryServerId={null}
    />
  );
  receive({ kind: "models:open", nonce: "frame-nonce" });
  expect(await screen.findByText("Workspace AI controls")).toBeVisible();
});

test("ordinary KB keeps the existing chat presentation", async () => {
  await open();
  expect(screen.getByText("Standard controls")).toBeVisible();
});
