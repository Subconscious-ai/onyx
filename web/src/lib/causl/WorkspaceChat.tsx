"use client";

import { captureModelPage } from "@/lib/causl/modelPage";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Text } from "@opal/components";
import {
  createCauslBridge,
  openCauslWorkspace,
  CauslWorkspaceError,
} from "@/lib/causl/bridge";
import type {
  CauslContextMessage,
  CauslDraft,
  CauslWorkspace,
} from "@/lib/causl/types";

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

import { parseCauslIdentity } from "@/lib/causl/colossus";

interface WorkspaceChatProps {
  pageKind?: "kb" | "colossus";
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
  pageKind = "kb",
}: WorkspaceChatProps) {
  const t = useTranslations("causlWorkspace");
  const router = useRouter();
  const params = useSearchParams();
  const standalone = useRef(false);
  const revision = useRef(0);
  const hosted = params.get("hostAuth") === "1";
  const bridge = useRef<ReturnType<typeof createCauslBridge> | null>(null);
  const [workspace, setWorkspace] = useState<CauslWorkspace | null>(null);
  const [draft, setDraft] = useState<
    (CauslDraft & { context: CauslContextMessage }) | null
  >(null);
  const [error, setError] = useState<CauslWorkspaceError["reason"] | null>(
    null
  );
  const [connecting, setConnecting] = useState(false);
  const refresh = useRef<{
    id: string;
    resolve(): void;
    reject(error: Error): void;
  } | null>(null);
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
        window.parent.postMessage(
          { kind: "causl:unavailable", nonce },
          parentOrigin
        );
      },
    });
    bridge.current = controller;
    const bootstrap = new AbortController();
    const receive = (event: MessageEvent) => {
      if (
        authenticated &&
        event.source === window.parent &&
        event.origin === parentOrigin
      ) {
        if (
          event.data?.kind === "models:open" &&
          event.data.nonce === nonce &&
          !standalone.current
        ) {
          standalone.current = true;
          void openCauslWorkspace(
            { selection: { page: "models" } },
            bootstrap.signal
          )
            .then((ready) => {
              if (bootstrap.signal.aborted) return;
              if (!ready.actor) throw new CauslWorkspaceError("unavailable");
              controller.receive({
                kind: "causl:context",
                nonce,
                revision: ++revision.current,
                actor: ready.actor,
                selection: { page: "models" },
              });
            })
            .catch((error: unknown) => {
              if (!bootstrap.signal.aborted) {
                standalone.current = false;
                setError(
                  error instanceof CauslWorkspaceError
                    ? error.reason
                    : "unavailable"
                );
                window.parent.postMessage(
                  { kind: "causl:unavailable", nonce },
                  parentOrigin
                );
              }
            });
          return;
        }
        if (
          event.data?.kind === "causl:focus" &&
          event.data.nonce === nonce &&
          controller.navigationContext()
        ) {
          document
            .querySelector<HTMLElement>('[contenteditable="true"]')
            ?.focus();
          return;
        }
        const draft = controller.receiveDraft(event.data);
        const context = controller.navigationContext();
        if (draft && context) setDraft({ ...draft, context });
        else if (event.data?.kind === "causl:context") {
          if (controller.receive(event.data)) {
            setDraft(null);
            if (
              refresh.current &&
              event.data.requestId === refresh.current.id
            ) {
              refresh.current.resolve();
              refresh.current = null;
            }
          }
        }
      }
    };
    const proposal = (event: Event) => {
      if (!standalone.current || !controller.navigationContext()) return;
      const data = (event as CustomEvent).detail;
      if (data?.kind === "models:proposal" || data?.kind === "models:view")
        window.parent.postMessage({ ...data, nonce }, parentOrigin);
    };
    window.addEventListener("models:tool-result", proposal);
    window.addEventListener("message", receive);
    const removeNavigation = installCauslNavigation({
      document,
      parentOrigin,
      current: controller.navigationContext,
      send: (message) => window.parent.postMessage(message, parentOrigin),
    });
    const identityController = new AbortController();
    let identityFailed = false;
    let announcedIdentity: string | null = null;
    async function announce() {
      if (identityFailed) return;
      if (pageKind !== "colossus") {
        window.parent.postMessage(
          { kind: "causl:ready", nonce },
          parentOrigin!
        );
        return;
      }
      try {
        if (!authenticated) throw new Error("signin");
        const response = await fetch("/api/chat/causl-identity", {
          cache: "no-store",
          signal: identityController.signal,
        });
        if (!response.ok) {
          if (response.status === 401) throw new Error("signin");
          if (response.status === 403) throw new Error("access");
          return; // Retry temporary identity-service failures on the next poll.
        }
        const identity = parseCauslIdentity(await response.json());
        if (!identity) throw new Error("access");
        const principal = JSON.stringify([
          identity.issuer,
          identity.actor.orgId,
          identity.actor.userId,
        ]);
        // Focus and periodic checks must not replace a pending turn's context.
        if (principal === announcedIdentity) return;
        announcedIdentity = principal;
        window.parent.postMessage(
          {
            kind: "causl:ready",
            nonce,
            protocol: 2,
            actor: identity.actor,
            issuer: identity.issuer,
          },
          parentOrigin!
        );
      } catch (error) {
        if (identityController.signal.aborted) return;
        if (
          !(error instanceof Error) ||
          !["signin", "access"].includes(error.message)
        )
          return;
        const reason =
          error instanceof Error && error.message === "signin"
            ? "signin"
            : "access";
        identityFailed = true;
        controller.dispose();
        refresh.current?.reject(new Error("Identity unavailable"));
        refresh.current = null;
        setDraft(null);
        setError(reason);
        setWorkspace(null);
        window.parent.postMessage(
          { kind: "causl:status", nonce, reason },
          parentOrigin!
        );
      }
    }
    void announce();
    const identityTimer = setInterval(() => {
      if (pageKind === "colossus") void announce();
    }, 30_000);
    if (pageKind === "colossus") window.addEventListener("focus", announce);
    return () => {
      bootstrap.abort();
      controller.dispose();
      identityController.abort();
      clearInterval(identityTimer);
      window.removeEventListener("focus", announce);
      refresh.current?.reject(new Error("Workspace changed"));
      refresh.current = null;
      bridge.current = null;
      standalone.current = false;
      window.removeEventListener("models:tool-result", proposal);
      window.removeEventListener("message", receive);
      removeNavigation();
    };
  }, [authenticated, parentOrigin, nonce, router, pageKind]);

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
  if (!hosted && (!authenticated || error === "signin"))
    return (
      <div className="flex h-full flex-col items-start justify-center gap-3 p-4">
        <Text as="p">{t("signin")}</Text>
        <Button
          href="/auth/login?provider=auth0&next=%2Fapp"
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
  if (error || !authenticated)
    return (
      <div
        className="flex h-full flex-col items-start justify-center gap-3 p-4"
        role="status"
      >
        <Text as="p">
          {t(!hosted && error === "access" ? "access" : "unavailable")}
        </Text>
        {!hosted && error === "access" && libraryServerId && (
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
                    if (pageKind === "colossus") {
                      refresh.current?.reject(
                        new Error("Preparation replaced")
                      );
                      const id = crypto.randomUUID();
                      let timer: ReturnType<typeof setTimeout>;
                      try {
                        await new Promise<void>((resolve, reject) => {
                          refresh.current = { id, resolve, reject };
                          timer = setTimeout(
                            () =>
                              reject(
                                new Error("Current page context unavailable")
                              ),
                            10_000
                          );
                          window.parent.postMessage(
                            {
                              kind: "causl:request-context",
                              nonce,
                              requestId: id,
                            },
                            parentOrigin!
                          );
                        });
                      } finally {
                        clearTimeout(timer!);
                        if (refresh.current?.id === id) refresh.current = null;
                      }
                    }
                    if (!bridge.current) throw new Error("Workspace changed");
                    const selection = await bridge.current.prepareSubmission();
                    if (pageKind === "colossus") {
                      const current = bridge.current?.navigationContext();
                      if (current)
                        window.parent.postMessage(
                          { ...current, kind: "causl:prepared", selection },
                          parentOrigin!
                        );
                    }
                    if (!standalone.current) return selection;
                    const context = bridge.current.navigationContext();
                    if (!context) throw new Error("Workspace changed");
                    // Verify the current native session and live Library membership before reading local content.
                    try {
                      await openCauslWorkspace(
                        context,
                        new AbortController().signal
                      );
                    } catch (error) {
                      window.parent.postMessage(
                        { kind: "causl:unavailable", nonce },
                        parentOrigin!
                      );
                      throw error;
                    }
                    const modelPage = await captureModelPage(
                      parentOrigin!,
                      nonce!
                    );
                    if (
                      !context ||
                      bridge.current?.navigationContext() !== context
                    )
                      throw new Error("Workspace changed");
                    return { ...selection, modelPage };
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
