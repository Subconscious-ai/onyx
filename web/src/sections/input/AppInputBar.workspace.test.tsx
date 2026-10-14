import React from "react";
import {
  act,
  render,
  screen,
  setupUser,
  waitFor,
} from "@tests/setup/test-utils";
import AppInputBar, { type AppInputBarProps } from "./AppInputBar";
import { useChatSessionStore } from "@/app/app/stores/useChatSessionStore";
import { draftKey } from "@/hooks/useDraft";

jest.mock("@/lib/position/hooks", () => ({
  useAppPosition: () => ({
    isNewSession: () => false,
    chat: () => "workspace-chat",
  }),
}));
jest.mock("@/providers/QueryControllerProvider", () => ({
  useQueryController: () => ({ state: { phase: "idle", appMode: "chat" } }),
}));
jest.mock("@/providers/VoiceModeProvider", () => ({
  useVoiceMode: () => ({ stopTTS: jest.fn() }),
}));
jest.mock("@/providers/IncognitoProvider", () => ({
  useIncognito: () => ({ incognitoEnabled: false }),
}));
jest.mock("@/hooks/useVoiceStatus", () => ({
  useVoiceStatus: () => ({ sttEnabled: false }),
}));
jest.mock("@/lib/projects/providers", () => ({
  useProjectsContext: () => ({
    currentMessageFiles: [],
    setCurrentMessageFiles: jest.fn(),
  }),
}));
jest.mock("@/lib/projects/hooks", () => ({
  useProjects: () => ({ isLoading: false }),
  useActiveProject: () => null,
}));
jest.mock("@/lib/settings/hooks", () => ({
  useSettings: () => ({ deep_research_enabled: false }),
}));
jest.mock("@/hooks/usePromptShortcuts", () => ({
  __esModule: true,
  default: () => ({ activePromptShortcuts: [] }),
}));
jest.mock("@/lib/connectors/hooks", () => ({
  useAvailableSources: () => ({ isLoading: false }),
}));
jest.mock("@/refresh-components/popovers/FilePickerPopover", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/lib/tools/components", () => ({ ToolsPopover: () => null }));

function props(onSubmit: AppInputBarProps["onSubmit"]): AppInputBarProps {
  return {
    onSubmit,
    embeddedWorkspace: true,
    initialMessage: "Independent draft D",
    stopGenerating: jest.fn(),
    chatState: "streaming",
    disabled: false,
    currentSessionFileTokenCount: 0,
    availableContextTokens: 1000,
    activeAgent: undefined,
    handleFileUpload: jest.fn(),
    deepResearchEnabled: false,
    toggleDeepResearch: jest.fn(),
    toolConfiguration: {
      stateOf: () => null,
      setToolState: jest.fn(),
      toggleToolState: jest.fn(),
      clearForcedTool: jest.fn(),
      forcedToolId: null,
      disabledToolIds: [],
      handOffTo: jest.fn(),
      handOffToNewChatWith: jest.fn(),
    },
    llmManager: {
      currentLlm: { name: "Test", provider: "test", modelName: "test" },
      updateCurrentLlm: jest.fn(),
      temperature: 0,
      updateTemperature: jest.fn(),
      temperatureExplicitlySet: false,
      reasoningEffort: null,
      updateReasoningEffort: jest.fn(),
      hasBoundSession: true,
      persistOverrides: async () => {},
      updateModelOverrideBasedOnChatSession: jest.fn(),
      imageFilesPresent: false,
      updateImageFilesPresent: jest.fn(),
      activeAgent: null,
      maxTemperature: 1,
      hasTemperatureOverride: false,
      llmProviders: [],
      isLoadingProviders: false,
      hasAnyProvider: true,
    },
  };
}

beforeEach(() => {
  sessionStorage.clear();
  useChatSessionStore.setState({ sessions: new Map(), currentSessionId: null });
  const store = useChatSessionStore.getState();
  store.setCurrentSession("workspace-chat");
  store.setLatestMessageRenderComplete("workspace-chat", false);
  store.enqueueCurrentMessage("Queued message Q");
});

test("appends successive model questions to a recovered native draft once without sending or queueing them", async () => {
  sessionStorage.setItem(
    draftKey("chat", "workspace-chat"),
    JSON.stringify("Recovered executive draft")
  );
  const submit = jest.fn();
  const consumed = jest.fn();
  const beforeQueue = [
    ...useChatSessionStore.getState().sessions.get("workspace-chat")!
      .queuedMessages,
  ];
  const initial = {
    ...props(submit),
    initialMessage: "",
    workspaceDraft: {
      id: "model-question",
      text: "Explain the volume assumption",
    },
    onWorkspaceDraftConsumed: consumed,
  };
  const rendered = render(<AppInputBar {...initial} />);
  const input = () =>
    rendered.container.querySelector('[contenteditable="true"]');
  await waitFor(() =>
    expect(input()).toHaveTextContent("Recovered executive draft")
  );
  await waitFor(() =>
    expect(input()).toHaveTextContent("Explain the volume assumption")
  );
  rendered.rerender(<AppInputBar {...initial} />);
  expect(
    input()!.textContent!.match(/Explain the volume assumption/g)
  ).toHaveLength(1);
  expect(consumed).toHaveBeenCalledWith("model-question");
  rendered.rerender(
    <AppInputBar
      {...initial}
      workspaceDraft={{ id: "second-question", text: "Compare scenarios" }}
    />
  );
  await waitFor(() => expect(input()).toHaveTextContent("Compare scenarios"));
  expect(input()).toHaveTextContent("Recovered executive draft");
  expect(
    input()!.textContent!.match(/Explain the volume assumption/g)
  ).toHaveLength(1);
  expect(consumed.mock.calls).toEqual([
    ["model-question"],
    ["second-question"],
  ]);
  expect(submit).not.toHaveBeenCalled();
  expect(
    useChatSessionStore.getState().sessions.get("workspace-chat")!
      .queuedMessages
  ).toEqual(beforeQueue);
});

test("persists the complete appended draft before acknowledging so immediate remount cannot lose it", async () => {
  const key = draftKey("chat", "workspace-chat");
  sessionStorage.setItem(key, JSON.stringify("Existing executive text"));
  const consumed = jest.fn(() => sessionStorage.getItem(key));
  const submit = jest.fn();
  const initial = {
    ...props(submit),
    initialMessage: "",
    workspaceDraft: { id: "model-question", text: "Repair the model" },
    onWorkspaceDraftConsumed: consumed,
  };
  const first = render(<AppInputBar {...initial} />);
  await waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
  expect(JSON.parse(consumed.mock.results[0]!.value)).toEqual({
    onyxDraftHandoffs: 1,
    value: "Existing executive text\n\nRepair the model",
    ids: ["model-question"],
  });
  first.unmount();
  const reopened = render(<AppInputBar {...props(submit)} initialMessage="" />);
  await waitFor(() =>
    expect(
      reopened.container.querySelector('[contenteditable="true"]')
    ).toHaveTextContent("Existing executive text")
  );
  expect(
    reopened.container.querySelector('[contenteditable="true"]')
  ).toHaveTextContent("Repair the model");
  expect(submit).not.toHaveBeenCalled();
});

test("reacknowledges a persisted handoff after a lost receipt without appending twice", async () => {
  const submit = jest.fn();
  const consumed = jest.fn();
  const initial = {
    ...props(submit),
    initialMessage: "",
    workspaceDraft: { id: "model-question", text: "Compare scenarios" },
    onWorkspaceDraftConsumed: consumed,
  };
  const first = render(<AppInputBar {...initial} />);
  await waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
  first.unmount();
  const second = render(<AppInputBar {...initial} />);
  await waitFor(() => expect(consumed).toHaveBeenCalledTimes(2));
  expect(
    second.container
      .querySelector('[contenteditable="true"]')!
      .textContent!.match(/Compare scenarios/g)
  ).toHaveLength(1);
  expect(submit).not.toHaveBeenCalled();
});

test("keeps the sender recovery copy when native draft storage refuses the handoff", async () => {
  const consumed = jest.fn();
  const storage = jest
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new DOMException("Storage blocked", "QuotaExceededError");
    });
  try {
    const rendered = render(
      <AppInputBar
        {...props(jest.fn())}
        workspaceDraft={{ id: "model-question", text: "Repair the model" }}
        onWorkspaceDraftConsumed={consumed}
      />
    );
    await waitFor(() =>
      expect(
        rendered.container.querySelector('[contenteditable="true"]')
      ).toHaveTextContent("Repair the model")
    );
    expect(consumed).not.toHaveBeenCalled();
    expect(
      rendered.container
        .querySelector('[contenteditable="true"]')!
        .textContent!.match(/Repair the model/g)
    ).toHaveLength(1);
    storage.mockRestore();
    await waitFor(() =>
      expect(
        JSON.parse(sessionStorage.getItem(draftKey("chat", "workspace-chat"))!)
      ).toMatchObject({ ids: ["model-question"] })
    );
    rendered.unmount();
    const reopened = render(
      <AppInputBar
        {...props(jest.fn())}
        initialMessage=""
        workspaceDraft={{ id: "model-question", text: "Repair the model" }}
        onWorkspaceDraftConsumed={consumed}
      />
    );
    await waitFor(() =>
      expect(consumed).toHaveBeenCalledWith("model-question")
    );
    expect(
      reopened.container
        .querySelector('[contenteditable="true"]')!
        .textContent!.match(/Repair the model/g)
    ).toHaveLength(1);
  } finally {
    storage.mockRestore();
  }
});

