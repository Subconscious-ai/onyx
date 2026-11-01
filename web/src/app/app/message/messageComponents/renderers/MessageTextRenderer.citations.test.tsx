import { fireEvent, render, screen } from "@testing-library/react";
import { MessageTextRenderer } from "./MessageTextRenderer";
import { RenderType, type FullChatState } from "../interfaces";
import { conversationSources } from "@/lib/executive/conversationCitations";
import { PacketType } from "@/app/app/services/streamingModels";

jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
jest.mock("@/hooks/useHighlightLanguages", () => ({
  useHighlightLanguages: () => null,
}));
jest.mock("@/hooks/useTypewriter", () => ({
  useTypewriter: (content: string) => ({
    displayed: content,
    isDraining: false,
  }),
}));
jest.mock("@/hooks/useSmoothStreaming", () => ({
  useSmoothStreaming: () => ({ enabled: false }),
}));
jest.mock("@/providers/VoiceModeProvider", () => ({
  useVoiceMode: () => ({ autoPlayback: false }),
}));
jest.mock("@/app/app/services/packetUtils", () => ({
  isFinalAnswerComplete: () => true,
}));
jest.mock("@/app/app/message/MemoizedTextComponents", () => ({
  MemoizedParagraph: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  MemoizedAnchor: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
jest.mock("../markdownUtils", () => ({
  processContent: (text: string) => text,
  ScrollableTable: () => null,
}));
jest.mock("@/app/app/message/CodeBlock", () => ({
  CodeBlock: ({ children }: { children: React.ReactNode }) => (
    <code>{children}</code>
  ),
}));
jest.mock("@/app/app/components/files/images/InMessageImage", () => ({
  InMessageImage: () => null,
}));
jest.mock("@/lib/utils", () => ({ transformLinkUri: (uri: string) => uri }));

const statement = "Each mechanic completes 8 repairs per week.";
const state = {
  agent: { id: 5, name: "Executive interview" },
  conversationSource: `Acorn has 12 mechanics. ${statement}`,
} as FullChatState;

function summary(content: string, chatState = state) {
  return render(
    <MessageTextRenderer
      packets={[
        {
          placement: { turn_index: 0 },
          obj: { type: PacketType.MESSAGE_DELTA, content },
        },
      ]}
      state={chatState}
      onComplete={() => {}}
      renderType={RenderType.FULL}
      animate={false}
      stopPacketSeen
    >
      {(results) => (
        <>
          {results.map((result, index) => (
            <div key={index}>{result.content}</div>
          ))}
        </>
      )}
    </MessageTextRenderer>
  );
}

it("adds the shared citation preview beside a verbatim fact in the actual chat summary", async () => {
  summary(`Capacity: "${statement}"`);
  fireEvent.click(
    screen.getByRole("button", { name: "factCitationConversation" })
  );
  const preview = await screen.findByRole("dialog");
  expect(preview.querySelector("blockquote")).toHaveTextContent(statement);
  expect(screen.getByText(`Capacity: "${statement}"`)).toBeInTheDocument();
});

it("does not invent citations for unsupported claims, code, or linked quotations", () => {
  summary(
    `Claim: "Each mechanic completes 80 repairs per week."\n\n\`"${statement}"\`\n\n["${statement}"](https://example.com)`
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "https://example.com"
  );
});

it("leaves regular assistant messages and incomplete streaming quotes unchanged", () => {
  const { unmount } = summary(`"${statement}"`, {
    ...state,
    agent: { ...state.agent, name: "Assistant" },
  });
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  unmount();
  summary(`Capacity: "Each mechanic completes 8 repairs`);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("cites earlier user testimony while excluding later and assistant-written claims", async () => {
  const sources = conversationSources([
    { type: "user", message: statement },
    { type: "assistant", message: "Invented revenue is $800 per repair." },
    { type: "user", message: "Summarize the known facts." },
    { type: "assistant", message: "summary" },
    { type: "user", message: "Later testimony is not available yet." },
  ]);
  summary(
    `Capacity: "${statement}" Revenue: "Invented revenue is $800 per repair." Later: "Later testimony is not available yet."`,
    {
      ...state,
      conversationSource: sources[3],
    }
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button"));
  expect(
    (await screen.findByRole("dialog")).querySelector("blockquote")
  ).toHaveTextContent(statement);
});
