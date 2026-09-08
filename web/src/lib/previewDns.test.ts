import { createPreviewLookup } from "@/lib/previewDns";
import type { LookupFunction } from "node:net";

const hostname = "preview.example.ts.net";
function resolve(lookup: LookupFunction, host = hostname): Promise<unknown> {
  return new Promise((accept, reject) => {
    lookup(host, { all: true }, (error, addresses) => {
      if (error) reject(error);
      else accept(addresses);
    });
  });
}
const answer = () =>
  Response.json({
    Status: 0,
    Answer: [
      { name: hostname + ".", type: 1, TTL: 60, data: "209.177.145.137" },
    ],
  });

describe("preview public DNS", () => {
  afterEach(() => jest.restoreAllMocks());

  test("parallel authenticated page reads share one anonymous DNS query", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async () => answer());
    const lookup = createPreviewLookup(hostname);
    const result = await Promise.all([
      resolve(lookup),
      resolve(lookup),
      resolve(lookup),
    ]);
    expect(result[0]).toEqual([{ address: "209.177.145.137", family: 4 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://dns.google/resolve?name=preview.example.ts.net&type=A"
    );
    expect(options?.headers).toBeUndefined();
    expect(options?.credentials).toBe("omit");
    await resolve(lookup);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a DNS failure cannot become a cached empty backend address", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(Response.json({ Status: 3 }))
      .mockImplementation(async () => answer());
    const lookup = createPreviewLookup(hostname);
    await expect(resolve(lookup)).rejects.toThrow("public DNS");
    await expect(resolve(lookup)).resolves.toEqual([
      { address: "209.177.145.137", family: 4 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("cached addresses expire with the public record TTL", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1000);
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async () => answer());
    const lookup = createPreviewLookup(hostname);
    await resolve(lookup);
    now.mockReturnValue(61001);
    await resolve(lookup);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("the preview dispatcher cannot resolve a different host", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    await expect(
      resolve(createPreviewLookup(hostname), "unrelated.example")
    ).rejects.toThrow("host");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
