import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("canonical hosted login", () => {
  const previousDomain = process.env.WEB_DOMAIN;

  beforeEach(() => {
    process.env.WEB_DOMAIN = "https://interview.example";
  });

  afterEach(() => {
    if (previousDomain === undefined) delete process.env.WEB_DOMAIN;
    else process.env.WEB_DOMAIN = previousDomain;
  });

  test("login reaches the callback origin before browser-only OAuth cookies are created", async () => {
    const response = await proxy(
      new NextRequest(
        "https://preview.example/auth/login?next=%2Fapp%3FagentId%3D5"
      )
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://interview.example/auth/login?next=%2Fapp%3FagentId%3D5"
    );
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors"
    );
  });

  test("forwarding headers cannot select the login destination", async () => {
    const response = await proxy(
      new NextRequest("https://preview.example/auth/login", {
        headers: { "x-forwarded-host": "attacker.example" },
      })
    );
    expect(response.headers.get("location")).toBe(
      "https://interview.example/auth/login"
    );
  });

  test.each([
    "https://interview.example/auth/login",
    "https://preview.example/api/auth/oidc/auth0/callback?code=invalid",
    "https://preview.example/api/auth/oidc/auth0/authorize",
    "https://preview.example/app",
  ])(
    "does not redirect canonical login or unrelated requests: %s",
    async (url) => {
      const response = await proxy(new NextRequest(url));
      expect(response.headers.get("location")).toBeNull();
    }
  );

  test("local development without WEB_DOMAIN remains on the local origin", async () => {
    delete process.env.WEB_DOMAIN;
    const response = await proxy(
      new NextRequest("http://localhost:3000/auth/login")
    );
    expect(response.headers.get("location")).toBeNull();
  });
});
