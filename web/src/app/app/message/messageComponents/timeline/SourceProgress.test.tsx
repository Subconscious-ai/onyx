import React from "react";
import { render, screen, setupUser, within } from "@tests/setup/test-utils";
import SourceProgress from "./SourceProgress";
import { ValidSources } from "@/lib/types";
import type { OnyxDocument } from "@/lib/search/interfaces";

const document: OnyxDocument = {
  document_id: "native-document",
  semantic_identifier: "Saved evidence",
  link: "",
  source_type: ValidSources.File,
  blurb: "Retained source excerpt",
  boost: 1,
  hidden: false,
  score: 1,
  chunk_ind: 0,
  match_highlights: [],
  metadata: {},
  updated_at: null,
  is_internet: false,
};

test("shows no source count before native source documents arrive", () => {
  const { container } = render(<SourceProgress documents={[]} />);
  expect(container).toBeEmptyDOMElement();
});

test("counts native documents once across chunks and opens the native file viewer", async () => {
  const onOpen = jest.fn();
  render(
    <SourceProgress
      documents={[document, { ...document, chunk_ind: 1 }]}
      onOpen={onOpen}
    />
  );
  const source = screen.getByRole("button", { name: /1 source/ });
  await setupUser().click(source);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledWith(document);
  expect(screen.queryByText("2 sources")).not.toBeInTheDocument();
});

test("previews source content on keyboard focus", async () => {
  render(<SourceProgress documents={[document]} />);
  await setupUser().tab();
  const preview = await screen.findByRole("tooltip");
  expect(preview).toHaveTextContent("Saved evidence");
  expect(preview).toHaveTextContent("Retained source excerpt");
});

test("opens the document selected in the source preview", async () => {
  const onOpen = jest.fn();
  const secondDocument = {
    ...document,
    document_id: "second-native-document",
    semantic_identifier: "Second evidence",
  };
  render(
    <SourceProgress documents={[document, secondDocument]} onOpen={onOpen} />
  );
  const user = setupUser();
  const source = screen.getByRole("button", { name: /2 sources/ });
  await user.hover(source);
  const preview = await screen.findByRole("tooltip");
  const navigation = within(preview).getAllByRole("button");
  await user.click(navigation[1]!);
  expect(preview).toHaveTextContent("Second evidence");
  await user.click(source);
  expect(onOpen).toHaveBeenCalledWith(secondDocument);
});
