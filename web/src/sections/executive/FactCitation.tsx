"use client";

import { useTranslations } from "next-intl";
import { Text } from "@opal/components";
import AIInlineCitation from "@/sections/customer/AIInlineCitation";
import { safeSourceUrl } from "@/lib/executive/brief";

interface FactCitationProps {
  quote?: string | null;
  url?: string | null;
}

/** Display only evidence admitted by the existing brief or Library boundary. */
export default function FactCitation({ quote, url }: FactCitationProps) {
  const t = useTranslations("executive");
  const sourceUrl = safeSourceUrl(url);
  if (!quote?.trim() && !sourceUrl) {
    return (
      <Text font="secondary-body" color="text-03">
        {t("factCitationUnavailable")}
      </Text>
    );
  }
  const title = sourceUrl
    ? new URL(sourceUrl).hostname.replace(/^www\./, "")
    : t("factCitationConversation");
  return (
    <AIInlineCitation
      source={{ title, sourceUrl: sourceUrl ?? undefined }}
      label={t("originalSource")}
      quote={quote}
      onOpen={
        sourceUrl
          ? () => window.open(sourceUrl, "_blank", "noopener,noreferrer")
          : undefined
      }
    />
  );
}
