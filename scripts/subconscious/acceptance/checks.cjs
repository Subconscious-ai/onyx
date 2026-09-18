const assert = require("node:assert/strict");
function jsonResponse(status, type, body) {
  assert.equal(status, 200, "Expected HTTP 200");
  assert.match(
    type,
    /^application\/json\b/i,
    "Expected JSON, not a login page",
  );
  return JSON.parse(body);
}
function isolationResult({
  ownerStatus,
  ownerBody,
  outsiderStatus,
  marker,
  outsiderAuthenticated,
}) {
  return Boolean(
    marker &&
    ownerStatus === 200 &&
    ownerBody.includes(marker) &&
    outsiderAuthenticated &&
    [403, 404].includes(outsiderStatus),
  );
}
function coverage(rows) {
  return (
    rows.every((r) => r.passed === true) &&
    ["chats", "research", "models", "experiments"].every((kind) =>
      ["A", "B"].every((owner) =>
        rows.some(
          (r) => r.kind === kind && r.owner === owner && r.passed === true,
        ),
      ),
    )
  );
}
function numericReceipt(receipt, expected) {
  return (
    typeof receipt.value === "number" &&
    Number.isFinite(receipt.value) &&
    Math.abs(receipt.value - expected) <= 1e-8
  );
}
module.exports = { jsonResponse, isolationResult, coverage, numericReceipt };
function calculatedCellMatches(text, name, expected) {
  if (!text.includes(name)) return false;
  const values = [
    ...text.replace(name, "").matchAll(/[-+]?\d[\d,]*(?:\.\d+)?[kKmM]?/g),
  ];
  if (values.length !== 1) return false;
  const token = values[0][0].replaceAll(",", "");
  const multiplier = /k$/i.test(token) ? 1000 : /m$/i.test(token) ? 1000000 : 1;
  return numericReceipt(
    { value: Number(token.replace(/[kKmM]$/, "")) * multiplier },
    expected,
  );
}
function unknownModelInputs(graph, patterns) {
  function unresolved(id, seen = new Set()) {
    if (seen.has(id)) return false;
    const cell = graph.guesstimates.find((c) => c.metric === id);
    if (!cell) return false;
    if (cell.guesstimateType === "NONE") return cell.expression.trim() === "";
    if (cell.guesstimateType !== "FUNCTION") return false;
    const next = new Set([...seen, id]);
    return [...cell.expression.matchAll(/\$\{metric:([^}]+)\}/g)].some((m) =>
      unresolved(m[1], next),
    );
  }
  return patterns.every((pattern) => {
    const matched = graph.metrics.filter(
      (m) =>
        new RegExp(pattern, "i").test(m.name) &&
        !/goal|target|scenario/i.test(m.name),
    );
    return matched.length > 0 && matched.every((m) => unresolved(m.id));
  });
}
module.exports.calculatedCellMatches = calculatedCellMatches;
module.exports.unknownModelInputs = unknownModelInputs;
