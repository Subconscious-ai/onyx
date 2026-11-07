import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/i18n/messages/en.json";
import ChatSearchCommandMenu from "@/sections/sidebar/ChatSearchCommandMenu";
import { useState } from "react";

const mockOpenChat = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/lib/position/hooks", () => ({
  useAppPosition: () => ({ openChat: mockOpenChat, openProject: jest.fn() }),
}));
jest.mock("@/lib/projects/hooks", () => ({
  useProjects: () => ({ projects: [] }),
}));
jest.mock("@/lib/projects/components", () => ({
  CreateProjectModal: () => null,
}));
jest.mock("@/lib/sidebar/hooks", () => ({
  __esModule: true,
  default: function useSearch({ enabled }: { enabled: boolean }) {
    const [more, setMore] = useState(false);
    return {
      results: more
        ? [
            {
              id: "older-chat",
              label: "Older conversation",
              time: new Date().toISOString(),
            },
          ]
        : [],
      hasMore: !more,
      isLoadingMore: false,
      isSearching: false,
      sentinelRef: { current: null },
      fetchMore: () => {
        if (enabled) setMore(true);
      },
    };
  },
}));

test("initial All scope can load and reopen an older native conversation", async () => {
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChatSearchCommandMenu
        trigger={(open) => <button onClick={open}>Search</button>}
      />
    </NextIntlClientProvider>
  );
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(
    screen.getByRole("button", { name: "Load more conversations" })
  );
  await user.click(
    await screen.findByRole("option", { name: /Older conversation/ })
  );
  expect(mockOpenChat).toHaveBeenCalledWith("older-chat");
});
