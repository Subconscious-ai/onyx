import { parseCauslMessage, createCauslBridge } from "@/lib/causl/bridge";
import { parseColossusSnapshot } from "@/lib/causl/colossus";

const snapshot = () => ({
  version: 1,
  revision: 3,
  map_view: { center: [0, 0] },
  selected_place: { id: "USA", grain: "country" },
  layers: { active: ["world_bank"] },
  filters: { scope: "world" },
  dates: { period: "2001", grain: "annual" },
  visible_results: { returned: 2, viewport_visible: null },
  evidence_links: { sources: ["https://api.worldbank.org"] },
  omissions: [],
  privacy: "Browser-local overlays excluded",
});
const message = (revision: number) => ({
  kind: "causl:context",
  nonce: "nonce",
  revision,
  actor: { orgId: "org", userId: "auth0|alice" },
  selection: { page: "colossus", snapshot: snapshot() },
});
const workspace = {
  chatId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  agentId: 11,
  scopeKey: "b".repeat(64),
  contextDigest: "c".repeat(64),
};

test("Colossus requires seven bounded categories and rejects KB selectors and overlay roots", () => {
  expect(parseCauslMessage(message(1))?.selection.page).toBe("colossus");
  for (const category of [
    "map_view",
    "selected_place",
    "layers",
    "filters",
    "dates",
    "visible_results",
    "evidence_links",
  ]) {
    const value: Record<string, unknown> = snapshot();
    delete value[category];
    expect(parseColossusSnapshot(value)).toBeNull();
  }
  expect(
    parseColossusSnapshot({
      ...snapshot(),
      local_overlay: { rows: ["private"] },
    })
  ).toBeNull();
  expect(
    parseColossusSnapshot({
      ...snapshot(),
      visible_results: { rows: ["世".repeat(22000)] },
    })
  ).toBeNull();
  const value = message(1);
  expect(
    parseCauslMessage({
      ...value,
      selection: { ...value.selection, marketId: "foreign" },
    })
  ).toBeNull();
});

test("prepared Colossus turns freeze the page while later turns receive the newer selection", async () => {
  const controller = createCauslBridge({
    nonce: "nonce",
    open: jest.fn().mockResolvedValue(workspace),
    onReady: jest.fn(),
    onError: jest.fn(),
  });
  const first = message(1);
  controller.receive(first);
  first.selection.snapshot.selected_place.id = "mutated";
  const prepared = await controller.prepareSubmission();
  expect(prepared.snapshot?.selected_place.id).toBe("USA");
  const next = message(2);
  next.selection.snapshot.revision = 4;
  next.selection.snapshot.selected_place.id = "CHN";
  controller.receive(next);
  const newer = await controller.prepareSubmission();
  expect(newer.snapshot?.selected_place.id).toBe("CHN");
  expect(prepared.snapshot?.selected_place.id).toBe("USA");
  controller.dispose();
});
