"use client";

import { useEffect, useState } from "react";
import { isHostAuthenticatedWorkspace } from "./host-auth";

/** Image/anchor browser requests cannot set the host bearer header themselves. */
export function useAuthenticatedFileUrl(
  url: string | null
): string | undefined {
  const hosted =
    isHostAuthenticatedWorkspace() &&
    Boolean(url?.startsWith("/api/chat/file/"));
  const [loaded, setLoaded] = useState<{ source: string; blob: string } | null>(
    null
  );
  useEffect(() => {
    if (!hosted || !url) return;
    const controller = new AbortController();
    let blobUrl: string | undefined;
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("File is unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        blobUrl = URL.createObjectURL(blob);
        setLoaded({ source: url, blob: blobUrl });
      })
      .catch(() => {
        /* Native file UI remains unavailable after a rejected session. */
      });
    return () => {
      controller.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [hosted, url]);
  if (!hosted) return url ?? undefined;
  return loaded?.source === url ? loaded.blob : undefined;
}
