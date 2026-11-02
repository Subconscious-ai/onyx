"use client";

/* Adapted from Kokonut Pro Reasoning. See SOURCES.md. */
import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { SvgChevronRight } from "@opal/icons";
import { Text } from "@opal/components";
import { ProductButton } from "@/sections/customer/pro/ProductButton";

interface ReasoningProps {
  thinking: boolean;
  label: string;
  children: ReactNode;
}

export default function Reasoning({
  thinking,
  label,
  children,
}: ReasoningProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-w-0 w-full text-text-03">
        {!thinking && (
          <ProductButton
            variant="ghost"
            className="!justify-start gap-1"
            aria-controls={panelId}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <Text font="secondary-action" color="text-03">
              {label}
            </Text>
            <motion.span animate={{ rotate: open ? 90 : 0 }}>
              <SvgChevronRight className="size-4" />
            </motion.span>
          </ProductButton>
        )}
        <AnimatePresence initial={false}>
          {(thinking || open) && (
            <motion.div
              id={panelId}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className={
                thinking
                  ? "h-[4.8em] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_55%)]"
                  : "overflow-hidden border-s border-border-02 ps-3.5"
              }
            >
              <div
                className={
                  thinking ? "flex h-full flex-col justify-end" : undefined
                }
              >
                <div>{children}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
