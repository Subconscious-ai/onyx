import {
  modelChatContext,
  parseModelContext,
  type ModelContext,
} from "@/lib/executive/model-context";

test("a rejected preview cannot relabel the retained saved scenario or disclose model identities", () => {
  const context: ModelContext = {
    version: 1,
    modelId: "private-model-id",
    marketId: "private-market-id",
    modelName: "Acquisition",
    revision: 3,
    state: "rejected",
    cells: [
      {
        id: "internal_conversion_id",
        name: "Conversion",
        unit: "PERCENT",
        type: "POINT",
        expression: "0.1",
      },
    ],
    savedScenario: {
      name: "15% conversion",
      metricId: "internal_conversion_id",
      expression: "0.15",
    },
  };
  const text = modelChatContext(context)!;
  const data = JSON.parse(text.split("\n\n").at(-1)!);
  expect(data.latestReviewState).toBe("rejected");
  expect(data.savedScenario.expression).toBe("0.15");
  expect(data.state).toBeUndefined();
  expect(text).not.toContain("private-model-id");
  expect(text).not.toContain("private-market-id");
  expect(text).not.toContain("internal_conversion_id");
  expect(data.savedScenario.inputName).toBe("Conversion");
  expect(modelChatContext(null)).toBeUndefined();
});

test("display projection preserves calculator evidence without exposing executable identifiers", () => {
  const raw = {
    version: 1,
    modelId: "private-model-id",
    marketId: "private-market-id",
    modelName: "Acquisition",
    revision: 3,
    state: "proposed",
    cells: [
      {
        id: "conversion_id",
        name: "Conversion",
        unit: "PERCENT",
        type: "POINT",
        expression: "0.1",
      },
      {
        id: "contribution_id",
        name: "Monthly contribution",
        unit: "USD",
        type: "FUNCTION",
        expression: "=1000*${metric:conversion_id}*100",
      },
    ],
    calculation: {
      engine: "guesstimate-a71a578",
      baselineRevision: 3,
      instruction: "Try 12% conversion",
      selection: {
        metricId: "conversion_id",
        name: "Conversion 12%",
        expression: "0.12",
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
            metricId: "contribution_id",
            metricName: "Monthly contribution",
            baselineMean: 10000,
            mean: 12000,
            meanChange: 2000,
          },
        ],
      },
    },
  };
  const before = JSON.stringify(raw);
  const context = parseModelContext(raw);
  expect(context).not.toBeNull();
  const text = modelChatContext(context)!;
  const data = JSON.parse(text.split("\n\n").at(-1)!);
  expect(text).not.toMatch(
    /conversion_id|contribution_id|guesstimate|\$\{metric:/
  );
  expect(data.cells[1].expression).toBe('=1000*"Conversion"*100');
  expect(data.calculation.baselineRevision).toBe(3);
  expect(data.calculation.selection.inputName).toBe("Conversion");
  expect(data.calculation.analysis).toEqual({
    status: "ready",
    intervention: raw.calculation.analysis.intervention,
    affectedMetrics: [
      {
        metricName: "Monthly contribution",
        baselineMean: 10000,
        mean: 12000,
        meanChange: 2000,
      },
    ],
  });
  expect(JSON.stringify(raw)).toBe(before);
  expect(context?.calculation?.selection.metricId).toBe("conversion_id");

  raw.cells[1]!.name = "Conversion";
  raw.calculation.analysis.affectedMetrics[0]!.metricName = "Conversion";
  const duplicateNames = JSON.parse(
    modelChatContext(parseModelContext(raw))!.split("\n\n").at(-1)!
  );
  expect(duplicateNames.cells[0].name).not.toBe(duplicateNames.cells[1].name);
  expect(duplicateNames.cells[1].expression).toContain(
    JSON.stringify(duplicateNames.cells[0].name)
  );
  expect(duplicateNames.calculation.selection.inputName).toBe(
    duplicateNames.cells[0].name
  );
  expect(duplicateNames.calculation.analysis.intervention.metricName).toBe(
    duplicateNames.cells[0].name
  );
  expect(
    duplicateNames.calculation.analysis.affectedMetrics[0].metricName
  ).toBe(duplicateNames.cells[1].name);
});
