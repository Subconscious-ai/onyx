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
  checked_at?: number;
  job_id?: string;
  preparation_pending?: boolean;
  preparation_status?: string;
  profile: ProfileFields;
  provider_profile?: ProfileFields;
  correction: { revision: number; fields: ProfileFields };
}
