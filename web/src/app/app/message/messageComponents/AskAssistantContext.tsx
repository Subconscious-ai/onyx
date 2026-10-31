"use client";

import { createContext, useContext } from "react";

export interface AskAssistant {
  /** Send a message to the assistant as if the user had typed it. */
  ask: (message: string) => void;
  /** True while the assistant is already answering. */
  busy: boolean;
}

/**
 * Lets a card inside a message offer the user a one-click follow-up. Absent in
 * read-only views such as a shared chat, where nothing can be sent.
 */
const AskAssistantContext = createContext<AskAssistant | null>(null);

export const AskAssistantProvider = AskAssistantContext.Provider;

export function useAskAssistant(): AskAssistant | null {
  return useContext(AskAssistantContext);
}
