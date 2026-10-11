export interface CauslActor {
  orgId: string;
  userId: string;
}

export interface CauslSelection {
  page: "workspace" | "library" | "models" | "reports";
  marketId?: string;
  record?: { type: string; id: string };
  runId?: string;
  studioId?: string;
}

export interface CauslContextMessage {
  kind: "causl:context";
  nonce: string;
  revision: number;
  actor: CauslActor;
  selection: CauslSelection;
}

export interface CauslWorkspace {
  chatId: string;
  agentId: number;
  scopeKey: string;
  contextDigest: string;
}

export interface CauslDraft {
  id: string;
  text: string;
}
