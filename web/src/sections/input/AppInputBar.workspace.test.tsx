import React, { createRef } from "react";
import {
  act,
  render,
  screen,
  setupUser,
  waitFor,
} from "@tests/setup/test-utils";
import AppInputBar, {
  type AppInputBarHandle,
  type AppInputBarProps,
} from "./AppInputBar";
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

test.each(["accepted", "refused"] as const)(
  "retains independent draft while queued preparation is %s",
  async (result) => {
    const ref = createRef<AppInputBarHandle>();
    const submit = jest.fn<
      ReturnType<AppInputBarProps["onSubmit"]>,
      Parameters<AppInputBarProps["onSubmit"]>
    >();
    const initial = props(submit);
    const rendered = render(<AppInputBar {...initial} ref={ref} />);
    act(() => {
      useChatSessionStore
        .getState()
        .setLatestMessageRenderComplete("workspace-chat", true);
    });
    rendered.rerender(<AppInputBar {...initial} chatState="input" ref={ref} />);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const [text, callbacks] = submit.mock.calls[0]!;
    expect(text).toBe("Queued message Q");
    expect(
      useChatSessionStore.getState().sessions.get("workspace-chat")!
        .queuedMessages
    ).toHaveLength(1);
    expect(
      rendered.container.querySelector('[contenteditable="true"]')
    ).toHaveTextContent("Independent draft D");
    act(() => {
      if (result === "accepted") {
        // The native controller resets the input before acknowledging acceptance.
        ref.current!.reset();
        callbacks!.onInputAccepted!();
      } else {
        callbacks!.onInputRejected!();
      }
    });
    expect(
      useChatSessionStore.getState().sessions.get("workspace-chat")!
        .queuedMessages
    ).toHaveLength(result === "accepted" ? 0 : 1);
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
