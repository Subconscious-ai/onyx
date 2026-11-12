"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { Text } from "@opal/components";
import { errorHandlingFetcher, skipRetryOnAuthError } from "@/lib/fetcher";
import FactCitation from "@/sections/executive/FactCitation";

interface SharedMarketMemoryProps {
  chatId: string | null;
  revision: number;
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
      };
      evidence: {
        id?: string;
        reviewedStatement?: string | null;
        sourceUrl?: string | null;
      }[];
    }[];
    omitted: number;
    truncated: boolean;
  };
}

export default function SharedMarketMemory(props: SharedMarketMemoryProps) {
  const t = useTranslations("executive");
  const { data, error, isLoading } = useSWR<MemoryView>(
    props.chatId && !props.busy
      ? [
          `/api/chat/causl-memory?chat_id=${encodeURIComponent(props.chatId)}`,
          props.revision,
        ]
      : null,
    ([url]: [string, number]) => errorHandlingFetcher(url),
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
          {data.library.nodes.length === 0 && (
            <Text as="p" font="secondary-body">
              {t("marketMemoryEmpty")}
            </Text>
          )}
          {data.library.nodes.map((node) => {
            const citations = node.evidence.length ? (
              node.evidence.map((source, index) => (
                <FactCitation
                  key={source.id ?? index}
                  quote={source.reviewedStatement}
                  url={source.sourceUrl}
                />
              ))
            ) : (
              <FactCitation />
            );
            const hasDefinition =
              typeof node.properties.definition === "string";
            return (
              <div key={`${node.type}:${node.id}`}>
                <p className="executive-fact-line">
                  <Text font="main-ui-action">
                    {String(
                      node.properties.name ??
                        node.properties.label ??
                        node.properties.value ??
                        node.id
                    )}
                  </Text>
                  {!hasDefinition && citations}
                </p>
                {hasDefinition && (
                  <p className="executive-fact-line">
                    <Text font="secondary-body">
                      {node.properties.definition!}
                    </Text>
                    {citations}
                  </p>
                )}
              </div>
            );
          })}
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
