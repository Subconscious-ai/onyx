"use client";

/* Adapted from Kokonut UI Pro Action Search Bar. See SOURCES.md.
 * Retains the clipped scope tabs, command rows, keycaps, and keyboard highlight.
 * Onyx supplies authorized results and navigation. No demo actions or receipts.
 */
import { CornerDownLeft, Search } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { cn } from "@opal/utils";

export type Scope = "all" | "action" | "chat" | "project";
type Source = "keyboard" | "pointer";
export interface CommandItem {
  id: string;
  label: string;
  icon?: ReactNode;
  kind: Exclude<Scope, "all">;
  meta?: string;
}
export interface CommandRun {
  item: CommandItem;
}
export interface ActionSearchBarProps {
  items: CommandItem[];
  onQueryChange?: (query: string) => void;
  onScopeChange?: (scope: Scope) => void;
  onSelect?: (run: CommandRun) => void;
  isSearching?: boolean;
  label?: string;
  listFooter?: ReactNode;
}
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const SCOPES: { id: Scope; prefix?: string }[] = [
  { id: "all" },
  { id: "action", prefix: ">" },
  { id: "chat", prefix: "#" },
  { id: "project", prefix: "@" },
];

const kbd =
  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-background-neutral-01 px-1 font-mono text-[10px] text-text-03 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_0_rgba(0,0,0,0.08)]   ";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-theme-primary-05 ";

function ScopeTabs({
  scope,
  counts,
  animateNext,
  onPick,
  baseId,
}: {
  scope: Scope;
  counts: Record<Scope, number>;
  animateNext: boolean;
  onPick: (scope: Scope, source: Source) => void;
  baseId: string;
}) {
  const t = useTranslations("sidebar.chatSearch.pro");
  const labels = {
    all: t("all"),
    action: t("actions"),
    chat: t("chats"),
    project: t("projects"),
  };
  const rowRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
      return;
    }
    e.preventDefault();
    const i = SCOPES.findIndex((s) => s.id === scope);
    const step = e.key === "ArrowRight" ? 1 : -1;
    const next = SCOPES[(i + step + SCOPES.length) % SCOPES.length];
    if (next) {
      onPick(next.id, "keyboard");
      document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
    }
  };
  const [clip, setClip] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: counts change tab widths
  useLayoutEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>(`[data-scope="${scope}"]`);
    if (!(row && tab)) {
      return;
    }
    const measure = () => {
      const left = tab.offsetLeft;
      const right = row.offsetWidth - left - tab.offsetWidth;
      setClip(`inset(0 ${right}px 0 ${left}px round 7px)`);
    };
    measure();
    // Re-measure when a web font lands late or the card resizes.
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    ro.observe(tab);
    return () => ro.disconnect();
  }, [scope, counts]);

  const label = (s: (typeof SCOPES)[number], ink: boolean) => (
    <>
      {labels[s.id]}
      <span
        className={cn(
          "text-[11px] tabular-nums",
          ink ? "text-text-inverted-03 " : "text-text-03 "
        )}
      >
        {counts[s.id]}
      </span>
    </>
  );

  const tab =
    "relative flex min-h-11 items-center gap-1.5 rounded-[7px] px-2.5 text-[12.5px] after:absolute after:inset-x-0 after:-inset-y-2";

  return (
    <div className="px-1.5 pb-1.5">
      <div
        aria-label={t("searchIn")}
        className="relative flex gap-0.5"
        onKeyDown={onKeyDown}
        ref={rowRef}
        role="tablist"
        tabIndex={-1}
      >
        {SCOPES.map((s) => (
          <button
            aria-controls={`${baseId}-panel`}
            aria-selected={scope === s.id}
            className={cn(
              tab,
              "text-text-03 transition-colors duration-150 hover:bg-background-tint-02 hover:text-text-01   ",
              focusRing
            )}
            data-scope={s.id}
            id={`${baseId}-tab-${s.id}`}
            key={s.id}
            onClick={() => onPick(s.id, "pointer")}
            onPointerDown={(e) => e.preventDefault()}
            role="tab"
            tabIndex={scope === s.id ? 0 : -1}
            type="button"
          >
            {label(s, false)}
          </button>
        ))}
        {clip && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex gap-0.5"
            style={{
              clipPath: clip,
              transition: animateNext ? `clip-path 220ms ${EASE_OUT}` : "none",
            }}
          >
            {SCOPES.map((s) => (
              <span
                className={cn(
                  tab,
                  "bg-background-neutral-inverted-01 text-text-inverted-01  "
                )}
                key={s.id}
              >
                {label(s, true)}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function CommandRow({
  item,
  id,
  active,
  onChoose,
  onHover,
}: {
  item: CommandItem;
  id: string;
  active: boolean;
  onChoose: () => void;
  onHover: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: combobox pattern, focus stays in the input (aria-activedescendant)
    // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the input
    <div
      aria-selected={active}
      className={cn(
        // No transition: the highlight follows arrow keys, which land at once.
        "flex min-h-11 cursor-default items-center gap-2.5 rounded-[8px] px-2.5 text-[13.5px] ring-1 aria-disabled:opacity-50",
        active
          ? "bg-background-neutral-01 text-text-01 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-border-01    "
          : "text-text-02 ring-transparent "
      )}
      id={id}
      onClick={onChoose}
      // Keep focus in the field while pressing a row.
      onPointerDown={(e) => e.preventDefault()}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse") {
          onHover();
        }
      }}
      role="option"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onChoose();
        }
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center",
          active ? "text-text-02 " : "text-text-03 "
        )}
      >
        {item.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="max-w-24 truncate text-xs text-text-03">
          {item.meta}
        </span>
        {active && (
          <CornerDownLeft aria-hidden="true" className="size-3 text-text-03" />
        )}
      </span>
    </div>
  );
}

