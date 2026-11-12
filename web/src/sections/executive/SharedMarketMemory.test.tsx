import { fireEvent, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import SharedMarketMemory from "./SharedMarketMemory";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { quote: string }) =>
    values?.quote ? `Source: ${values.quote}` : key,
}));

it("shows a fresh Postgres fact and replaces its old view after a saved correction", async () => {
  const snapshot = (definition: string) => ({
    digest: "a".repeat(64),
    library: {
      nodes: [
        {
          id: "product_1",
          type: "offering",
          properties: { name: "Annual plan", definition },
          evidence: [{ reviewedStatement: `${definition}.` }],
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
  fireEvent.click(screen.getByText("savedMarketFacts"));
  fireEvent.click(
    screen.getByRole("button", { name: "factCitationConversation" })
  );
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "Sold through channel partners."
  );
});
