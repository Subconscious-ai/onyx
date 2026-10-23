import { render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import SharedMarketMemory from "./SharedMarketMemory";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { quote: string }) =>
    values?.quote ? `Source: ${values.quote}` : key,
}));
jest.mock("@opal/components", () => ({
  Text: ({
    as: Tag = "span",
    children,
  }: {
    as?: React.ElementType;
    children?: React.ReactNode;
  }) => <Tag>{children}</Tag>,
  Button: ({
    href,
    children,
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href}>{children}</a>
  ),
}));

it("reads saved workspace sources before a chat exists", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      digest: "c".repeat(64),
      library: {
        nodes: [
          {
            id: "prepared-source",
            type: "message",
            properties: { text: "Saved source before chat" },
            evidence: [],
          },
        ],
        omitted: 0,
        truncated: false,
      },
    }),
  });
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SharedMarketMemory chatId={null} revision="prepared-source-receipt" />
    </SWRConfig>
  );
  expect(
    await screen.findByText("Saved source before chat")
  ).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith("/api/chat/causl-memory");
});

it("shows saved provider claim text and public sources without exposing private locators", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      digest: "b".repeat(64),
      library: {
        nodes: [
          {
            id: "message:provider",
            type: "message",
            properties: {
              role: "pdl_claim",
              text: "Unaccepted PDL profile claim: Acme builds scheduling tools.",
            },
            evidence: [
              {
                sourceType: "pdl_claim",
                sourceRef: "onyx-provider-claim://private-chat/profile",
              },
            ],
          },
          {
            id: "message:research",
            type: "message",
            properties: {
              role: "research_claim",
              text: "Public buyers use paid pilots.",
            },
            evidence: [
              {
                sourceType: "research_claim",
                sourceUrl: "https://example.com/research",
                sourceRef: "onyx-provider-claim://private-chat/research",
              },
              {
                sourceType: "research_claim",
                sourceUrl: "javascript:alert(1)",
              },
            ],
          },
        ],
        omitted: 0,
        truncated: false,
      },
    }),
  });
  const { container } = render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SharedMarketMemory chatId="provider-chat" revision={1} />
    </SWRConfig>
  );
  expect(
    await screen.findByText(/Acme builds scheduling tools/)
  ).toBeInTheDocument();
  expect(
    screen.getByText("Public buyers use paid pilots.")
  ).toBeInTheDocument();
  expect(screen.getByText("companyProfile.provider")).toBeInTheDocument();
  expect(screen.getAllByText("publicResearchSource").length).toBeGreaterThan(0);
  expect(screen.getByText("providerClaimNotice")).toBeInTheDocument();
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "https://example.com/research"
  );
  expect(container.textContent).not.toContain("onyx-provider-claim://");
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
});

it("shows a fresh Postgres fact and replaces its old view after a saved correction", async () => {
  const snapshot = (definition: string) => ({
    digest: "a".repeat(64),
    library: {
      nodes: [
        {
          id: "product_1",
          type: "offering",
          properties: { name: "Annual plan", definition },
          evidence: [{ reviewedStatement: "We sell directly." }],
        },
      ],
      omitted: 0,
      truncated: false,
    },
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => snapshot("Sold directly"),
  });
  const cache = new Map();
  const view = (revision: number) => (
    <SWRConfig value={{ provider: () => cache }}>
      <SharedMarketMemory chatId="chat_b" revision={revision} />
    </SWRConfig>
  );
  const result = render(view(1));
  expect(await screen.findByText("Sold directly")).toBeInTheDocument();
  expect(screen.getByText("savedMarketFacts")).toBeInTheDocument();
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => snapshot("Sold through channel partners"),
  } as Response);
  result.rerender(view(2));
  expect(
    await screen.findByText("Sold through channel partners")
  ).toBeInTheDocument();
  expect(screen.queryByText("Sold directly")).not.toBeInTheDocument();
  expect(screen.getByText("Source: We sell directly.")).toBeInTheDocument();
});
