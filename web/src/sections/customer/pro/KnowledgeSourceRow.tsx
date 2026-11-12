"use client";

/* Kokonut Pro Knowledge Sources: source row. See SOURCES.md. */
import type { ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";

interface KnowledgeSourceRowProps {
  icon: ReactNode;
  children: ReactNode;
}

export default function KnowledgeSourceRow({
  icon,
  children,
}: KnowledgeSourceRowProps) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
        className="flex items-center gap-3 px-3 py-2.5 min-w-0"
      >
        <span className="flex h-11 w-9 shrink-0 items-center justify-center rounded-md bg-background-tint-02 text-text-03 ring-1 ring-border-01 ring-inset">
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
      </motion.div>
    </MotionConfig>
  );
}
