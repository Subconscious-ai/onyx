"use client";

import { createContext, useContext, type ReactNode } from "react";
import "@/lib/causl/workspace-ai.css";

const WorkspaceAiContext = createContext(false);

interface WorkspaceAiUxProps {
  enabled: boolean;
  children: ReactNode;
}

/** Presentation only. Native Onyx owns messages, tools, files, and history. */
export function WorkspaceAiUx({ enabled, children }: WorkspaceAiUxProps) {
  return (
    <WorkspaceAiContext.Provider value={enabled}>
      <div className={enabled ? "workspace-ai-chat" : "contents"}>
        {children}
      </div>
    </WorkspaceAiContext.Provider>
  );
}

export function useWorkspaceAiUx() {
  return useContext(WorkspaceAiContext);
}
