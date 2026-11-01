import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse);
type TextNode = {
  type: string;
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: TextNode[];
};

function visibleQuote(node: TextNode): string | undefined {
  if (node.type === "text") return node.value;
  if (!["root", "paragraph", "strong", "emphasis"].includes(node.type))
    return undefined;
  const parts = node.children?.map(visibleQuote) ?? [];
  return parts.some((part) => part === undefined) ? undefined : parts.join("");
}

/** Cite only verbatim testimony, never inferred facts or assistant-written evidence. */
export function citeConversationQuotes(markdown: string, source?: string) {
  const quotes = new Map<string, string>();
  if (!source || !/["“]/.test(markdown)) return { markdown, quotes };
  const insertions: { offset: number; link: string }[] = [];
  const excluded: { start: number; end: number }[] = [];
  const tree = parser.parse(markdown);
  const exclude = (node: TextNode) => {
    if (
      ["link", "linkReference", "image", "code", "inlineCode", "html"].includes(
        node.type
      )
    ) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined)
        excluded.push({ start, end });
    }
    node.children?.forEach(exclude);
  };
  exclude(tree);
  const visit = (node: TextNode) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (
      ["paragraph", "heading"].includes(node.type) &&
      start !== undefined &&
      end !== undefined
    ) {
      const text = markdown.slice(start, end);
      for (const match of text.matchAll(/"([^"\n]+)"|“([^”\n]+)”/g)) {
        const quoteStart = start + match.index;
        const quoteEnd = quoteStart + match[0].length;
        if (
          excluded.some(
            (range) => range.start < quoteEnd && range.end > quoteStart
          )
        )
          continue;
        const quote = visibleQuote(parser.parse(match[1] ?? match[2] ?? ""));
        if (!quote || quote.length < 12 || !source.includes(quote)) continue;
        const href = `#conversation-fact-${quotes.size}`;
        quotes.set(href, quote);
        insertions.push({
          offset: start + match.index + match[0].length,
          link: ` [Conversation](${href})`,
        });
      }
      return;
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  for (const { offset, link } of insertions.reverse()) {
    markdown = markdown.slice(0, offset) + link + markdown.slice(offset);
  }
  return { markdown, quotes };
}

/** Sources follow only the selected branch, ending at the current reply. */
export function conversationSources(
  messages: readonly { type: string; message: string }[]
) {
  let source = "";
  return messages.map((message) => {
    if (message.type === "user")
      source += `${source ? "\n\n" : ""}${message.message}`;
    return source;
  });
}
