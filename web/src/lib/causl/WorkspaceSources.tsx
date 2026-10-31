"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Text } from "@opal/components";
import AIInlineCitation from "@/sections/customer/AIInlineCitation";
import { SvgChevronDown, SvgSearch } from "@opal/icons";
import type { RichStr } from "@opal/types";
import type { SourceInfo } from "@/refresh-components/buttons/source-tag/SourceTagDetailsCard";

interface WorkspaceCitationProps {
  source: SourceInfo;
  label: string | RichStr;
  onOpen?: () => void;
}

/** Only public web protocols can become external preview links. */
export function sourceWebUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function WorkspaceCitation({
  source,
  label,
  onOpen,
}: WorkspaceCitationProps) {
  const t = useTranslations("workspaceAi");
  const url = sourceWebUrl(source.sourceUrl);
  return (
    <span className="workspace-ai-citation">
      <AIInlineCitation
        source={{ ...source, sourceUrl: url }}
        label={label}
        previewLabel={t("preview", { title: source.title })}
        openLabel={t("openSource")}
        onOpen={onOpen}
      />
    </span>
  );
}

interface WorkspaceSourcesProps {
  sources: SourceInfo[];
  onOpen: (id: string) => void;
}

/** Every displayed source comes from the native document stream or saved history. */
export function WorkspaceSources({ sources, onOpen }: WorkspaceSourcesProps) {
  const t = useTranslations("workspaceAi");
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const unique = Array.from(
    new Map(sources.map((source) => [source.id, source])).values()
  );
  if (!unique.length) return null;
  return (
    <div className="workspace-ai-sources">
      <Button
        prominence="tertiary"
        size="sm"
        icon={SvgSearch}
        rightIcon={SvgChevronDown}
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        onClick={() => setExpanded(!expanded)}
      >
        {t("sources", { count: unique.length })}
      </Button>
      <div className="workspace-ai-source-stack" aria-hidden="true">
        {unique.slice(0, 4).map((source) => (
          <span key={source.id}>
            <Text font="secondary-action">
              {source.title.slice(0, 1).toUpperCase()}
            </Text>
          </span>
        ))}
      </div>
      {expanded && (
        <div id={id} className="workspace-ai-source-list">
          {unique.map((source) => (
            <WorkspaceCitation
              key={source.id}
              source={source}
              label={source.title}
              onOpen={() => onOpen(source.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
