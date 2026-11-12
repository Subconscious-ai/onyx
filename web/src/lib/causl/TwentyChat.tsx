"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@opal/components";
import { RootLayout } from "@opal/layouts";
import { SvgEditBig, SvgSearchMenu } from "@opal/icons";
import { ProjectsProvider } from "@/lib/projects/providers";
import { SearchFiltersProvider } from "@/lib/searchFilters/providers";
import { VoiceModeProvider } from "@/providers/VoiceModeProvider";
import AppChrome from "@/layouts/chromes/AppChrome";
import AppPage from "@/views/AppPage";
import ChatSearchCommandMenu from "@/sections/sidebar/ChatSearchCommandMenu";
import { useAppPosition } from "@/lib/position/hooks";
import { WorkspaceAiUx } from "@/lib/causl/WorkspaceAiUx";

export function requestTwentyContext(
  parentOrigin: string,
  nonce: string,
  signal: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(
      () => finish(new Error("Twenty context unavailable")),
      15000
    );
    function finish(result: string | Error) {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      signal.removeEventListener("abort", abort);
      if (result instanceof Error) reject(result);
      else resolve(result);
    }
    function abort() {
      finish(new Error("Twenty panel closed"));
    }
    function receive(event: MessageEvent) {
      const value = event.data;
      if (
        event.origin !== parentOrigin ||
        event.source !== window.parent ||
        value?.nonce !== nonce ||
        value?.id !== id
      )
        return;
      if (value.kind === "twenty:context-error")
        finish(new Error("Twenty context unavailable"));
      else if (
        value.kind === "twenty:context" &&
        typeof value.contextId === "string" &&
        /^[a-f0-9-]{36}$/i.test(value.contextId)
      )
        finish(value.contextId);
    }
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort);
    window.addEventListener("message", receive);
    window.parent.postMessage(
      { kind: "twenty:context-request", nonce, id },
      parentOrigin
    );
  });
}

interface TwentyChatProps {
  parentOrigin: string;
  nonce: string;
}

export default function TwentyChat({ parentOrigin, nonce }: TwentyChatProps) {
  const t = useTranslations("sidebar");
  const position = useAppPosition();
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      lifetime.current = null;
    };
  }, []);
  const prepareSubmission = useCallback(() => {
    if (!lifetime.current)
      return Promise.reject(new Error("Twenty panel closed"));
    return requestTwentyContext(parentOrigin, nonce, lifetime.current.signal);
  }, [parentOrigin, nonce]);
  return (
    <ProjectsProvider>
      <VoiceModeProvider>
        <WorkspaceAiUx enabled>
          <RootLayout.Root>
            <AppChrome embedded>
              <div className="flex shrink-0 justify-end gap-2 p-2">
                <Button
                  icon={SvgEditBig}
                  prominence="tertiary"
                  onClick={() => position.openNewSession()}
                  aria-label={t("appSidebar.newSession.label")}
                />
                <ChatSearchCommandMenu
                  trigger={(open) => (
                    <Button
                      icon={SvgSearchMenu}
                      prominence="tertiary"
                      onClick={open}
                      aria-label={t("appSidebar.searchChats.label")}
                    />
                  )}
                />
              </div>
              <SearchFiltersProvider>
                <AppPage twentyWorkspace={{ prepareSubmission }} />
              </SearchFiltersProvider>
            </AppChrome>
          </RootLayout.Root>
        </WorkspaceAiUx>
      </VoiceModeProvider>
    </ProjectsProvider>
  );
}
