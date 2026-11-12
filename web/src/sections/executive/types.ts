import type { ExecutiveProfile, ProfileFields } from "@/lib/executive/profile";

export interface ProfileEditorState {
  original: ExecutiveProfile;
  fields: ProfileFields;
  busy: boolean;
  error: string;
}

export interface CompanyProfileState {
  editor: ProfileEditorState | null;
  busy: boolean;
  error: string;
  result: string;
  operation: string | null;
}
