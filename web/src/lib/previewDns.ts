import { isIP, type LookupFunction } from "node:net";

type DnsReply = {
  Status: number;
  Answer?: { name: string; type: number; TTL: number; data: string }[];
};

// Only public preview DNS is cached. Conversation requests never enter the cache.
export function createPreviewLookup(hostname: string): LookupFunction {
  let pending: Promise<string[]> | null = null;
  let expires = 0;

  function addresses(): Promise<string[]> {
    if (pending && Date.now() < expires) return pending;
    expires = Infinity;
    pending = (async () => {
      const url = new URL("https://dns.google/resolve");
      url.searchParams.set("name", hostname);
      url.searchParams.set("type", "A");
      const response = await fetch(url, {
        credentials: "omit",
        signal: AbortSignal.timeout(2500),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Preview public DNS unavailable");
      const reply: DnsReply = await response.json();
      const records = (reply.Answer ?? []).filter(
        (record) =>
          record.type === 1 &&
          record.name.replace(/\.$/, "") === hostname &&
          isIP(record.data) === 4
      );
      if (reply.Status !== 0 || records.length === 0) {
        throw new Error("Preview public DNS has no backend address");
      }
      const ttl = Math.max(
        0,
        Math.min(300, ...records.map((record) => record.TTL))
      );
      expires = Date.now() + ttl * 1000;
      return records.map((record) => record.data);
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript rejections can contain non-Error values.
    })().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  }

  return (requestedHost, options, callback) => {
    if (requestedHost !== hostname) {
      callback(new Error("Unexpected preview DNS host"), [], 4);
      return;
    }
    void addresses().then(
      (records) => {
        if (options.all) {
          callback(
            null,
            records.map((address) => ({ address, family: 4 }))
          );
        } else {
          callback(null, records[0]!, 4);
        }
      },
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Reject values require narrowing before a Node callback.
      (error: unknown) =>
        callback(
          error instanceof Error
            ? error
            : new Error("Preview public DNS failed"),
          [],
          4
        )
    );
  };
}
