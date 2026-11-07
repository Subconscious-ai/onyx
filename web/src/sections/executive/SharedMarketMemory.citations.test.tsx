import { fireEvent, render, screen, within } from "@testing-library/react";
import { SWRConfig } from "swr";
import SharedMarketMemory from "@/sections/executive/SharedMarketMemory";

jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

it("opens the exact supporting quote beside a saved fact using the chat citation preview", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      digest: "saved-fact",
      library: {
        nodes: [
          {
            id: "plan_1",
            type: "offering",
            properties: {
              name: "Team",
              definition: "12 USD per member monthly, for registered charities",
            },
            evidence: [
              {
                id: "evidence_1",
                sourceType: "human_edit",
                reviewedStatement:
                  "Team costs 12 USD per member monthly, only for registered charities.",
                sourceUrl: "https://acme.example/pricing",
              },
            ],
          },
        ],
        omitted: 0,
        truncated: false,
      },
    }),
  });
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <SharedMarketMemory chatId="chat_a" revision={1} />
    </SWRConfig>
  );
  fireEvent.click(screen.getByText("savedMarketFacts"));
  const fact = await screen.findByText(
    "12 USD per member monthly, for registered charities"
  );
  const citation = within(fact.parentElement!).getByRole("button", {
    name: "acme.example",
  });
  fireEvent.click(citation);
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "Team costs 12 USD per member monthly, only for registered charities."
  );
  expect(
    screen.getByRole("button", { name: "originalSource" })
  ).toBeInTheDocument();
});
