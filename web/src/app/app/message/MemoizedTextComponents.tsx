import { useWorkspaceAiUx } from "@/lib/causl/WorkspaceAiUx";
import { WorkspaceCitation, sourceWebUrl } from "@/lib/causl/WorkspaceSources";
import React, { memo, JSX, useMemo, useCallback } from "react";
import { SourceIcon } from "@/components/SourceIcon";
import { WebResultIcon } from "@/components/WebResultIcon";
import {
  LoadedOnyxDocument,
  MinimalOnyxDocument,
  OnyxDocument,
} from "@/lib/search/interfaces";
import { SubQuestionDetail, CitationMap } from "../interfaces";
import { ValidSources } from "@/lib/types";
import { ProjectFile } from "@/lib/projects/types";
import { BlinkingBar } from "./BlinkingBar";
import Text from "@/refresh-components/texts/Text";
import SourceTag from "@/refresh-components/buttons/source-tag/SourceTag";
import {
  documentToSourceInfo,
  questionToSourceInfo,
  getDisplayNameForSource,
} from "@/refresh-components/buttons/source-tag/sourceTagUtils";
import { openDocument } from "@/lib/search/utils";
import { ensureHrefProtocol } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface DocumentCardProps {
  document: LoadedOnyxDocument;
  updatePresentingDocument: (document: MinimalOnyxDocument) => void;
  url?: string;
}
interface QuestionCardProps {
  question: SubQuestionDetail;
  openQuestion: (question: SubQuestionDetail) => void;
}

function linkText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      return React.isValidElement<{ children?: React.ReactNode }>(child)
        ? linkText(child.props.children)
        : "";
    })
    .join("");
}

export const MemoizedAnchor = memo(
  ({
    docs,
    subQuestions,
    openQuestion,
    userFiles,
    citations,
    href,
    updatePresentingDocument,
    children,
  }: {
    subQuestions?: SubQuestionDetail[];
    openQuestion?: (question: SubQuestionDetail) => void;
    docs?: OnyxDocument[] | null;
    userFiles?: ProjectFile[] | null;
    citations?: CitationMap;
    updatePresentingDocument: (doc: MinimalOnyxDocument) => void;
    href?: string;
    children: React.ReactNode;
  }): JSX.Element => {
    const value = children?.toString();
    if (value?.startsWith("[") && value?.endsWith("]")) {
      const match = value.match(/\[(D|Q)?(\d+)\]/);

      if (match) {
        const match_item = match[2];
        if (match_item !== undefined) {
          const isSubQuestion = match[1] === "Q";
          const isDocument = !isSubQuestion;

          const citation_num = parseInt(match_item, 10);

          // Use citation map to find the correct document
          // Citations map format: {citation_num: document_id}
          // e.g., {1: "doc_abc", 2: "doc_xyz", 3: "doc_123"}
          let associatedDoc: OnyxDocument | null = null;
          if (isDocument && docs && citations) {
            const document_id = citations[citation_num];
            if (document_id) {
              associatedDoc =
                docs.find((d) => d.document_id === document_id) || null;
            }
          }

          const associatedSubQuestion = isSubQuestion
            ? subQuestions?.[citation_num - 1]
            : undefined;

          if (!associatedDoc && !associatedSubQuestion) {
            // Citation not resolved yet (data still streaming) — hide the
            // raw [[N]](url) link entirely. It will render as a chip once
            // the citation/document data arrives.
            return <></>;
          }

          let icon: React.ReactNode = null;
          if (associatedDoc?.source_type === "web") {
            icon = <WebResultIcon url={associatedDoc.link} />;
          } else {
            icon = (
              <SourceIcon
                sourceType={associatedDoc?.source_type as ValidSources}
                iconSize={18}
              />
            );
          }
          const associatedDocInfo = associatedDoc
            ? {
                ...associatedDoc,
                icon: icon as any,
                link: associatedDoc.link,
              }
            : undefined;

          return (
            <MemoizedLink
              updatePresentingDocument={updatePresentingDocument}
              href={href}
              document={associatedDocInfo}
              question={associatedSubQuestion}
              openQuestion={openQuestion}
            >
              {children}
            </MemoizedLink>
          );
        }
      }
    }
    return (
      <MemoizedLink
        updatePresentingDocument={updatePresentingDocument}
        href={href}
      >
        {children}
      </MemoizedLink>
    );
  }
);

