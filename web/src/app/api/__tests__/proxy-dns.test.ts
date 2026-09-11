import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/[...path]/route";

jest.mock("@/lib/constants", () => ({
  INTERNAL_URL: "https://preview-backend.example",
  SERVER_SIDE_ONLY__AUTH_COOKIE_NAME: "fastapiusersauth",
}));

const params = { params: Promise.resolve({ path: ["chat", "saved"] }) };
const dnsError = () =>
  new TypeError("fetch failed", {
    cause: Object.assign(new Error("DNS unavailable"), { code: "ENOTFOUND" }),
  });

describe("preview proxy DNS recovery", () => {
  const originalOverride = process.env.OVERRIDE_API_PRODUCTION;
  beforeEach(() => {
    process.env.OVERRIDE_API_PRODUCTION = "true";
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env.OVERRIDE_API_PRODUCTION = originalOverride;
    jest.restoreAllMocks();
  });

  test("HTTPS backend routing uses the backend host while retaining native session cookies", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(Response.json({ saved: true }));
    await GET(
      new NextRequest("https://frontend.example/api/chat/saved", {
        headers: { host: "frontend.example", cookie: "session=existing" },
      }),
      params
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.has("host")).toBe(false);
    expect(headers.get("cookie")).toBe("session=existing");
  });

  test("ordinary backends retain native fetch without preview DNS overrides", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(Response.json({ messages: ["saved answer"] }));
    const response = await GET(
      new NextRequest("http://localhost/api/chat/saved"),
      params
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ messages: ["saved answer"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ dispatcher: undefined })
    );
  });

  test("DNS failure surfaces without replaying a request", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockRejectedValue(dnsError());
    const response = await GET(
      new NextRequest("http://localhost/api/chat/saved"),
      params
    );
    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a submitted interview answer is never replayed by the proxy", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockRejectedValue(dnsError());
    const response = await POST(
      new NextRequest("http://localhost/api/chat/send", {
        method: "POST",
        body: "executive answer",
      }),
      params
    );
    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("connection failures after DNS resolution are not retried", async () => {
    const error = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connection reset"), {
        code: "ECONNRESET",
      }),
    });
    const fetchMock = jest.spyOn(global, "fetch").mockRejectedValue(error);
    const response = await GET(
      new NextRequest("http://localhost/api/chat/saved"),
      params
    );
    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("native authentication denials pass through without retries", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        Response.json({ detail: "Unauthorized" }, { status: 401 })
      );
    const response = await GET(
      new NextRequest("http://localhost/api/chat/saved"),
      params
    );
    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("answer streams and session cookies pass through without buffering", async () => {
    const upstream = new Response("data: answer\n\n", {
      headers: {
        "Content-Type": "text/event-stream",
        "Set-Cookie": "session=test; HttpOnly",
      },
    });
    jest.spyOn(global, "fetch").mockResolvedValue(upstream);
    const response = await POST(
      new NextRequest("http://localhost/api/chat/send", {
        method: "POST",
        body: "executive answer",
      }),
      params
    );
    expect(response.body).toBe(upstream.body);
    expect(response.headers.get("set-cookie")).toBe("session=test; HttpOnly");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(await response.text()).toBe("data: answer\n\n");
  });
});
