"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import ActionSearchBar, {
  type ActionSearchBarProps,
} from "@/sections/customer/pro/ActionSearchBar";
import { ProductButton } from "@/sections/customer/pro/ProductButton";

interface ProSearchDialogProps extends ActionSearchBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}

export default function ProSearchDialog({
  open,
  onOpenChange,
  trigger,
  hasMore,
  isLoadingMore,
  onLoadMore,
  ...props
}: ProSearchDialogProps) {
  const t = useTranslations("sidebar.chatSearch.pro");
  const searchText = useTranslations("sidebar.chatSearch");
  const triggerRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <span ref={triggerRef} className="contents">
        {trigger}
      </span>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal-overlay bg-mask-03" />
        <Dialog.Content
          ref={contentRef}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current
              ?.querySelector<HTMLElement>("button, a")
              ?.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current
              ?.querySelector<HTMLInputElement>("input")
              ?.focus();
          }}
          onEscapeKeyDown={(event) => {
            // Radix handles Escape during capture, before the field clears its query or scope.
            const field = contentRef.current?.querySelector("input");
            const allTab =
              contentRef.current?.querySelector('[data-scope="all"]');
            if (
              event.target === field &&
              (field?.value ||
                allTab?.getAttribute("aria-selected") === "false")
            ) {
              event.preventDefault();
            }
          }}
          aria-describedby={undefined}
          className="fixed inset-x-4 top-[min(15dvh,96px)] z-modal mx-auto w-[min(560px,calc(100dvw-32px))] max-h-[80dvh] overflow-y-auto rounded-16 bg-background-neutral-01 shadow-2xl outline-none"
        >
          <div className="flex items-center justify-between px-4 pt-2">
            <Dialog.Title className="text-sm text-text-03">
              {props.label ?? searchText("searchInput.placeholder")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <ProductButton
                variant="ghost"
                size="icon"
                aria-label={t("close")}
              >
                <X size={16} />
              </ProductButton>
            </Dialog.Close>
          </div>
          <ActionSearchBar
            {...props}
            listFooter={
              hasMore ? (
                <div className="p-2">
                  <ProductButton
                    variant="ghost"
                    className="w-full"
                    disabled={isLoadingMore}
                    onClick={onLoadMore}
                  >
                    {isLoadingMore ? t("loading") : t("loadMore")}
                  </ProductButton>
                </div>
              ) : undefined
            }
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