export const MemoizedLink = memo(
  ({
    node,
    document,
    updatePresentingDocument,
    question,
    href,
    openQuestion,
    ...rest
  }: Partial<DocumentCardProps & QuestionCardProps> & {
    node?: any;
    [key: string]: any;
  }) => {
    const t = useTranslations("chat.messages");
    const workspaceAi = useWorkspaceAiUx();
    const value = rest.children;
    const valueText = linkText(value);

    // Convert document to SourceInfo for SourceTag
    const documentSourceInfo = useMemo(() => {
      if (!document) return null;
      return documentToSourceInfo(document as OnyxDocument);
    }, [document]);

    // Convert question to SourceInfo for SourceTag
    const questionSourceInfo = useMemo(() => {
      if (!question) return null;
      return questionToSourceInfo(question, question.level_question_num);
    }, [question]);

    // Handle click on SourceTag
    const handleSourceClick = useCallback(() => {
      if (document && updatePresentingDocument) {
        openDocument(document as OnyxDocument, updatePresentingDocument);
      } else if (question && openQuestion) {
        openQuestion(question);
      }
    }, [document, updatePresentingDocument, question, openQuestion]);

    if (valueText.startsWith("*")) {
      return <BlinkingBar addMargin />;
    } else if (valueText.startsWith("[")) {
      const sourceInfo = documentSourceInfo || questionSourceInfo;
      if (!sourceInfo) {
        return <>{rest.children}</>;
      }

      const displayName = document
        ? getDisplayNameForSource(document as OnyxDocument)
        : question?.question || t("memoizedLink.questionFallback.label");

      if (workspaceAi)
        return (
          <WorkspaceCitation
            source={sourceInfo}
            label={valueText.slice(1, -1)}
            onOpen={handleSourceClick}
          />
        );

      return (
        <SourceTag
          variant="inlineCitation"
          displayName={displayName}
          sources={[sourceInfo]}
          onSourceClick={handleSourceClick}
          showDetailsCard
          className="me-0.5"
        />
      );
    }

    const url = ensureHrefProtocol(href);

    // Check if the link is to a file on the backend
    const isChatFile = url?.includes("/api/chat/file/");
    if (isChatFile && updatePresentingDocument) {
      const fileId = url!.split("/api/chat/file/")[1]?.split(/[?#]/)[0] || "";
      const filename = value?.toString() || "download";
      return (
        <button
          type="button"
          onClick={() =>
            updatePresentingDocument({
              document_id: fileId,
              semantic_identifier: filename,
            })
          }
          // `inline`: a button is inline-block by default, which would break
          // the surrounding prose differently than the <a> it replaces.
          className="inline cursor-pointer text-link hover:text-link-hover"
        >
          {rest.children}
        </button>
      );
    }

    if (workspaceAi && sourceWebUrl(url)) {
      const title = valueText || new URL(url!).hostname;
      return (
        <WorkspaceCitation
          source={{
            id: url!,
            title,
            sourceType: ValidSources.Web,
            sourceUrl: url,
          }}
          label={title}
        />
      );
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="cursor-pointer text-link hover:text-link-hover"
      >
        {rest.children}
      </a>
    );
  }
);

interface MemoizedParagraphProps {
  className?: string;
  // Stamped per-paragraph by the rehypeDirection plugin so RTL and LTR
  // paragraphs align independently. Unstamped paragraphs inherit their
  // container's direction.
  dir?: React.HTMLAttributes<HTMLElement>["dir"];
  children?: React.ReactNode;
}

export const MemoizedParagraph = memo(function MemoizedParagraph({
  className,
  dir,
  children,
}: MemoizedParagraphProps) {
  return (
    <Text as="p" dir={dir} mainContentBody text04 className={className}>
      {children}
    </Text>
  );
});

MemoizedAnchor.displayName = "MemoizedAnchor";
MemoizedLink.displayName = "MemoizedLink";
MemoizedParagraph.displayName = "MemoizedParagraph";
