import React, { useEffect } from "react";
import {
  act,
  deferred,
  render,
  screen,
  waitFor,
} from "@tests/setup/test-utils";
import HostAuthShell from "./HostAuthShell";
import { createHostTokenProvider } from "./host-auth";

let mockHosted = true;
jest.mock("next/navigation", () => ({
  usePathname: () => "/causl",
  useSearchParams: () =>
    new URLSearchParams(
      `parentOrigin=https%3A%2F%2Fkb.example&bridge=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa${mockHosted ? "&hostAuth=1" : ""}`
    ),
}));
jest.mock("./host-auth", () => ({
  ...jest.requireActual("./host-auth"),
  createHostTokenProvider: jest.fn(),
}));

const allowedOrigins = ["https://kb.example"];
let parentFrame: HTMLIFrameElement;
let parentDescriptor: PropertyDescriptor | undefined;
let originalFetch: typeof window.fetch;
let token: ReturnType<typeof deferred<string>>;
let underlying: jest.Mock;
let dispose: jest.Mock;

function Consumer() {
  useEffect(() => {
    void window.fetch("/api/user/notifications");
  }, []);
  return <p>Authenticated child</p>;
}

beforeEach(() => {
  mockHosted = true;
  token = deferred<string>();
  dispose = jest.fn();
  jest.mocked(createHostTokenProvider).mockReturnValue({
    token: () => token.promise,
    dispose,
  });
  originalFetch = window.fetch;
  underlying = jest.fn().mockResolvedValue(new Response("{}"));
  window.fetch = underlying;
  parentFrame = document.createElement("iframe");
  document.body.appendChild(parentFrame);
  parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: parentFrame.contentWindow,
  });
});
afterEach(() => {
  window.fetch = originalFetch;
  if (parentDescriptor)
    Object.defineProperty(window, "parent", parentDescriptor);
  parentFrame.remove();
  jest.clearAllMocks();
});

test("no authenticated child mounts before the host identity check passes", async () => {
  const view = render(
    <HostAuthShell allowedOrigins={allowedOrigins}>
      <Consumer />
    </HostAuthShell>
  );
  expect(screen.queryByText("Authenticated child")).not.toBeInTheDocument();
  expect(underlying).not.toHaveBeenCalled();
  await act(async () => token.resolve("host-token"));
  await screen.findByText("Authenticated child");
  await waitFor(() => expect(underlying).toHaveBeenCalledTimes(2));
  for (const [, options] of underlying.mock.calls) {
    expect(options.credentials).toBe("omit");
    expect(options.cache).toBe("no-store");
    expect(new Headers(options.headers).get("Authorization")).toBe(
      "Bearer host-token"
    );
  }
  view.unmount();
  expect(dispose).toHaveBeenCalled();
  expect(window.fetch).toBe(underlying);
});

test("an invalid host token never mounts cookie-authenticated consumers", async () => {
  underlying.mockResolvedValue(new Response("{}", { status: 401 }));
  render(
    <HostAuthShell allowedOrigins={allowedOrigins}>
      <Consumer />
    </HostAuthShell>
  );
  await act(async () => token.resolve("invalid-token"));
  await screen.findByText(
    "The workspace context is unavailable. Your saved conversation is retained."
  );
  expect(screen.queryByText("Authenticated child")).not.toBeInTheDocument();
  expect(underlying).toHaveBeenCalledTimes(1);
});

test("an unapproved parent cannot start a host handshake", async () => {
  render(
    <HostAuthShell allowedOrigins={[]}>
      <Consumer />
    </HostAuthShell>
  );
  await screen.findByText(
    "The workspace context is unavailable. Your saved conversation is retained."
  );
  expect(createHostTokenProvider).not.toHaveBeenCalled();
  expect(underlying).not.toHaveBeenCalled();
});

test("standalone Onyx keeps its native authentication path", async () => {
  mockHosted = false;
  render(
    <HostAuthShell allowedOrigins={allowedOrigins}>
      <Consumer />
    </HostAuthShell>
  );
  await screen.findByText("Authenticated child");
  expect(createHostTokenProvider).not.toHaveBeenCalled();
  expect(underlying).toHaveBeenCalledWith("/api/user/notifications");
});
