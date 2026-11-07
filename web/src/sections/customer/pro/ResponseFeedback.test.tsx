import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";
import ResponseFeedback from "@/sections/customer/pro/ResponseFeedback";

test("failed negative feedback keeps the editable reason, retries, and returns focus after success", async () => {
  const user = userEvent.setup();
  const save = jest
    .fn()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResponseFeedback onFeedback={save} copyAction={<button>Copy</button>}>
        <button>Retry</button>
      </ResponseFeedback>
    </NextIntlClientProvider>
  );
  await user.click(screen.getByTestId("AgentMessage/dislike-button"));
  const reason = screen.getByRole("textbox");
  expect(reason).toHaveFocus();
  await user.type(reason, "The target needs a source.");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  expect(save).toHaveBeenLastCalledWith(
    "dislike",
    "The target needs a source."
  );
  expect(reason).toHaveValue("The target needs a source.");
  await user.type(reason, " Use the saved brief.");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() =>
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  );
  expect(save).toHaveBeenLastCalledWith(
    "dislike",
    "The target needs a source. Use the saved brief."
  );
  await waitFor(() =>
    expect(screen.getByTestId("AgentMessage/dislike-button")).toHaveFocus()
  );
  expect(screen.getByRole("button", { name: "Copy" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("pending feedback prevents duplicate writes and Escape preserves an unsent draft", async () => {
  const user = userEvent.setup();
  let finish!: (success: boolean) => void;
  const save = jest.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
  );
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResponseFeedback onFeedback={save} copyAction={<button>Copy</button>} />
    </NextIntlClientProvider>
  );
  await user.click(screen.getByTestId("AgentMessage/dislike-button"));
  await user.type(screen.getByRole("textbox"), "Keep this note.");
  await user.keyboard("{Escape}");
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByTestId("AgentMessage/dislike-button"));
  expect(screen.getByRole("textbox")).toHaveValue("Keep this note.");
  await user.click(screen.getByRole("button", { name: "Submit" }));
  const pending = screen.getByRole("button", {
    name: "Submitting...",
  });
  expect(pending).toBeDisabled();
  await user.click(pending);
  expect(save).toHaveBeenCalledTimes(1);
  finish(false);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled()
  );
});
