import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FactCitation from "@/sections/executive/FactCitation";
import AIInlineCitation from "@/sections/customer/AIInlineCitation";

jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

it("preserves native indexed-document opening through the shared preview", async () => {
  const openDocument = jest.fn();
  render(
    <AIInlineCitation
      source={{ title: "Annual report", description: "Indexed document" }}
      label="Report"
      onOpen={openDocument}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Annual report" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "Indexed document"
  );
  fireEvent.click(screen.getByRole("button", { name: "Report" }));
  expect(openDocument).toHaveBeenCalledTimes(1);
});

it("keeps a private quote intact without inventing a public source link", async () => {
  const quote = "Only registered charities pay 12 USD per member monthly.";
  render(<FactCitation quote={quote} />);
  const citation = screen.getByRole("button", {
    name: "factCitationConversation",
  });
  fireEvent.keyDown(citation, { key: "Enter" });
  const preview = await screen.findByRole("dialog");
  expect(preview).toHaveTextContent(quote);
  expect(
    screen.queryByRole("button", { name: "originalSource" })
  ).not.toBeInTheDocument();
  expect(preview.querySelector("blockquote")).not.toHaveAttribute(
    "data-max-lines"
  );
  fireEvent.keyDown(preview, { key: "Escape" });
  await waitFor(() => expect(citation).toHaveFocus());
});

it.each([undefined, "javascript:alert(1)", "https://user:secret@example.com"])(
  "marks missing or unsafe evidence instead of creating a citation: %s",
  (url) => {
    render(<FactCitation url={url} />);
    expect(screen.getByText("factCitationUnavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  }
);

it("opens the original source with the native citation action", async () => {
  const open = jest.spyOn(window, "open").mockImplementation(() => null);
  render(<FactCitation url="https://example.com/pricing" />);
  fireEvent.click(screen.getByRole("button", { name: "example.com" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "originalSource" })
  );
  expect(open).toHaveBeenCalledWith(
    "https://example.com/pricing",
    "_blank",
    "noopener,noreferrer"
  );
  open.mockRestore();
});
