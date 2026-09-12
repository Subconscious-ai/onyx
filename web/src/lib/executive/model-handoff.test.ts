/** @jest-environment jsdom */
import { createModelHandoff } from "@/lib/executive/model-handoff";

const destination = "https://causl.example/dashboard/burn-import";
let listener: ((event: MessageEvent) => void) | undefined;
let child: Window;
let opened: string;

beforeEach(() => {
  listener = undefined;
  child = {
    postMessage: jest.fn(),
    focus: jest.fn(),
    closed: false,
  } as unknown as Window;
  jest.spyOn(window, "open").mockImplementation((url) => {
    opened = String(url);
    return child;
  });
  jest.spyOn(window, "addEventListener").mockImplementation((type, handler) => {
    if (type === "message") listener = handler as (event: MessageEvent) => void;
  });
  jest.spyOn(window, "removeEventListener").mockImplementation(() => {});
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: () => "proof-nonce",
  });
});
afterEach(() => jest.restoreAllMocks());

test("forwards only bounded current-model receipts from the authenticated review window", () => {
  const onContext = jest.fn();
  const handoff = createModelHandoff({
    destination,
    onStatus: jest.fn(),
    onConnected: jest.fn(),
    onContext,
  });
  handoff.recover();
  const context = {
    version: 1,
    modelId: "model-a",
    modelName: "Acquisition",
    marketId: "market-a",
    revision: 2,
    state: "proposed",
    cells: [
      {
        id: "conversion",
        name: "Conversion",
        unit: "PERCENT",
        type: "POINT",
        expression: "0.1",
      },
    ],
    calculation: {
      engine: "guesstimate-8080fe2",
      baselineRevision: 2,
      instruction: "Try 12% conversion",
      selection: {
        metricId: "conversion",
        expression: "0.12",
        name: "Conversion 12%",
        excerpt: "12%",
      },
      analysis: {
        status: "ready",
        intervention: {
          metricName: "Conversion",
          baselineExpression: "0.1",
          expression: "0.12",
        },
        affectedMetrics: [
          {
            metricId: "conversion",
            metricName: "Conversion",
            baselineMean: 0.1,
            mean: 0.12,
            meanChange: 0.02,
          },
        ],
      },
    },
  };
  const event = {
    type: "burn-model-context",
    nonce: "proof-nonce",
    marketId: "market-a",
    revision: 2,
    context,
  };
  receive(event, "https://foreign.example");
  expect(onContext).not.toHaveBeenCalledWith(context);
  receive(event);
  expect(onContext).toHaveBeenLastCalledWith(context);
  onContext.mockClear();
  receive({
    ...event,
    revision: 1,
    context: {
      ...context,
      revision: 1,
      calculation: { ...context.calculation, baselineRevision: 1 },
    },
  });
  expect(onContext).not.toHaveBeenCalled();
  receive({
    ...event,
    marketId: "market-b",
    context: {
      ...context,
      modelId: "model-b",
      marketId: "market-b",
      cells: Array(41).fill(context.cells[0]),
    },
  });
  expect(onContext).toHaveBeenLastCalledWith(null);
  receive(event);
  receive({
    ...event,
    context: {
      ...context,
      calculation: {
        ...context.calculation,
        analysis: {
          ...context.calculation.analysis,
          affectedMetrics: [
            {
              ...context.calculation.analysis.affectedMetrics[0],
              mean: Infinity,
            },
          ],
        },
      },
    },
  });
  expect(onContext).toHaveBeenLastCalledWith(null);
  receive(event);
  receive({ ...event, context: { ...context, revision: 3 } });
  expect(onContext).toHaveBeenLastCalledWith(null);
  receive(event);
  handoff.request("Try 15% conversion");
  expect(onContext).toHaveBeenLastCalledWith(
    expect.objectContaining({
      state: "awaiting-preview",
      calculation: undefined,
    })
  );
  receive({ ...event, type: "burn-scenario-result", status: "proposed" });
  expect(onContext).toHaveBeenLastCalledWith(context);
  const saved = {
    ...context,
    state: "saved",
    revision: 3,
    savedScenario: {
      name: "Conversion 12%",
      metricId: "conversion",
      expression: "0.12",
    },
  };
  receive({
    ...event,
    type: "burn-scenario-result",
    revision: 3,
    status: "saved",
    context: saved,
  });
  expect(onContext).toHaveBeenLastCalledWith(saved);
  const rejected = { ...saved, state: "rejected", calculation: undefined };
  receive({
    ...event,
    type: "burn-scenario-result",
    revision: 3,
    status: "rejected",
    context: rejected,
  });
  expect(onContext).toHaveBeenLastCalledWith(rejected);
  const reopened = { ...saved, calculation: undefined };
  receive({ ...event, revision: 3, context: reopened });
  expect(onContext).toHaveBeenLastCalledWith(reopened);
  handoff.dispose();
  expect(onContext).toHaveBeenLastCalledWith(null);
});

