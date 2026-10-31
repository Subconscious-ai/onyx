import type { CauslIdentity, ColossusPageSnapshot } from "@/lib/causl/types";

export const COLOSSUS_CONTEXT_PROTOCOL = 2;
export const COLOSSUS_CONTEXT_MAX_BYTES = 64_000;
const categories = [
  "map_view",
  "selected_place",
  "layers",
  "filters",
  "dates",
  "visible_results",
  "evidence_links",
] as const;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseColossusSnapshot(
  value: unknown
): ColossusPageSnapshot | null {
  if (
    !object(value) ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    typeof value.revision !== "number" ||
    value.revision < 0 ||
    value.privacy !== "Browser-local overlays excluded" ||
    !Array.isArray(value.omissions) ||
    value.omissions.length > 100 ||
    !value.omissions.every(object)
  )
    return null;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "version",
          "revision",
          "privacy",
          "omissions",
          ...categories,
        ].includes(key)
    )
  )
    return null;
  if (!categories.every((key) => object(value[key]))) return null;
  try {
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
      COLOSSUS_CONTEXT_MAX_BYTES
    )
      return null;
    // Parse again so later parent mutations cannot change a prepared turn.
    return JSON.parse(JSON.stringify(value)) as ColossusPageSnapshot;
  } catch {
    return null;
  }
}

export function parseCauslIdentity(value: unknown): CauslIdentity | null {
  if (!object(value) || !object(value.actor)) return null;
  const { orgId, userId } = value.actor;
  if (
    typeof orgId !== "string" ||
    !orgId ||
    orgId.length > 120 ||
    typeof userId !== "string" ||
    !userId ||
    userId.length > 512 ||
    typeof value.issuer !== "string" ||
    !value.issuer ||
    value.issuer.length > 2048
  )
    return null;
  return { actor: { orgId, userId }, issuer: value.issuer };
}
