import type { PublicResearch } from "./hooks";
import { modelBusinessContext } from "./model-handoff";

test("exports PDL and sourced research without worker or authority fields", () => {
  const context = modelBusinessContext(
    {
      profile: { company: "Acme", website: "https://example.com" },
      source: "pdl",
    },
    {
      status: "ready",
      report: "Public buyer evidence",
      source_urls: ["https://example.com/products"],
      checked_at: 123,
      job_id: "private-worker",
    } as PublicResearch
  );
  expect(context).toEqual({
    profile: { company: "Acme", website: "https://example.com" },
    profileSource: "pdl",
    research: {
      status: "ready",
      report: "Public buyer evidence",
      source_urls: ["https://example.com/products"],
      checked_at: 123,
    },
  });
});
test("never exports stale findings from incomplete research", () => {
  expect(
    modelBusinessContext(
      { profile: { company: "Acme" }, source: "executive_correction" },
      {
        status: "running",
        report: "Old findings",
        source_urls: ["https://old.example"],
      }
    )?.research
  ).toEqual({ status: "running" });
  expect(modelBusinessContext(null, { status: "ready" })).toBeUndefined();
});
