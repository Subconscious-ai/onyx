"use client";

/* Adapted from Kokonut Pro Response Feedback. See SOURCES.md. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { SvgArrowUp, SvgThumbsDown, SvgThumbsUp } from "@opal/icons";
import type { FeedbackType } from "@/app/app/interfaces";
import { ProductButton } from "@/sections/customer/pro/ProductButton";
import { cn } from "@opal/utils";

interface ResponseFeedbackProps {
  rating?: FeedbackType | null;
  disabled?: boolean;
  onFeedback: (rating: FeedbackType | null, note?: string) => Promise<boolean>;
  copyAction: ReactNode;
  children?: ReactNode;
}

export default function ResponseFeedback({
  rating,
  disabled,
  onFeedback,
  copyAction,
  children,
}: ResponseFeedbackProps) {
  const t = useTranslations("chat.messages");
  const form = useTranslations("chat.modals.feedback");
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const groupId = useId();
  const downRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (asking) inputRef.current?.focus();
  }, [asking]);

  function close() {
    setAsking(false);
    requestAnimationFrame(() => downRef.current?.focus());
  }

  async function submit(next: FeedbackType | null, text?: string) {
    if (pending || disabled) return;
    setPending(true);
    try {
      if (await onFeedback(next, text)) {
        setNote("");
        close();
      }
    } finally {
      setPending(false);
    }
  }

  const buttonClass = "!min-h-11 !min-w-11 !p-2";
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={groupId}>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-1">
          {copyAction}
          {!disabled && (
            <motion.div
              layout="position"
              transition={{ type: "spring", duration: 0.45, bounce: 0.12 }}
              className={cn(
                "flex min-w-0 items-center rounded-xl",
                asking && "flex-1 border border-border-02 bg-background-tint-01"
              )}
            >
              {asking ? (
                <form
                  className="flex w-full min-w-0 flex-row items-center gap-1 p-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (note.trim()) void submit("dislike", note.trim());
                  }}
                >
                  <ProductButton
                    variant="ghost"
                    size="icon"
                    className={buttonClass}
                    aria-label={form("cancelButton.label")}
                    disabled={pending}
                    onClick={close}
                  >
                    <motion.span layoutId="feedback-thumb" className="flex">
                      <SvgThumbsDown className="size-4" />
                    </motion.span>
                  </ProductButton>
                  <input
                    ref={inputRef}
                    aria-label={form("additionalDetails.label")}
                    placeholder={form("additionalDetails.dislikePlaceholder")}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && !pending) {
                        event.preventDefault();
                        event.stopPropagation();
                        close();
                      }
                    }}
                    readOnly={pending}
                    className="min-h-11 min-w-0 w-full bg-transparent text-sm text-text-04 placeholder:text-text-02 outline-none focus-visible:ring-2 focus-visible:ring-border-04 rounded-lg px-2"
                  />
                  <ProductButton
                    type="submit"
                    size="icon"
                    className={buttonClass}
                    disabled={pending || !note.trim()}
                    aria-label={form(
                      pending
                        ? "submitButton.loadingLabel"
                        : "submitButton.label"
                    )}
                  >
                    <SvgArrowUp className="size-4" />
                  </ProductButton>
                </form>
              ) : (
                <div className="flex items-center">
                  <ProductButton
                    variant="ghost"
                    size="icon"
                    className={buttonClass}
                    aria-pressed={rating === "like"}
                    aria-label={t(
                      rating === "like"
                        ? "toolbar.likeButton.removeTooltip"
                        : "toolbar.likeButton.tooltip"
                    )}
                    disabled={pending}
                    data-testid="AgentMessage/like-button"
                    onClick={() =>
                      void submit(rating === "like" ? null : "like")
                    }
                  >
                    <SvgThumbsUp
                      className={cn(
                        "size-4",
                        rating === "like" && "fill-current -rotate-12"
                      )}
                    />
                  </ProductButton>
                  <ProductButton
                    ref={downRef}
                    variant="ghost"
                    size="icon"
                    className={buttonClass}
                    aria-expanded={asking}
                    aria-pressed={rating === "dislike"}
                    aria-label={t(
                      rating === "dislike"
                        ? "toolbar.dislikeButton.removeTooltip"
                        : "toolbar.dislikeButton.tooltip"
                    )}
                    disabled={pending}
                    data-testid="AgentMessage/dislike-button"
                    onClick={() =>
                      rating === "dislike" ? void submit(null) : setAsking(true)
                    }
                  >
                    <motion.span layoutId="feedback-thumb" className="flex">
                      <SvgThumbsDown
                        className={cn(
                          "size-4",
                          rating === "dislike" && "fill-current"
                        )}
                      />
                    </motion.span>
                  </ProductButton>
                </div>
              )}
            </motion.div>
          )}
          {(disabled || !asking) && children}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
