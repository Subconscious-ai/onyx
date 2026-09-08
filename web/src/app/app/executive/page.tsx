"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Content } from "@opal/layouts";
import { useAgents } from "@/lib/agents/hooks";
import { isExecutiveAgent } from "@/lib/executive/brief";

export default function Page() {
  const { agents, isLoading, error } = useAgents();
  const router = useRouter();
  const agent = agents.find(isExecutiveAgent);
  useEffect(() => {
    if (agent) router.replace(`/app?agentId=${agent.id}`);
  }, [agent, router]);
  return (
    <div className="p-8">
      <Content
        sizePreset="section"
        title={
          isLoading || agent
            ? "Opening the executive interview…"
            : "Executive interview unavailable"
        }
        description={
          error
            ? "The agent list could not be loaded. Reload to retry."
            : !isLoading && !agent
              ? "The workspace administrator can enable the executive interview agent."
              : "Preparing the working session."
        }
      />
    </div>
  );
}
