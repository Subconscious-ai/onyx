export const profileFields = [
  "name",
  "role",
  "company",
  "industry",
  "website",
  "product",
  "customer_segment",
] as const;
export type ProfileFields = Partial<
  Record<(typeof profileFields)[number], string>
>;
export interface ExecutiveProfile {
  profile: ProfileFields;
  provider_profile?: ProfileFields;
  correction: { revision: number; fields: ProfileFields };
}
