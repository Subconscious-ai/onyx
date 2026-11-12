import type { ReactNode } from "react";

export type Scope = "all" | "action" | "chat" | "project";
export interface CommandItem {
  id: string;
  label: string;
  icon?: ReactNode;
  kind: Exclude<Scope, "all">;
  meta?: string;
}
export interface CommandRun {
  item: CommandItem;
}
