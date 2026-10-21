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
let mockConsume: ((id: string) => void) | undefined;
let mockHostAuth = false;
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
      draft?: CauslDraft;
      onDraftConsumed: (id: string) => void;
    };
  }) => {
    mockConsume = causlWorkspace.onDraftConsumed;
    return (
      <div data-testid="pending-draft">
        {causlWorkspace.draft?.text ?? "No pending question"}
      </div>
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
