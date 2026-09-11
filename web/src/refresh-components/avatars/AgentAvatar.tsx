"use client";

import { DagMark } from "@/sections/brand/dag-mark";
import { isExecutiveAgent } from "@/lib/executive/brief";
import { consultingRole } from "@/lib/agents/consulting";
import { MinimalAgent } from "@/lib/agents/types";
import { buildAgentAvatarUrl } from "@/lib/agents/utils";
import { useSettings } from "@/lib/settings/hooks";
import { DEFAULT_AVATAR_SIZE_PX, DEFAULT_AGENT_ID } from "@/lib/constants";
import CustomAgentAvatar from "@/refresh-components/avatars/CustomAgentAvatar";
import Image from "next/image";
import { useTranslations } from "next-intl";

export interface AgentAvatarProps {
  agent: MinimalAgent;
  size?: number;
}

export default function AgentAvatar({
  agent,
  size = DEFAULT_AVATAR_SIZE_PX,
  ...props
}: AgentAvatarProps) {
  const t = useTranslations("common.agentAvatar");
  const { enterprise: enterpriseSettings } = useSettings();

  if (isExecutiveAgent(agent) || consultingRole(agent))
    return <DagMark style={{ width: size, height: size }} />;

  if (agent.id === DEFAULT_AGENT_ID) {
    return enterpriseSettings?.use_custom_logo ? (
      <div
        className="aspect-square rounded-full overflow-hidden relative"
        style={{ height: size, width: size }}
      >
        <Image
          alt={t("logo.alt")}
          src="/api/enterprise-settings/logo"
          fill
          className="object-cover object-center"
          sizes={`${size}px`}
        />
      </div>
    ) : (
      <DagMark style={{ width: size, height: size }} />
    );
  }

  return (
    <CustomAgentAvatar
      name={agent.name}
      src={agent.uploaded_image_id ? buildAgentAvatarUrl(agent.id) : undefined}
      iconName={agent.icon_name}
      size={size}
      {...props}
    />
  );
}
