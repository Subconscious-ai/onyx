import { fireEvent, render, screen } from "@tests/setup/test-utils";
import BecaActions from "./BecaActions";

Element.prototype.scrollIntoView = jest.fn();

it("filters capabilities and prepares an experiment request without launching an experiment", () => {
  const onDraft = jest.fn();
  render(<BecaActions onDraft={onDraft} />);
  expect(
    screen.queryByPlaceholderText("Find an action")
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.change(screen.getByPlaceholderText("Find an action"), {
    target: { value: "design" },
  });
  expect(screen.queryByText("Research the market")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Design an experiment/ }));
  expect(onDraft).toHaveBeenCalledTimes(1);
  expect(onDraft.mock.calls[0][0]).toContain("Do not start an experiment");
  expect(
    screen.queryByPlaceholderText("Find an action")
  ).not.toBeInTheDocument();
});
