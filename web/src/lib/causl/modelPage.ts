export class ModelPageCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelPageCaptureError";
  }
}

/** Models bridge v1. Context is captured at dispatch and never stored in the native binding. */
export function captureModelPage(
  parentOrigin: string,
  nonce: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new ModelPageCaptureError("Models context unavailable"));
    }, 5000);
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
    };
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        event.origin !== parentOrigin ||
        event.data?.nonce !== nonce ||
        event.data?.requestId !== requestId ||
        event.data?.kind !== "models:snapshot"
      )
        return;
      cleanup();
      if (event.data.error) {
        reject(
          new ModelPageCaptureError(String(event.data.error).slice(0, 200))
        );
        return;
      }
      if (
        typeof event.data.snapshot !== "string" ||
        new TextEncoder().encode(event.data.snapshot).length > 64000
      )
        reject(new ModelPageCaptureError("Models context too large"));
      else resolve(event.data.snapshot);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage(
      { kind: "models:capture", nonce, requestId },
      parentOrigin
    );
  });
}
