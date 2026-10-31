"use client";

import { useTranslations } from "next-intl";
import SourceTag from "@/refresh-components/buttons/source-tag/SourceTag";
import { documentToSourceInfo } from "@/refresh-components/buttons/source-tag/sourceTagUtils";
import type {
  OnyxDocument,
  MinimalOnyxDocument,
} from "@/lib/search/interfaces";
import { openDocument } from "@/lib/search/utils";

interface SourceProgressProps {
  documents: OnyxDocument[];
  onOpen?: (document: MinimalOnyxDocument) => void;
}

export default function SourceProgress({
  documents,
  onOpen,
}: SourceProgressProps) {
  const t = useTranslations("chat.messages.timeline");
  const unique = documents.filter(
    (document, index) =>
      documents.findIndex(
        (item) => item.document_id === document.document_id
      ) === index
  );
  if (!unique.length) return null;

  return (
    <div data-ai-source-progress="">
      <SourceTag
        displayName={t("sourceCount", { count: unique.length })}
        sources={unique.map(documentToSourceInfo)}
        onSourceClick={
          onOpen ? () => openDocument(unique[0]!, onOpen) : undefined
        }
      />
    </div>
  );
}
