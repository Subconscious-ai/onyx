"use client";

/**
 * Kokonut UI AI Input Search, controlled composition adaptation.
 * https://kokonutui.com/r/ai-input-search.json (MIT, @kokonutui, v4.0.0).
 * Keeps the inset 22/18px frame and spacious editor/control composition.
 * Native Onyx owns editing, files, tools, models, send, queue and cancellation.
 * Copyright and permission notice: Kokonut.LICENSE.
 */
import type { ComponentPropsWithRef } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Text } from "@opal/components";
import { cn } from "@opal/utils";
import "@/sections/customer/ai-elements.css";

interface AIInputSearchProps extends ComponentPropsWithRef<"div"> {
  toolLabel?: string;
  onFocusInput: () => void;
}

export default function AIInputSearch({
  children,
  className,
  ref,
  toolLabel,
  onFocusInput,
  ...props
}: AIInputSearchProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div
        {...props}
        ref={ref}
        data-kokonut="ai-input-search"
        className={cn("kokonut-input-search", className)}
        onPointerDown={(event) => {
          if (
            event.target === event.currentTarget ||
            (event.target instanceof HTMLElement &&
              event.target.classList.contains("kokonut-input-search__card"))
          ) {
            event.preventDefault();
            onFocusInput();
          }
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {toolLabel && (
            <motion.div
              key={toolLabel}
              className="kokonut-input-search__tool"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              <Text font="secondary-body" color="text-04">
                {toolLabel}
              </Text>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="kokonut-input-search__card">{children}</div>
      </div>
    </MotionConfig>
  );
}
