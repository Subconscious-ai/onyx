import { isHostAuthenticatedWorkspace } from "@/lib/causl/host-auth";

/**
 * Trigger a browser file download.
 *
 * Supports two modes:
 *  1. **From content** — pass `content` (string) and optional `mimeType`.
 *     A Blob is created, downloaded, and the object URL is revoked.
 *  2. **From URL** — pass `url` (string). The browser navigates to the
 *     URL with the `download` attribute set.
 */
export function downloadFile(
  filename: string,
  opts: { content: string; mimeType?: string } | { url: string }
): void {
  if ("url" in opts && isHostAuthenticatedWorkspace()) {
    const url = new URL(opts.url, window.location.origin);
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/api/chat/file/")
    ) {
      void fetch(url)
        .then(async (response) => {
          if (!response.ok) throw new Error("File is unavailable");
          const blobUrl = URL.createObjectURL(await response.blob());
          downloadFile(filename, { url: blobUrl });
          setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
        })
        .catch((error) => console.error("Failed to download file", error));
      return;
    }
  }
  const a = document.createElement("a");

  if ("content" in opts) {
    const blob = new Blob([opts.content], {
      type: opts.mimeType ?? "text/plain",
    });
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } else {
    a.href = opts.url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
