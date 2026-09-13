import { INTERNAL_URL, IS_DEV } from "@/lib/constants";

type VoiceStream = "transcribe" | "synthesize";

/** Preserve native same-origin routing unless a separate voice gateway is configured. */
export function voiceWebSocketUrl(
  stream: VoiceStream,
  token: string,
  endpoint: string | undefined,
  origin: string
): string {
  const base = new URL(endpoint || `${origin}/api`);
  if (base.username || base.password || base.search || base.hash) {
    throw new Error("Invalid voice gateway configuration");
  }
  if (base.protocol === "https:") base.protocol = "wss:";
  if (base.protocol === "http:") base.protocol = "ws:";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.protocol !== "wss:" && !(loopback && base.protocol === "ws:")) {
    throw new Error("Voice gateway requires a secure WebSocket endpoint");
  }
  base.pathname = `${base.pathname.replace(/\/$/, "")}/voice/${stream}/stream`;
  base.searchParams.set("token", token);
  return base.toString();
}

export async function getVoiceWebSocketUrl(
  stream: VoiceStream
): Promise<string> {
  const endpoint =
    process.env.NEXT_PUBLIC_VOICE_WEBSOCKET_URL ||
    (IS_DEV ? INTERNAL_URL : undefined);
  // Validate the destination before requesting a single-use native token.
  voiceWebSocketUrl(stream, "", endpoint, window.location.origin);
  const response = await fetch("/api/voice/ws-token", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to get voice authentication token");
  const { token } = await response.json();
  if (typeof token !== "string" || !token)
    throw new Error("Invalid voice authentication token");
  return voiceWebSocketUrl(stream, token, endpoint, window.location.origin);
}