test("ignores host questions on the ordinary standalone native input", async () => {
  const consumed = jest.fn();
  const submit = jest.fn();
  const rendered = render(
    <AppInputBar
      {...props(submit)}
      embeddedWorkspace={false}
      workspaceDraft={{ id: "model-question", text: "Host question" }}
      onWorkspaceDraftConsumed={consumed}
    />
  );
  await waitFor(() =>
    expect(
      rendered.container.querySelector('[contenteditable="true"]')
    ).toHaveTextContent("Independent draft D")
  );
  expect(
    rendered.container.querySelector('[contenteditable="true"]')
  ).not.toHaveTextContent("Host question");
  expect(consumed).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

test.each([true, false])(
  "only ordinary native chat sends a queued follow-up when the reply completes (embedded: %s)",
  async (embeddedWorkspace) => {
    const submit = jest.fn();
    const initial = props(submit);
    const rendered = render(
      <AppInputBar {...initial} embeddedWorkspace={embeddedWorkspace} />
    );
    act(() => {
      useChatSessionStore
        .getState()
        .setLatestMessageRenderComplete("workspace-chat", true);
    });
    rendered.rerender(
      <AppInputBar
        {...initial}
        embeddedWorkspace={embeddedWorkspace}
        chatState="input"
      />
    );
    expect(submit).toHaveBeenCalledTimes(embeddedWorkspace ? 0 : 1);
    if (!embeddedWorkspace)
      expect(submit).toHaveBeenCalledWith("Queued message Q");
    expect(
      useChatSessionStore.getState().sessions.get("workspace-chat")!
        .queuedMessages
    ).toHaveLength(embeddedWorkspace ? 1 : 0);
    expect(
      rendered.container.querySelector('[contenteditable="true"]')
    ).toHaveTextContent("Independent draft D");
    await waitFor(() =>
      expect(
        JSON.parse(sessionStorage.getItem(draftKey("chat", "workspace-chat"))!)
      ).toBe("Independent draft D")
    );
  }
);

test("keeps an embedded follow-up as a draft on Enter and preserves it when stopping the reply", async () => {
  const submit = jest.fn();
  const initial = props(submit);
  const rendered = render(<AppInputBar {...initial} />);
  const input = rendered.container.querySelector<HTMLElement>(
    '[contenteditable="true"]'
  )!;
  await waitFor(() => expect(input).toHaveTextContent("Independent draft D"));
  const user = setupUser();
  await user.click(input);
  await user.keyboard("{Enter}");
  expect(input).toHaveTextContent("Independent draft D");
  expect(
    useChatSessionStore.getState().sessions.get("workspace-chat")!
      .queuedMessages
  ).toHaveLength(1);
  expect(submit).not.toHaveBeenCalled();

  await user.click(document.getElementById("onyx-chat-input-send-button")!);
  expect(initial.stopGenerating).toHaveBeenCalledTimes(1);
  expect(input).toHaveTextContent("Independent draft D");
  expect(
    useChatSessionStore.getState().sessions.get("workspace-chat")!
      .queuedMessages
  ).toHaveLength(1);
  expect(submit).not.toHaveBeenCalled();
});

test("keeps an unaccepted workspace draft in storage after send", async () => {
  const submit = jest.fn<
    ReturnType<AppInputBarProps["onSubmit"]>,
    Parameters<AppInputBarProps["onSubmit"]>
  >();
  const initial = props(submit);
  render(<AppInputBar {...initial} chatState="input" />);
  await waitFor(() =>
    expect(
      sessionStorage.getItem(draftKey("chat", "workspace-chat"))
    ).toContain("Independent draft D")
  );
  await setupUser().click(
    document.getElementById("onyx-chat-input-send-button")!
  );
  expect(submit).toHaveBeenCalledWith("Independent draft D");
  expect(
    JSON.parse(sessionStorage.getItem(draftKey("chat", "workspace-chat"))!)
  ).toBe("Independent draft D");
  expect(screen.getByText("Independent draft D")).toBeVisible();
});
