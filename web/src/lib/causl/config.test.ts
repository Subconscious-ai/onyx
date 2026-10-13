import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { causlEmbedOrigins } from "./config";

describe("workspace frame protection", () => {
  const original = process.env.CAUSL_KB_EMBED_ORIGINS;
  afterEach(() => {
    if (original === undefined) delete process.env.CAUSL_KB_EMBED_ORIGINS;
    else process.env.CAUSL_KB_EMBED_ORIGINS = original;
  });
  test.each([
    "*",
    "https://*.kb.example",
    "https://kb.example/path",
    "https://kb.example/",
    "https://user:secret@kb.example",
    "http://kb.example",
    "https://kb.example,https://other.example/path",
  ])("fails closed for invalid origins: %s", (setting) => {
    process.env.CAUSL_KB_EMBED_ORIGINS = setting;
    expect(causlEmbedOrigins()).toEqual([]);
  });
  test("allows exact origins on the embed route and preserves other routes", async () => {
    process.env.CAUSL_KB_EMBED_ORIGINS =
      "https://kb.example,http://localhost:3010";
    const embed = await proxy(new NextRequest("https://onyx.example/causl"));
    expect(embed.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'self' https://kb.example http://localhost:3010;"
    );
    for (const route of ["/app", "/auth/login", "/admin", "/causl/other"]) {
      const result = await proxy(
        new NextRequest(`https://onyx.example${route}`)
      );
      expect(result.headers.get("content-security-policy")).not.toContain(
        "https://kb.example"
      );
    }
  });
});
