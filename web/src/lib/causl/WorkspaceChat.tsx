"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Text } from "@opal/components";
import {
  createCauslBridge,
  openCauslWorkspace,
  type CauslWorkspaceError,
} from "./bridge";
import type { CauslContextMessage, CauslDraft, CauslWorkspace } from "./types";
import {
  getMCPUserOAuthNavigationUrl,
  startMCPUserOAuth,
} from "@/lib/tools/svc";
import { ProjectsProvider } from "@/lib/projects/providers";
import { SearchFiltersProvider } from "@/lib/searchFilters/providers";
import { VoiceModeProvider } from "@/providers/VoiceModeProvider";
import { RootLayout } from "@opal/layouts";
import AppChrome from "@/layouts/chromes/AppChrome";
import AppPage from "@/views/AppPage";
import { installCauslNavigation } from "@/lib/causl/navigation";

interface WorkspaceChatProps {
  parentOrigin: string | null;
  nonce: string | null;
  authenticated: boolean;
  libraryServerId: number | null;
}

export default function WorkspaceChat({
  parentOrigin,
  nonce,
  authenticated,
  libraryServerId,
}: WorkspaceChatProps) {
  const t = useTranslations("causlWorkspace");
  const router = useRouter();
  const params = useSearchParams();
  const bridge = useRef<ReturnType<typeof createCauslBridge> | null>(null);
  const [workspace, setWorkspace] = useState<CauslWorkspace | null>(null);
  const [draft, setDraft] = useState<
    (CauslDraft & { context: CauslContextMessage }) | null
  >(null);
  const [error, setError] = useState<CauslWorkspaceError["reason"] | null>(
    null
  );
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    if (!parentOrigin || !nonce || window.parent === window) return;
    const controller = createCauslBridge({
      nonce,
      open: openCauslWorkspace,
      onReady: (ready) => {
        setError(null);
        setWorkspace(ready);
        const context = controller.navigationContext();
        if (context)
          window.parent.postMessage(
            { ...context, kind: "causl:authorized" },
            parentOrigin
          );
        const query = new URLSearchParams(window.location.search);
        if (
          query.get("chatId") !== ready.chatId ||
          query.get("agentId") !== String(ready.agentId)
        ) {
          query.set("chatId", ready.chatId);
          query.set("agentId", String(ready.agentId));
          router.replace(`?${query}`, { scroll: false });
        }
      },
      onError: (reason) => {
        setError(reason);
        setWorkspace(null);
        setDraft(null);
      },
    });
    bridge.current = controller;
    const receive = (event: MessageEvent) => {
      if (
        authenticated &&
        event.source === window.parent &&
        event.origin === parentOrigin
      ) {
        const draft = controller.receiveDraft(event.data);
        const context = controller.navigationContext();
        if (draft && context) setDraft({ ...draft, context });
        else if (event.data?.kind === "causl:context") {
          if (controller.receive(event.data)) setDraft(null);
        }
      }
    };
    window.addEventListener("message", receive);
    const removeNavigation = installCauslNavigation({
      document,
      parentOrigin,
      current: controller.navigationContext,
      send: (message) => window.parent.postMessage(message, parentOrigin),
    });
    window.parent.postMessage({ kind: "causl:ready", nonce }, parentOrigin);
    return () => {
      controller.dispose();
      bridge.current = null;
      window.removeEventListener("message", receive);
      removeNavigation();
    };
  }, [authenticated, parentOrigin, nonce, router]);

  async function connectLibrary() {
    if (!libraryServerId || connecting) return;
    // Open before awaiting OAuth so the user gesture authorizes the popup.
    const popup = window.open("about:blank", "causl-library-connect");
    if (!popup) {
      setError("access");
      return;
    }
    setConnecting(true);
    try {
      const started = await startMCPUserOAuth(
        libraryServerId,
        "/app?oauth_connected=1",
        { forceReauthentication: true }
      );
      popup.location.href = getMCPUserOAuthNavigationUrl(started);
    } catch {
      popup.close();
      setError("access");
    } finally {
      setConnecting(false);
    }
  }

  const active =
    workspace &&
    !error &&
    params.get("chatId") === workspace.chatId &&
    params.get("agentId") === String(workspace.agentId);
  if (!parentOrigin || !nonce) return <Text as="p">{t("notConfigured")}</Text>;
  if (!authenticated || error === "signin")
    return (
      <div className="flex h-full flex-col items-start justify-center gap-3 p-4">
        <Text as="p">{t("signin")}</Text>
        <Button
          href="/auth/login?next=%2Fapp"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("signInAction")}
        </Button>
        <Button prominence="secondary" onClick={() => window.location.reload()}>
          {t("reopen")}
        </Button>
      </div>
    );
  if (error)
    return (
      <div
        className="flex h-full flex-col items-start justify-center gap-3 p-4"
        role="status"
      >
        <Text as="p">{t(error === "access" ? "access" : "unavailable")}</Text>
        {error === "access" && libraryServerId && (
          <Button onClick={connectLibrary}>
            {t(connecting ? "connecting" : "connectLibrary")}
          </Button>
        )}
        <Button prominence="secondary" onClick={() => window.location.reload()}>
          {t("reopen")}
        </Button>
      </div>
    );
  if (!active)
    return (
      <div className="p-4" role="status">
        <Text as="p">{t("opening")}</Text>
      </div>
    );
  return (
    <ProjectsProvider>
      <VoiceModeProvider>
        <RootLayout.Root>
          <AppChrome embedded>
            <SearchFiltersProvider>
              <AppPage
                causlWorkspace={{
                  draft: draft ?? undefined,
                  onDraftConsumed: (id) => {
                    const context = bridge.current?.navigationContext();
                    if (
                      draft?.id !== id ||
                      !context ||
                      JSON.stringify(context) !== JSON.stringify(draft.context)
                    )
                      return;
                    window.parent.postMessage(
                      { ...context, kind: "causl:draft-consumed", id },
                      parentOrigin!
                    );
                    setDraft(null);
                  },
                  prepareSubmission: async () => {
                    if (!bridge.current)
                      throw new Error("Workspace unavailable");
                    return bridge.current.prepareSubmission();
                  },
                }}
              />
            </SearchFiltersProvider>
          </AppChrome>
        </RootLayout.Root>
      </VoiceModeProvider>
    </ProjectsProvider>
  );
}
