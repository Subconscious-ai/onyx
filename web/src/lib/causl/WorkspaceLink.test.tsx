import React from "react";
import { render, screen, setupUser } from "@tests/setup/test-utils";
import { MemoizedLink } from "@/app/app/message/MemoizedTextComponents";
import { WorkspaceAiUx } from "@/lib/causl/WorkspaceAiUx";

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
