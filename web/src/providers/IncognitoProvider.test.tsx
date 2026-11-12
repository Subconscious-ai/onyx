import { act, render, screen, waitFor } from "@tests/setup/test-utils";
import { IncognitoProvider, useIncognito } from "./IncognitoProvider";
import { SWR_KEYS } from "@/lib/swr-keys";

let mockPathname = "/auth/login";
let mockUser: { id: string } | null = null;

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));
jest.mock("@/providers/UserProvider", () => ({
  useUser: () => ({ user: mockUser }),
}));

function Probe() {
  const { incognitoAvailable } = useIncognito();
  return <span>{incognitoAvailable ? "available" : "unavailable"}</span>;
}

function tree() {
  return (
    <IncognitoProvider>
      <Probe />
    </IncognitoProvider>
  );
}

const originalFetch = global.fetch;
const mockFetch = jest.fn();

beforeEach(() => {
  mockUser = null;
  mockPathname = "/auth/login";
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ available: true }),
  });
  global.fetch = mockFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test("sign-in does not fetch protected availability or report an auth error", async () => {
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});
  render(tree());
  await act(async () => {});
  expect(mockFetch).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
  expect(screen.getByText("unavailable")).toBeInTheDocument();
});

test("waits for a resolved user even on a chat route", async () => {
  mockPathname = "/app";
  render(tree());
  await act(async () => {});
  expect(mockFetch).not.toHaveBeenCalled();
});

test("auth routes remain quiet while the previous user is cached", async () => {
  mockUser = { id: "local-user" };
  render(tree());
  await act(async () => {});
  expect(mockFetch).not.toHaveBeenCalled();
});

test("loads availability after sign-in and fails closed on logout", async () => {
  const { rerender } = render(tree());
  await act(async () => {});
  mockUser = { id: "local-user" };
  mockPathname = "/app";
  rerender(tree());
  await waitFor(() =>
    expect(screen.getByText("available")).toBeInTheDocument()
  );
  expect(mockFetch).toHaveBeenCalledWith(SWR_KEYS.incognitoAvailability);
  const authenticatedRequests = mockFetch.mock.calls.length;

  mockUser = null;
  mockPathname = "/auth/login";
  rerender(tree());
  await act(async () => {});
  expect(screen.getByText("unavailable")).toBeInTheDocument();
  expect(mockFetch).toHaveBeenCalledTimes(authenticatedRequests);
});

test("navigation still refreshes authenticated availability", async () => {
  mockUser = { id: "local-user" };
  mockPathname = "/app";
  const { rerender } = render(tree());
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  const initialRequests = mockFetch.mock.calls.length;
  mockPathname = "/app/agents";
  rerender(tree());
  await waitFor(() =>
    expect(mockFetch.mock.calls.length).toBeGreaterThan(initialRequests)
  );
});

test.each([403, 500])(
  "a signed-in backend failure (%s) stays visible and unavailable",
  async (status) => {
    mockUser = { id: "local-user" };
    mockPathname = "/app";
    mockFetch.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ detail: "Unavailable" }),
    });
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    render(tree());
    await waitFor(() =>
      expect(errors).toHaveBeenCalledWith(
        "Failed to load incognito availability:",
        expect.any(Error)
      )
    );
    expect(screen.getByText("unavailable")).toBeInTheDocument();
  }
);
