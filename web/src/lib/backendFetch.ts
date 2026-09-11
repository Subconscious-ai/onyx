import { Agent } from "undici";
import { INTERNAL_URL } from "@/lib/constants";
import { createPreviewLookup } from "@/lib/previewDns";

const backend = new URL(INTERNAL_URL);
const previewDispatcher =
  process.env.VERCEL === "1" && backend.hostname.endsWith(".ts.net")
    ? new Agent({ connect: { lookup: createPreviewLookup(backend.hostname) } })
    : undefined;

export function fetchBackend(url: string | URL, options?: RequestInit) {
  const init: RequestInit & { dispatcher?: Agent } = {
    ...options,
    dispatcher:
      new URL(url).origin === backend.origin ? previewDispatcher : undefined,
  };
  if (new URL(url).origin === backend.origin && options?.headers) {
    const headers = new Headers(options.headers);
    headers.delete("host");
    init.headers = headers;
  }
  return fetch(url, init);
}
