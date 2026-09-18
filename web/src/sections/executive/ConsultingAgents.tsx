"use client";

import { useTranslations } from "next-intl";
import { SidebarTab } from "@opal/components";
import { DagMark } from "@/sections/brand/dag-mark";
import { consultingRole } from "@/lib/agents/consulting";

interface ConsultingAgentsProps {
  agents: readonly { id: number; name: string }[];
  activeId?: number;
}

export default function ConsultingAgents({
  agents,
  activeId,
}: ConsultingAgentsProps) {
  const t = useTranslations("executive.workflows");
  const agent = agents.find(
    (candidate) => consultingRole(candidate) === "interview"
  );
  if (!agent) return null;
  return (
    <nav aria-label={t("label")}>
      <SidebarTab
        href={`/app?agentId=${agent.id}`}
        selected={agent.id === activeId}
        icon={() => <DagMark className="size-4" />}
      >
        {t("interview")}
      </SidebarTab>
    </nav>
  );
}
