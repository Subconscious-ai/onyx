const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  jsonResponse,
  isolationResult,
  coverage,
  numericReceipt,
} = require("./checks.cjs");
test("HTML sign-in and non-JSON responses cannot pass an API check", () => {
  assert.throws(() => jsonResponse(200, "text/html", "<html>Login</html>"));
  assert.throws(() => jsonResponse(302, "application/json", "{}"));
  assert.deepEqual(jsonResponse(200, "application/json", '{"id":"a"}'), {
    id: "a",
  });
});
test("isolation requires an owner positive control and authenticated outsider", () => {
  assert.equal(
    isolationResult({
      ownerStatus: 404,
      ownerBody: "",
      outsiderStatus: 404,
      marker: "canary",
      outsiderAuthenticated: true,
    }),
    false,
  );
  assert.equal(
    isolationResult({
      ownerStatus: 200,
      ownerBody: "canary",
      outsiderStatus: 401,
      marker: "canary",
      outsiderAuthenticated: false,
    }),
    false,
  );
  assert.equal(
    isolationResult({
      ownerStatus: 200,
      ownerBody: "canary",
      outsiderStatus: 200,
      marker: "canary",
      outsiderAuthenticated: true,
    }),
    false,
  );
  assert.equal(
    isolationResult({
      ownerStatus: 200,
      ownerBody: "canary",
      outsiderStatus: 404,
      marker: "canary",
      outsiderAuthenticated: true,
    }),
    true,
  );
});
test("missing categories and directions block complete isolation", () => {
  assert.equal(coverage([]), false);
  const rows = ["chats", "research", "models", "experiments"].flatMap((kind) =>
    ["A", "B"].map((owner) => ({ kind, owner, passed: true })),
  );
  assert.equal(coverage(rows), true);
  assert.equal(coverage(rows.slice(1)), false);
  assert.equal(
    coverage([...rows.slice(1), { ...rows[0], passed: false }]),
    false,
  );
});
test("calculation evidence requires actual finite numeric result, not prose", () => {
  assert.equal(numericReceipt({ value: 12000 }, 12000), true);
  assert.equal(numericReceipt({ value: 10000 }, 12000), false);
  assert.equal(numericReceipt({ message: "12000" }, 12000), false);
  assert.equal(numericReceipt({ value: "12000" }, 12000), false);
  assert.equal(numericReceipt({ value: Infinity }, 12000), false);
});
test("one failed isolation resource invalidates otherwise complete coverage", () => {
  const rows = ["chats", "research", "models", "experiments"].flatMap((kind) =>
    ["A", "B"].map((owner) => ({ kind, owner, passed: true })),
  );
  assert.equal(
    coverage([...rows, { kind: "chats", owner: "A", passed: false }]),
    false,
  );
});
test("native cell value must be exact and unambiguous", () => {
  const { calculatedCellMatches } = require("./checks.cjs");
  assert.equal(
    calculatedCellMatches("Contribution $10,000", "Contribution", 10000),
    true,
  );
  for (const value of [
    "100000",
    "110000",
    "-10000",
    "10000.5",
    "10000 20000",
  ]) {
    assert.equal(
      calculatedCellMatches("Contribution " + value, "Contribution", 10000),
      false,
    );
  }
});
test("unknown inputs stay unknown through compiled dependent outputs", () => {
  const { unknownModelInputs } = require("./checks.cjs");
  const graph = {
    metrics: [
      { id: "a", name: "Shopper count" },
      { id: "b", name: "Conversion" },
    ],
    guesstimates: [
      { metric: "a", guesstimateType: "NONE", expression: "" },
      {
        metric: "b",
        guesstimateType: "FUNCTION",
        expression: "=${metric:a}/10",
      },
    ],
  };
  assert.equal(unknownModelInputs(graph, ["shopper", "conversion"]), true);
  graph.guesstimates[0] = {
    metric: "a",
    guesstimateType: "POINT",
    expression: "1000",
  };
  assert.equal(unknownModelInputs(graph, ["shopper", "conversion"]), false);
  assert.equal(unknownModelInputs(graph, ["missing"]), false);
});