function receive(
  data: unknown,
  origin = "https://causl.example",
  source: Window = child
) {
  listener?.({ data, origin, source } as MessageEvent);
}

test("transfers a brief only to the expected authenticated review window", () => {
  const handoff = createModelHandoff({
    destination,
    onStatus: jest.fn(),
    onConnected: jest.fn(),
  });
  const payload = { format: "burn/onyx-interview", chatId: "chat-a" };
  handoff.open(payload);
  expect(new URL(opened).searchParams.get("handoff")).toBe("proof-nonce");
  receive(
    { type: "burn-ready", nonce: "proof-nonce" },
    "https://foreign.example"
  );
  receive({ type: "burn-ready", nonce: "other" });
  receive(
    { type: "burn-ready", nonce: "proof-nonce" },
    "https://causl.example",
    {} as Window
  );
  expect(child.postMessage).not.toHaveBeenCalled();
  receive({ type: "burn-ready", nonce: "proof-nonce" });
  expect(child.postMessage).toHaveBeenCalledWith(
    { type: "burn-handoff", nonce: "proof-nonce", payload },
    "https://causl.example"
  );
  handoff.dispose();
});

test("previews a later executive request without another transcript or download", () => {
  const onConnected = jest.fn();
  const handoff = createModelHandoff({
    destination,
    onStatus: jest.fn(),
    onConnected,
  });
  handoff.open({ chatId: "chat-a" });
  receive({
    type: "burn-model-context",
    nonce: "proof-nonce",
    marketId: "market-a",
    revision: 1,
  });
  expect(onConnected).toHaveBeenCalledWith(true);
  handoff.request("Try a scenario with 12% conversion.");
  expect(new URL(opened).pathname).toBe("/dashboard/model-scenarios");
  expect(opened).not.toContain("12%");
  receive({ type: "burn-ready", nonce: "proof-nonce" });
  expect(child.postMessage).toHaveBeenLastCalledWith(
    {
      type: "burn-scenario-request",
      nonce: "proof-nonce",
      instruction: "Try a scenario with 12% conversion.",
    },
    "https://causl.example"
  );
  handoff.dispose();
});

test("reports popup rejection without claiming transfer or leaking a transcript", () => {
  jest.mocked(window.open).mockReturnValue(null);
  const onStatus = jest.fn();
  const handoff = createModelHandoff({
    destination,
    onStatus,
    onConnected: jest.fn(),
  });
  handoff.open({ message: "private business context" });
  expect(onStatus).toHaveBeenCalledWith("blocked");
  expect(child.postMessage).not.toHaveBeenCalled();
  handoff.dispose();
});

test("recovers an existing model without sending a stale interview or scenario", () => {
  const onConnected = jest.fn();
  const handoff = createModelHandoff({
    destination,
    onStatus: jest.fn(),
    onConnected,
  });
  handoff.recover();
  expect(new URL(opened).pathname).toBe("/dashboard/burn-import");
  expect(new URL(opened).searchParams.get("handoff")).toBe("proof-nonce");
  receive({ type: "burn-ready", nonce: "proof-nonce" });
  expect(child.postMessage).not.toHaveBeenCalled();
  expect(onConnected).not.toHaveBeenCalledWith(true);
  receive({
    type: "burn-model-context",
    nonce: "proof-nonce",
    marketId: "saved-market",
    revision: 2,
  });
  expect(onConnected).toHaveBeenCalledWith(true);
  handoff.request("Preview 15% conversion.");
  expect(new URL(opened).searchParams.get("market")).toBe("saved-market");
  handoff.dispose();
});

test("an old review heartbeat cannot consume a request before navigation finishes", () => {
  let sequence = 0;
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: () => `navigation-${++sequence}`,
  });
  const handoff = createModelHandoff({
    destination,
    onStatus: jest.fn(),
    onConnected: jest.fn(),
  });
  handoff.open({ chatId: "chat-a" });
  const previousNonce = new URL(opened).searchParams.get("handoff");
  receive({
    type: "burn-model-context",
    nonce: previousNonce,
    marketId: "market-a",
    revision: 2,
  });
  handoff.request("Try 15% conversion.");
  receive({ type: "burn-ready", nonce: previousNonce });
  expect(child.postMessage).not.toHaveBeenCalled();
  const currentNonce = new URL(opened).searchParams.get("handoff");
  expect(currentNonce).not.toBe(previousNonce);
  receive({ type: "burn-ready", nonce: currentNonce });
  expect(child.postMessage).toHaveBeenCalledWith(
    {
      type: "burn-scenario-request",
      nonce: currentNonce,
      instruction: "Try 15% conversion.",
    },
    "https://causl.example"
  );
  handoff.dispose();
});
