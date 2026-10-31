export interface CauslActor {
  orgId: string;
  userId: string;
}

export interface CauslIdentity {
  actor: CauslActor;
  issuer: string;
}

export interface CauslSelection {
  page: "workspace" | "library" | "models" | "reports" | "colossus";
  snapshot?: ColossusPageSnapshot;
  marketId?: string;
  record?: { type: string; id: string };
  runId?: string;
  studioId?: string;
}

/** Native context protocol v2. Snapshot v1 contains browser view hints, never tenant authority. */
export interface ColossusPageSnapshot {
  version: 1;
  revision: number;
  map_view: Record<string, unknown>;
  selected_place: Record<string, unknown>;
  layers: Record<string, unknown>;
  filters: Record<string, unknown>;
  dates: Record<string, unknown>;
  visible_results: Record<string, unknown>;
  evidence_links: Record<string, unknown>;
  omissions: Record<string, unknown>[];
  privacy: "Browser-local overlays excluded";
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
