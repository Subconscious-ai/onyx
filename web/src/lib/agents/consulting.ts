export const consultingRoles = ["interview", "design", "analytics"] as const;
export type ConsultingRole = (typeof consultingRoles)[number];

export function consultingRole(
  agent?: { name: string } | null
): ConsultingRole | null {
  switch (agent?.name) {
    case "Burn 2.0":
    case "Beca":
      return "interview";
    case "Experiment design":
      return "design";
    case "Experiment analytics":
      return "analytics";
    default:
      return null;
  }
}
