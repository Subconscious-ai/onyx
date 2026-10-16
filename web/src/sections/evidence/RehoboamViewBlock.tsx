"use client";

import "../executive/contract.css";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Text } from "@opal/components";
import { RehoboamEvidenceView } from "./rehoboam-evidence-view";

// The backend writes each MCP evidence view as a chat file and links it here.
const CHAT_FILE = /^\/api\/chat\/file\/[\w.-]+$/;

export default function RehoboamViewBlock({ source }: { source: string }) {
  const t = useTranslations("chat.messages.evidence");
  const link = source.trim();
  const [result, setResult] = useState<{
    link: string;
    view: unknown;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Wait for a pause in the stream before fetching an incomplete link.
    const timer = setTimeout(async () => {
      let view: unknown = null;
      try {
        if (!CHAT_FILE.test(link)) throw new Error("Not a chat file");
        const response = await fetch(link, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        view = await response.json();
      } catch {
        view = null;
      }
      if (!cancelled) setResult({ link, view });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [link]);

  const current = result?.link === link ? result : null;
  return (
    <div
      className="w-full min-w-0 rounded-12 border border-border-01 p-3"
      dir="ltr"
      aria-label={t("label")}
    >
      {current?.view ? (
        <RehoboamEvidenceView view={current.view} />
      ) : (
        <Text as="p" role="status" font="secondary-body" color="text-03">
          {current ? t("unavailable") : t("preparing")}
        </Text>
      )}
    </div>
  );
}
