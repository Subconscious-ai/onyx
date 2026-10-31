"use client";

/**
 * Adapted from Kokonut UI AI Inline Citations v1.0.0, @kokonutui, MIT.
 * https://kokonutui.com/r/ai-citations.json
 * Retains the monogram pill, source preview and focus/touch disclosure.
 * Radix owns collision handling, Escape and outside dismissal.
 * Native Onyx owns document identity and opening the full source.
 * Copyright and permission notice: Kokonut.LICENSE.
 */
import { useEffect, useId, useRef, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import { Popover, Text, Button } from "@opal/components";
import { SvgArrowUpRight } from "@opal/icons";
import type { SourceInfo } from "@/refresh-components/buttons/source-tag/SourceTagDetailsCard";
import "@/sections/customer/ai-elements.css";

interface AIInlineCitationProps {
  source: Pick<SourceInfo, "title" | "sourceUrl" | "description">;
  label: string;
  quote?: string | null;
  onOpen?: () => void;
}

export default function AIInlineCitation({
  source,
  label,
  quote,
  onOpen,
}: AIInlineCitationProps) {
  const [open, setOpen] = useState(false);
  const previewId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  const returningFocus = useRef(false);
  useEffect(() => {
    if (open && keyboard.current)
      (preview.current?.querySelector("button") ?? preview.current)?.focus();
  }, [open]);
  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
  }
  function show(immediate = false) {
    clearTimer();
    if (immediate) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), 120);
  }
  function hide() {
    clearTimer();
    timer.current = setTimeout(() => setOpen(false), 90);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  let site = quote || !onOpen ? source.title : label;
  if (source.sourceUrl) {
    try {
      site = new URL(source.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      // Indexed files need no public URL. The native source label is valid.
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <button
            ref={trigger}
            type="button"
            data-kokonut="ai-inline-citation"
            className="kokonut-citation"
            aria-label={source.title}
            aria-controls={open ? previewId : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-state={open ? "open" : "closed"}
            onClick={() => show(true)}
            onFocus={() => {
              if (returningFocus.current) returningFocus.current = false;
              else show(true);
            }}
            onKeyDown={(event) => {
              if (["Enter", " ", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                keyboard.current = true;
                show(true);
                (
                  preview.current?.querySelector("button") ?? preview.current
                )?.focus();
              }
            }}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") show();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") hide();
            }}
          >
            <span aria-hidden="true" className="kokonut-citation__monogram">
              {site.charAt(0).toUpperCase()}
            </span>
            <Text font="figure-small-value" color="inherit">
              {site}
            </Text>
          </button>
        </Popover.Anchor>
        <Popover.Content
          id={previewId}
          aria-label={source.title}
          side="top"
          align="start"
          width="xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (keyboard.current)
              (
                preview.current?.querySelector("button") ?? preview.current
              )?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (keyboard.current) {
              returningFocus.current = true;
              trigger.current?.focus();
            }
            keyboard.current = false;
          }}
          onInteractOutside={() => {
            keyboard.current = false;
          }}
          onPointerEnter={clearTimer}
          onPointerLeave={hide}
        >
          <motion.div
            ref={preview}
            tabIndex={-1}
            data-kokonut="ai-citation-preview"
            className="kokonut-citation-preview"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
          >
            <Text font="secondary-body" color="text-03">
              {site}
            </Text>
            <Text font="main-ui-body" color="text-05">
              {source.title}
            </Text>
            {source.description && (
              <Text font="secondary-body" color="text-03" maxLines={3}>
                {source.description}
              </Text>
            )}
            {quote && (
              <blockquote>
                <Text font="secondary-body" color="text-05">
                  {quote}
                </Text>
              </blockquote>
            )}
            {onOpen && (
              <Button
                prominence="tertiary"
                rightIcon={SvgArrowUpRight}
                onClick={() => {
                  setOpen(false);
                  onOpen();
                }}
                width="full"
              >
                {label}
              </Button>
            )}
          </motion.div>
        </Popover.Content>
      </Popover>
    </MotionConfig>
  );
}