function EmptyResults() {
  const t = useTranslations("sidebar.chatSearch.list");
  return (
    <p className="px-3 py-8 text-center text-sm text-text-03">
      {t("noResults.text")}
    </p>
  );
}

export default function ActionSearchBar({
  items,
  onQueryChange,
  onScopeChange,
  onSelect,
  isSearching = false,
  label,
  listFooter,
}: ActionSearchBarProps) {
  const t = useTranslations("sidebar.chatSearch");
  const fieldLabel = label ?? t("searchInput.placeholder");
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [text, setText] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [animateScope, setAnimateScope] = useState(false);
  const counts = {
    all: items.length,
    action: 0,
    chat: 0,
    project: 0,
  } satisfies Record<Scope, number>;
  for (const item of items) counts[item.kind] += 1;
  // Native search can match message bodies even when the title has no match.
  const rows = items.filter((item) => scope === "all" || item.kind === scope);
  const highlighted = Math.min(activeIndex, rows.length - 1);
  const optionId = (index: number) => `${uid}-option-${index}`;
  useEffect(() => {
    onQueryChange?.(text);
  }, [text, onQueryChange]);
  useEffect(() => {
    onScopeChange?.(scope);
  }, [scope, onScopeChange]);
  useLayoutEffect(() => {
    const list = listRef.current;
    const row = document.getElementById(optionId(highlighted));
    if (!list || !row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  });
  const pickScope = (next: Scope, source: Source) => {
    setAnimateScope(source === "pointer" && !reduce);
    setScope(next);
    setActiveIndex(0);
    if (source === "pointer") inputRef.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      if (rows.length)
        setActiveIndex(
          (Math.max(highlighted, 0) + step + rows.length) % rows.length
        );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = rows[highlighted];
      if (item) onSelect?.({ item });
    } else if ((event.key === "Backspace" && !text) || event.key === "Escape") {
      if (text || scope !== "all") {
        event.preventDefault();
        event.stopPropagation();
        if (text) setText("");
        else pickScope("all", "keyboard");
        setActiveIndex(0);
      }
    }
  };
  return (
    <div className="w-full p-1.5">
      <div className="flex h-12 items-center gap-2 rounded-lg px-3 focus-within:ring-2 focus-within:ring-theme-primary-05">
        <Search aria-hidden="true" className="size-4 shrink-0 text-text-03" />
        <label className="sr-only" htmlFor={`${uid}-input`}>
          {fieldLabel}
        </label>
        <input
          id={`${uid}-input`}
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={`${uid}-listbox`}
          aria-activedescendant={
            highlighted >= 0 ? optionId(highlighted) : undefined
          }
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-text-01 outline-none placeholder:text-text-03"
          placeholder={fieldLabel}
          value={text}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            const value = event.target.value;
            const typed = SCOPES.find(
              (candidate) =>
                candidate.prefix && value.startsWith(candidate.prefix)
            );
            if (typed) {
              pickScope(typed.id, "keyboard");
              setText(value.slice(1).trimStart());
            } else setText(value);
            setActiveIndex(0);
          }}
        />
        <span className={kbd} aria-hidden="true">
          esc
        </span>
      </div>
      <ScopeTabs
        scope={scope}
        counts={counts}
        animateNext={animateScope}
        onPick={pickScope}
        baseId={uid}
      />
      <div
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-tab-${scope}`}
        className="rounded-[12px] bg-background-tint-01 ring-1 ring-border-01 ring-inset"
      >
        <div
          role="listbox"
          aria-label={fieldLabel}
          aria-busy={isSearching}
          id={`${uid}-listbox`}
          ref={listRef}
          className="relative max-h-[min(50dvh,400px)] overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]"
        >
          {rows.map((item, index) => (
            <CommandRow
              key={item.id}
              item={item}
              id={optionId(index)}
              active={index === highlighted}
              onChoose={() => onSelect?.({ item })}
              onHover={() => setActiveIndex(index)}
            />
          ))}
          {!rows.length && !isSearching && <EmptyResults />}
        </div>
        {isSearching && (
          <p role="status" className="p-3 text-center text-sm text-text-03">
            {t("pro.searching")}
          </p>
        )}
        {(scope === "all" || scope === "chat") && listFooter}
      </div>
      <div
        className="flex min-h-11 items-center justify-between gap-3 px-2.5 text-xs text-text-03"
        aria-hidden="true"
      >
        <span className="flex items-center gap-1">
          <span className={kbd}>↑</span>
          <span className={kbd}>↓</span> {t("footer.selectAction.label")}
        </span>
        <span className="flex items-center gap-1">
          <span className={kbd}>
            <CornerDownLeft className="size-3" />
          </span>{" "}
          {t("footer.openAction.label")}
        </span>
      </div>
    </div>
  );
}
