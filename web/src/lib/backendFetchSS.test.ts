import { fetchSS } from "@/lib/utilsSS";
import { getCurrentUserSS } from "@/lib/users/svcSS";
import { getAuthTypeMetadataSS } from "@/lib/auth/svcSS";
import { fetchBackend } from "@/lib/backendFetch";

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("@/lib/backendFetch", () => ({ fetchBackend: jest.fn() }), {
  virtual: true,
});
jest.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [{ name: "session", value: "test-session" }],
  }),
}));
jest.mock("@/lib/constants", () => ({
  INTERNAL_URL: "https://backend.example",
  HOST_URL: "https://frontend.example",
  NEXT_PUBLIC_CLOUD_ENABLED: false,
  SERVER_SIDE_ONLY__AUTH_COOKIE_NAME: "session",
}));

describe("server-rendered interview bootstrap uses the backend resolver", () => {
  beforeEach(() => {
    jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new TypeError("native DNS unavailable"));
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test("saved page data cannot bypass the reliable backend connection", async () => {
    jest
      .mocked(fetchBackend)
      .mockResolvedValueOnce(Response.json({ saved: true }));
    const result = await fetchSS("/chat/saved");
    expect(await result.json()).toEqual({ saved: true });
    expect(fetchBackend).toHaveBeenCalledWith(
      "https://backend.example/chat/saved",
      expect.objectContaining({
        headers: { cookie: "session=test-session" },
        cache: "no-store",
      })
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("valid sign-in survives native DNS failure during server rendering", async () => {
    jest
      .mocked(fetchBackend)
      .mockResolvedValueOnce(Response.json({ id: "signed-in-user" }));
    await expect(getCurrentUserSS()).resolves.toEqual({ id: "signed-in-user" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("login configuration uses the same backend connection as API requests", async () => {
    jest
      .mocked(fetchBackend)
      .mockResolvedValueOnce(
        Response.json({ multi_tenant: false, password_auth_enabled: true })
      );
    await expect(getAuthTypeMetadataSS()).resolves.toEqual(
      expect.objectContaining({ passwordAuthEnabled: true })
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
