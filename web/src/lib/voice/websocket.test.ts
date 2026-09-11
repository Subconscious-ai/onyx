import { voiceWebSocketUrl } from "./websocket";

describe("native voice across separate frontend and backend origins", () => {
  it("keeps the deployed backend prefix and encodes the single-use token", () => {
    expect(
      voiceWebSocketUrl(
        "transcribe",
        "a+b/c=",
        "wss://api.example.com/burn2/",
        "https://app.example.com"
      )
    ).toBe(
      "wss://api.example.com/burn2/voice/transcribe/stream?token=a%2Bb%2Fc%3D"
    );
  });
  it("keeps same-origin native deployments working without a separate endpoint", () => {
    expect(
      voiceWebSocketUrl(
        "synthesize",
        "token",
        undefined,
        "https://app.example.com"
      )
    ).toBe("wss://app.example.com/api/voice/synthesize/stream?token=token");
  });
  it("rejects insecure remote endpoints before sending a token", () => {
    expect(() =>
      voiceWebSocketUrl(
        "transcribe",
        "token",
        "ws://api.example.com",
        "https://app.example.com"
      )
    ).toThrow("secure");
  });
  it("rejects credentials, query strings, and fragments in endpoint configuration", () => {
    for (const url of [
      "wss://user:pass@api.example.com",
      "wss://api.example.com?x=1",
      "wss://api.example.com/#x",
    ]) {
      expect(() =>
        voiceWebSocketUrl("synthesize", "token", url, "https://app.example.com")
      ).toThrow();
    }
  });
});
