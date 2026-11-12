import type { CauslContextMessage } from "@/lib/causl/types";

type CauslNavigationMessage = Pick<
  CauslContextMessage,
  "nonce" | "revision" | "actor"
> & { kind: "causl:navigate"; href: string };

/** Keep authorized KB record links in the parent shell without changing native markdown. */
export function installCauslNavigation(options: {
  document: Document;
  parentOrigin: string;
  current: () => CauslContextMessage | null;
  send: (message: CauslNavigationMessage) => void;
}) {
  function receive(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor =
      event.target instanceof Element ? event.target.closest("a") : null;
    const context = options.current();
    if (!anchor || anchor.hasAttribute("download") || !context) return;
    const href = anchor.href;
    if (
      href.length > 18000 ||
      [...href].some(
        (character) =>
          character === "\\" ||
          character.charCodeAt(0) <= 32 ||
          character.charCodeAt(0) === 127
      ) ||
      !URL.canParse(href)
    )
      return;
    const url = new URL(href);
    const route = url.pathname.match(
      /^\/(?:en\/|fr\/)?dashboard\/(library|model|analysis)$/
    );
    if (
      url.origin !== options.parentOrigin ||
      url.username ||
      url.password ||
      !route ||
      (url.searchParams.has("market") &&
        url.searchParams.get("market") !== context.selection.marketId)
    )
      return;
    const keys =
      route[1] === "library"
        ? ["market", "type", "entity", "record"]
        : route[1] === "model"
          ? ["market"]
          : ["market", "run", "studio"];
    if (
      [...url.searchParams.keys()].some(
        (key) =>
          !keys.includes(key) || url.searchParams.getAll(key).length !== 1
      )
    )
      return;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const review =
      route[1] === "library"
        ? "review"
        : route[1] === "model"
          ? "modelReview"
          : "reportReview";
    if (
      [...fragment.keys()].some(
        (key) => key !== review || fragment.getAll(key).length !== 1
      )
    )
      return;
    event.preventDefault();
    options.send({
      kind: "causl:navigate",
      nonce: context.nonce,
      revision: context.revision,
      actor: context.actor,
      href,
    });
  }
  options.document.addEventListener("click", receive, true);
  return () => options.document.removeEventListener("click", receive, true);
}
