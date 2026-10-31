"use client";

/**
 * Adapted from Kokonut UI AI Loading State v2.0.0, @kokonutui, MIT.
 * https://kokonutui.com/r/ai-loading.json
 * Native Onyx supplies the current activity and owns the detailed timeline.
 * Copyright and permission notice: Kokonut.LICENSE.
 */
import { Text } from "@opal/components";
import { SvgSimpleLoader } from "@opal/icons";
import type { RichStr } from "@opal/types";
import { richNodes } from "@opal/utils";
import "@/sections/customer/ai-elements.css";

const WAVE_CSS = `
@keyframes kokonut-ai-wave { 50% { opacity: 0.3; } }
.kokonut-ai-wave { animation: kokonut-ai-wave 1.6s ease-in-out infinite both; }
@media (prefers-reduced-motion: reduce) { .kokonut-ai-wave { animation: none; } }
`;

interface AILoadingStateProps {
  label: string | RichStr;
}

export default function AILoadingState({ label }: AILoadingStateProps) {
  return (
    <div
      className="kokonut-loading"
      data-kokonut="ai-state-loading"
      aria-live="polite"
    >
      <style href="kokonut-ai-wave" precedence="default">
        {WAVE_CSS}
      </style>
      <SvgSimpleLoader
        aria-hidden="true"
        className="shrink-0 motion-reduce:animate-none"
      />
      <Text font="secondary-body" color="inherit">
        {typeof label === "string"
          ? richNodes(
              <>
                <span className="sr-only">{label}</span>
                <span aria-hidden="true">
                  {Array.from(label).map((char, index) => (
                    <span
                      className="kokonut-ai-wave whitespace-pre"
                      key={index}
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      {char}
                    </span>
                  ))}
                </span>
              </>
            )
          : label}
      </Text>
    </div>
  );
}
