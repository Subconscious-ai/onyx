import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse);
type TextNode = {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: TextNode[];
};

/** Cite only verbatim testimony, never inferred facts or assistant-written evidence. */
export function citeConversationQuotes(markdown: string, source?: string) {
  const quotes = new Map<string, string>();
  if (!source || !/["“]/.test(markdown)) return { markdown, quotes };
  const insertions: { offset: number; link: string }[] = [];
  const visit = (node: TextNode) => {
    if (
      ["link", "linkReference", "image", "code", "inlineCode"].includes(
        node.type
      )
    )
      return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (node.type === "text" && start !== undefined && end !== undefined) {
      const text = markdown.slice(start, end);
      for (const match of text.matchAll(/"([^"\n]+)"|“([^”\n]+)”/g)) {
        const quote = match[1] ?? match[2];
        if (!quote || quote.length < 12 || !source.includes(quote)) continue;
        const href = `#conversation-fact-${quotes.size}`;
        quotes.set(href, quote);
        insertions.push({
          offset: start + match.index + match[0].length,
          link: ` [Conversation](${href})`,
        });
      }
    }
    node.children?.forEach(visit);
  };
  visit(parser.parse(markdown));
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
