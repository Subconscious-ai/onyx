import React from "react";
import { render, screen, setupUser } from "@tests/setup/test-utils";
import { MemoizedLink } from "@/app/app/message/MemoizedTextComponents";
import { WorkspaceAiUx } from "@/lib/causl/WorkspaceAiUx";
import { ValidSources } from "@/lib/types";
import type { LoadedOnyxDocument } from "@/lib/search/interfaces";

test("native citation previews retain the full source URL and return keyboard focus", async () => {
  const user = setupUser();
  const document = {
    icon: () => null,
    document_id: "saved-evidence",
    semantic_identifier: "Saved evidence",
    link: "https://data.worldbank.org/indicator/SP.POP.TOTL?locations=US",
    source_type: ValidSources.Web,
    blurb: "Population estimates and projections.",
    boost: 1,
    hidden: false,
    score: 1,
    chunk_ind: 0,
    match_highlights: [],
    metadata: {},
    updated_at: null,
    is_internet: true,
  } satisfies LoadedOnyxDocument;
  render(<MemoizedLink document={document}>[1]</MemoizedLink>);
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toHaveTextContent(document.link);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: document.semantic_identifier })
  ).toHaveFocus();
});

test("preserves formatted Markdown labels in source chips and previews", async () => {
  const user = setupUser();
  render(
    <WorkspaceAiUx enabled>
      <MemoizedLink href="https://data.worldbank.org/indicator/SP.POP.TOTL">
        <strong>World Bank</strong>
        {" population"}
      </MemoizedLink>
    </WorkspaceAiUx>
  );
  expect(
    screen.getByRole("button", {
      name: "Preview source: World Bank population",
    })
  ).toHaveTextContent("World Bank population");
  await user.click(
    screen.getByRole("button", {
      name: "Preview source: World Bank population",
    })
  );
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "https://data.worldbank.org/indicator/SP.POP.TOTL"
  );
  expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
});

test("keeps ordinary native chat links as links outside Colossus", () => {
  render(
    <MemoizedLink href="https://data.worldbank.org">
      <strong>World Bank</strong>
    </MemoizedLink>
  );
  expect(screen.getByRole("link", { name: "World Bank" })).toHaveAttribute(
    "href",
    "https://data.worldbank.org"
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
