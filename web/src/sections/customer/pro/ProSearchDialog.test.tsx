import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";
import ProSearchDialog from "@/sections/customer/pro/ProSearchDialog";

const select = jest.fn();
const query = jest.fn();
const loadMore = jest.fn();
function SearchExample() {
  const [open, setOpen] = useState(false);
  return (
    <ProSearchDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<button onClick={() => setOpen(true)}>Search</button>}
      items={[
        { id: "new-session", label: "New chat", kind: "action" },
        { id: "chat-retained", label: "Pricing study", kind: "chat" },
        { id: "project-5", label: "Research", kind: "project" },
      ]}
      onQueryChange={query}
      onSelect={select}
      hasMore
      isLoadingMore={false}
      onLoadMore={loadMore}
    />
  );
}

test("native message-body matches remain available, keyboard selection opens the actual conversation, and Escape returns focus", async () => {
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SearchExample />
    </NextIntlClientProvider>
  );
  await user.click(screen.getByRole("button", { name: "Search" }));
  const input = screen.getByRole("combobox");
  expect(input).toHaveFocus();
  await user.type(input, "budget");
  expect(query).toHaveBeenLastCalledWith("budget");
  expect(screen.getByRole("option", { name: /Pricing study/ })).toBeVisible();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(select).toHaveBeenCalledWith({
    item: expect.objectContaining({ id: "chat-retained" }),
  });
  await user.click(screen.getByRole("tab", { name: /Chats/ }));
  fireEvent.keyDown(input, { key: "Enter" });
  expect(select).toHaveBeenCalledTimes(2);
  expect(select).toHaveBeenCalledWith({
    item: expect.objectContaining({ id: "chat-retained" }),
  });
  await user.click(
    screen.getByRole("button", { name: "Load more conversations" })
  );
  expect(loadMore).toHaveBeenCalledTimes(1);
  expect(input).toHaveValue("budget");
  await user.click(input);
  await user.keyboard("{Escape}");
  expect(input).toHaveValue("");
  expect(screen.getByRole("dialog")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("tab", { name: /All/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Search" })).toHaveFocus()
  );
});

test("loading older conversations keeps the scrolled position until keyboard navigation changes selection", async () => {
  const user = userEvent.setup();
  function PaginatedSearch() {
    const [count, setCount] = useState(20);
    return (
      <ProSearchDialog
        open
        onOpenChange={() => {}}
        trigger={<button>Search</button>}
        items={Array.from({ length: count }, (_, index) => ({
          id: `chat-${index}`,
          label: `Conversation ${index}`,
          kind: "chat" as const,
        }))}
        hasMore
        isLoadingMore={false}
        onLoadMore={() => setCount(40)}
      />
    );
  }
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PaginatedSearch />
    </NextIntlClientProvider>
  );
  const list = screen.getByRole("listbox");
  Object.defineProperty(list, "clientHeight", { value: 100 });
  for (const [index, option] of screen.getAllByRole("option").entries()) {
    Object.defineProperty(option, "offsetTop", { value: index * 44 });
    Object.defineProperty(option, "offsetHeight", { value: 44 });
  }
  list.scrollTop = 400;
  fireEvent.scroll(list);
  await user.click(
    screen.getByRole("button", { name: "Load more conversations" })
  );
  expect(screen.getAllByRole("option")).toHaveLength(40);
  expect(list.scrollTop).toBe(400);
  await user.click(screen.getByRole("combobox"));
  await user.keyboard("{ArrowDown}");
  expect(list.scrollTop).toBe(44);
});
