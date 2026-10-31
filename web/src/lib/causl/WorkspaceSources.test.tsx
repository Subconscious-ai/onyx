import { ValidSources } from "@/lib/types";
import React from "react";
import { render, screen, setupUser } from "@tests/setup/test-utils";
import {
  WorkspaceCitation,
  WorkspaceSources,
  sourceWebUrl,
} from "@/lib/causl/WorkspaceSources";
import type { SourceInfo } from "@/refresh-components/buttons/source-tag/SourceTagDetailsCard";

const source: SourceInfo = {
  id: "world-bank",
  title: "World Bank population",
  description: "Population estimates and projections.",
  sourceType: ValidSources.Web,
  sourceUrl: "https://data.worldbank.org/indicator/SP.POP.TOTL?locations=US",
};

test("opens a citation preview by keyboard, preserves the full URL, and closes with Escape", async () => {
  const user = setupUser();
  render(<WorkspaceCitation source={source} label="1" />);
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByText(source.title)).toBeVisible();
  expect(screen.getByText(source.description!)).toBeVisible();
  expect(screen.getByRole("link")).toHaveAttribute("href", source.sourceUrl);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

test("counts distinct real sources and exposes every source, including native files", async () => {
  const user = setupUser();
  const onOpen = jest.fn();
  const sources = Array.from({ length: 6 }, (_, index) => ({
    ...source,
    id: String(index),
    title: `Document ${index}`,
    sourceUrl: undefined,
  }));
  render(
    <WorkspaceSources sources={[...sources, sources[0]!]} onOpen={onOpen} />
  );
  await user.click(screen.getByRole("button", { name: "6 sources" }));
  await user.click(
    screen.getByRole("button", { name: "Preview source: Document 5" })
  );
  await user.click(screen.getByRole("button", { name: "Open source" }));
  expect(onOpen).toHaveBeenCalledWith("5");
});

test("does not invent source progress or turn unsafe protocols into links", async () => {
  const user = setupUser();
  const { rerender } = render(
    <WorkspaceSources sources={[]} onOpen={jest.fn()} />
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(
    <WorkspaceCitation
      source={{ ...source, sourceUrl: "javascript:alert(1)" }}
      label="1"
    />
  );
  await user.click(screen.getByRole("button"));
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(sourceWebUrl("/internal/file")).toBeUndefined();
});
