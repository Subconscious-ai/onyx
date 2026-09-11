"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import DOMPurify from "dompurify";
import { Text } from "@opal/components";

let library: Promise<typeof import("mermaid").default> | undefined;

let renderQueue: Promise<unknown> = Promise.resolve();

function renderDiagram(id: string, source: string, dark: boolean) {
  library ??= import("mermaid").then(({ default: mermaid }) => mermaid);
  const pending = renderQueue.then(async () => {
    const mermaid = await library!;
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? "dark" : "neutral",
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true },
      maxTextSize: 20000,
      maxEdges: 200,
      secure: [
        "secure",
        "theme",
        "themeVariables",
        "themeCSS",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "maxEdges",
        "htmlLabels",
        "flowchart",
        "suppressErrorRendering",
      ],
    });
    return mermaid.render(id, source);
  });
  // Mermaid owns global configuration; serialize theme setup with rendering.
  renderQueue = pending.catch(() => undefined);
  return pending;
}

export default function MermaidDiagram({ source }: { source: string }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = useTranslations("chat.messages.diagram");
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [result, setResult] = useState<{
    source: string;
    dark: boolean;
    svg: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Wait for a pause in the stream before parsing an incomplete diagram.
    const timer = setTimeout(async () => {
      try {
        if (source.length > 20000) throw new Error("Diagram too large");
        const { svg } = await renderDiagram(`diagram${id}`, source, dark);
        const clean = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ["foreignObject", "a", "image", "use"],
        });
        if (!cancelled) setResult({ source, dark, svg: clean });
      } catch {
        if (!cancelled) setResult({ source, dark, svg: null });
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, source, dark]);

  const current =
    result?.source === source && result.dark === dark ? result : null;
  return (
    <div
      className="w-full min-w-0 rounded-12 border border-border-01 p-3"
      dir="ltr"
    >
      {current?.svg ? (
        <div
          role="img"
          aria-label={t("label")}
          className="overflow-x-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: current.svg }}
        />
      ) : (
        <Text as="p" role="status" font="secondary-body" color="text-03">
          {current ? t("unavailable") : t("preparing")}
        </Text>
      )}
      <details className="pt-2" open={current?.svg === null}>
        <summary className="cursor-pointer text-sm text-text-03">
          {t("source")}
        </summary>
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
          {source}
        </pre>
      </details>
    </div>
  );
}
