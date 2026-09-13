"use client";

import { useTranslations } from "next-intl";
import { SidebarTab } from "@opal/components";
import { DagMark } from "@/sections/brand/dag-mark";
import { consultingRole, consultingRoles } from "@/lib/agents/consulting";

interface ConsultingAgentsProps {
  agents: readonly { id: number; name: string }[];
  activeId?: number;
}

export default function ConsultingAgents({
  agents,
  activeId,
}: ConsultingAgentsProps) {
  const t = useTranslations("executive.workflows");
  return (
    <nav aria-label={t("label")}>
      {consultingRoles.map((role) => {
        // Only native, permission-filtered catalog entries supply navigation targets.
        const agent = agents.find(
          (candidate) => consultingRole(candidate) === role
        );
        return agent ? (
          <SidebarTab
            key={agent.id}
            href={`/app?agentId=${agent.id}`}
            selected={agent.id === activeId}
            icon={() => <DagMark className="size-4" />}
          >
            {t(role)}
          </SidebarTab>
        ) : null;
      })}
    </nav>
  );
}
