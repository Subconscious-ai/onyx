import { render, screen } from "@testing-library/react";
import { SidebarStateProvider } from "@opal/layouts";
import AdminChrome from "@/layouts/chromes/AdminChrome";
import { Permission } from "@/lib/types";

const mockReplace = jest.fn();
const mockUseUser = jest.fn(() => ({
  adminCapabilities: [Permission.FULL_ADMIN_PANEL_ACCESS],
  isUserLoading: false,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
jest.mock("@/providers/UserProvider", () => ({
  useUser: () => mockUseUser(),
}));
jest.mock("@/lib/settings/hooks", () => ({
  useSettings: () => ({ vectorDbEnabled: true, isLoading: false }),
}));
jest.mock("@/hooks/useScreenSize", () => ({
  __esModule: true,
  default: () => ({ isMobile: false }),
}));
jest.mock("@/sections/sidebar/AdminSidebar", () => ({
  __esModule: true,
  default: () => <nav aria-label="Admin navigation" />,
}));
jest.mock("@/sections/admin/LiteModeIndexingNotice", () => ({
  __esModule: true,
  default: () => null,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseUser.mockReturnValue({
    adminCapabilities: [Permission.FULL_ADMIN_PANEL_ACCESS],
    isUserLoading: false,
  });
});

function renderAdmin() {
  return render(
    <SidebarStateProvider>
      <AdminChrome
        initialAdminCapabilities={[Permission.FULL_ADMIN_PANEL_ACCESS]}
      >
        <h1>Users</h1>
      </AdminChrome>
    </SidebarStateProvider>
  );
}

test("admin pages and body portals use the chat theme until the layout unmounts", () => {
  const { unmount } = renderAdmin();

  expect(screen.getByRole("heading", { name: "Users" })).toBeVisible();
  expect(
    screen.getByRole("navigation", { name: "Admin navigation" })
  ).toBeVisible();
  expect(document.documentElement).toHaveAttribute(
    "data-customer-design",
    "focus"
  );

  unmount();
  expect(document.documentElement).not.toHaveAttribute("data-customer-design");
});

test("the shared theme preserves the admin permission gate", () => {
  mockUseUser.mockReturnValue({
    adminCapabilities: [],
    isUserLoading: false,
  });

  renderAdmin();

  expect(
    screen.queryByRole("heading", { name: "Users" })
  ).not.toBeInTheDocument();
  expect(mockReplace).toHaveBeenCalledWith("/app");
});
