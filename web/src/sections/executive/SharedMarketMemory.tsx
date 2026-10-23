"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Button, Text } from "@opal/components";
import { errorHandlingFetcher, skipRetryOnAuthError } from "@/lib/fetcher";

interface SharedMarketMemoryProps {
  chatId: string | null;
  revision: number | string;
  busy?: boolean;
}

interface MemoryView {
  digest: string;
  library: {
    nodes: {
      id: string;
      type: string;
      properties: {
        name?: string | null;
        label?: string | null;
        value?: string | number | boolean | null;
        definition?: string | null;
        text?: string | null;
        role?: string | null;
      };
      evidence: {
        sourceType?: string;
        sourceUrl?: string | null;
        reviewedStatement?: string | null;
      }[];
    }[];
    omitted: number;
    truncated: boolean;
  };
}

function publicSourceUrl(value?: string | null) {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export default function SharedMarketMemory(props: SharedMarketMemoryProps) {
  const t = useTranslations("executive");
  const { data, error, isLoading } = useSWR<MemoryView>(
    !props.busy
      ? [
          props.chatId
            ? `/api/chat/causl-memory?chat_id=${encodeURIComponent(props.chatId)}`
            : "/api/chat/causl-memory",
          props.revision,
        ]
      : null,
    ([url]: [string, number | string]) => errorHandlingFetcher(url),
    {
      keepPreviousData: false,
      onErrorRetry: skipRetryOnAuthError,
      errorRetryCount: 1,
    }
  );
  return (
    <details className="executive-context" data-testid="shared-market-memory">
      <summary>{t("savedMarketFacts")}</summary>
      {error ? (
        <Text as="p" font="secondary-body">
          {t("marketMemoryUnavailable")}
        </Text>
      ) : isLoading ? (
        <Text as="p" font="secondary-body">
          {t("marketMemoryLoading")}
        </Text>
      ) : data ? (
        <>
          <Text as="p" font="secondary-body">
            {t("marketMemorySource")}
          </Text>
          {data.library.nodes.some((node) =>
            ["pdl_claim", "research_claim"].includes(node.properties.role ?? "")
          ) && (
            <Text as="p" font="secondary-body">
              {t("providerClaimNotice")}
            </Text>
          )}
          {data.library.nodes.length === 0 && (
            <Text as="p" font="secondary-body">
              {t("marketMemoryEmpty")}
            </Text>
          )}
          {data.library.nodes.map((node) => (
            <div key={`${node.type}:${node.id}`}>
              <Text as="p" font="main-ui-action">
                {String(
                  node.properties.name ??
                    node.properties.label ??
                    node.properties.value ??
                    node.properties.text ??
                    node.id
                )}
              </Text>
              {typeof node.properties.definition === "string" && (
                <Text as="p" font="secondary-body">
                  {node.properties.definition}
                </Text>
              )}
              {node.evidence.map((source, index) => {
                const url = publicSourceUrl(source.sourceUrl);
                return (
                  <div key={index}>
                    {source.sourceType && (
                      <Text as="p" font="secondary-body">
                        {source.sourceType === "pdl_claim"
                          ? t("companyProfile.provider")
                          : source.sourceType === "research_claim"
                            ? t("publicResearchSource")
                            : source.sourceType === "executive_testimony"
                              ? t("executiveTestimonySource")
                              : source.sourceType}
                      </Text>
                    )}
                    {source.reviewedStatement && (
                      <Text as="p" font="secondary-body">
                        {t("marketMemoryEvidence", {
                          quote: source.reviewedStatement,
                        })}
                      </Text>
                    )}
                    {url && (
                      <Button href={url.href} prominence="tertiary" size="sm">
                        {url.hostname}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {data.library.truncated && (
            <Text as="p" font="secondary-body">
              {t("marketMemoryBounded")}
            </Text>
          )}
        </>
      ) : (
        <Text as="p" font="secondary-body">
          {t("marketMemoryEmpty")}
        </Text>
      )}
    </details>
  );
}
