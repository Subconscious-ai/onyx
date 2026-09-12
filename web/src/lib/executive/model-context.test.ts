import {
  modelChatContext,
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
        id: "conversion",
        name: "Conversion",
        unit: "PERCENT",
        type: "POINT",
        expression: "0.1",
      },
    ],
    savedScenario: {
      name: "15% conversion",
      metricId: "conversion",
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
  expect(modelChatContext(null)).toBeUndefined();
});
