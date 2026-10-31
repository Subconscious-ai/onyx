"use client";

/**
 * @author: @kokonutui
 * @description: AI Loading State
 * @version: 2.0.0
 * @date: 2026-10-14
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { cn } from "@opal/utils";
import "@/sections/customer/ai-elements.css";

// Controlled adaptation: Onyx supplies real tool states. No demo or invented timings.
// Copyright and permission notice: Kokonut.LICENSE.
export type AgentStepStatus = "pending" | "running" | "done" | "error";
export interface AgentStep {
  id: string;
  label: string;
  status: AgentStepStatus;
}
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function StepIcon({ status }: { status: AgentStepStatus }) {
  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={{ opacity: 1, filter: "blur(0px)" }}
          className="absolute inset-0 flex items-center justify-center"
          exit={{ opacity: 0, filter: "blur(2px)" }}
          initial={{ opacity: 0, filter: "blur(2px)" }}
          key={status}
          transition={{ duration: 0.18, ease: EASE_OUT }}
        >
          {status === "pending" && (
            <span className="size-1.5 rounded-full bg-background-neutral-04" />
          )}
          {status === "running" && (
            <svg
              aria-hidden="true"
              className="size-3.5 motion-safe:animate-spin"
              fill="none"
              style={{ animationDuration: "0.8s" }}
              viewBox="0 0 16 16"
            >
              <circle
                className="stroke-border-01"
                cx="8"
                cy="8"
                r="6.25"
                strokeWidth="1.5"
              />
              <path
                className="stroke-text-05"
                d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25"
                strokeLinecap="round"
                strokeWidth="1.5"
              />
            </svg>
          )}
          {status === "done" && (
            <svg
              aria-hidden="true"
              className="size-3.5 text-text-05"
              fill="none"
              viewBox="0 0 16 16"
            >
              {/* The check draws itself once, from the short stroke out. */}
              <motion.path
                animate={{ pathLength: 1 }}
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                initial={{ pathLength: 0 }}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.05 }}
              />
            </svg>
          )}
          {status === "error" && (
            <svg
              aria-hidden="true"
              className="size-3.5 text-status-error-05"
              fill="none"
              viewBox="0 0 16 16"
            >
              <path
                d="M4.5 4.5l7 7m0-7-7 7"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.75"
              />
            </svg>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// Same stylesheet as AI Text Loading, so the two share one copy on a page.
const WAVE_CSS = `
@keyframes kokonut-ai-wave { 50% { opacity: 0.3; } }
.kokonut-ai-wave { animation: kokonut-ai-wave 1.6s ease-in-out infinite both; }
@media (prefers-reduced-motion: reduce) { .kokonut-ai-wave { animation: none; } }
`;

/** A soft brightness wave through the running step's letters. */
function WaveText({ text }: { text: string }) {
  return (
    <>
      <style href="kokonut-ai-wave" precedence="default">
        {WAVE_CSS}
      </style>
      {Array.from(text).map((char, i) => (
        <span
          className="kokonut-ai-wave whitespace-pre"
          // biome-ignore lint/suspicious/noArrayIndexKey: letters of one fixed label, never reordered
          key={i}
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          {char}
        </span>
      ))}
    </>
  );
}

function StepRow({ step, isLast }: { step: AgentStep; isLast: boolean }) {
  return (
    <li className="relative flex gap-3 pt-3.5">
      {/* The rail between icons fills in as each step completes. */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute top-[34px] bottom-[-10px] left-[7.5px] w-px overflow-hidden bg-border-01"
        >
          <span
            className={cn(
              "block h-full w-full origin-top bg-text-03 transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
              step.status === "done" ? "scale-y-100" : "scale-y-0"
            )}
          />
        </span>
      )}
      <StepIcon status={step.status} />
      <div className="-mt-0.5 min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className={cn(
              "min-w-0 truncate text-sm transition-colors duration-200",
              step.status === "running" ? "text-text-05" : "text-text-03"
            )}
          >
            {step.status === "running" ? (
              <>
                <span className="sr-only">{step.label}</span>
                <span aria-hidden="true">
                  <WaveText text={step.label} />
                </span>
              </>
            ) : (
              step.label
            )}
          </p>
        </div>
      </div>
    </li>
  );
}

interface AILoadingStateProps {
  steps: AgentStep[];
  compact?: boolean;
}
export default function AILoadingState({
  steps,
  compact = false,
}: AILoadingStateProps) {
  return (
    <MotionConfig reducedMotion="user">
      <ol
        className={cn("kokonut-loading", compact && "kokonut-loading--compact")}
        data-kokonut="ai-state-loading"
        aria-live="polite"
      >
        {steps.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            isLast={index === steps.length - 1}
          />
        ))}
      </ol>
    </MotionConfig>
  );
}
