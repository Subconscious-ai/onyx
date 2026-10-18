import type { AuthTypeMetadata } from "./types";
import { automaticAuth0Provider } from "./automatic-provider";

const provider = {
  name: "auth0", displayName: "Subconscious", providerType: "OIDC" as const,
  authorizeUrl: "/api/auth/oidc/auth0/authorize",
};
const metadata: AuthTypeMetadata = {
  multiTenant: false, passwordAuthEnabled: false, ssoProviders: [provider],
  requiresVerification: true, anonymousUserEnabled: false, passwordMinLength: 8,
  passwordMaxLength: 72, passwordRequireUppercase: false, passwordRequireLowercase: false,
  passwordRequireDigit: false, passwordRequireSpecialChar: false, hasUsers: true, oauthEnabled: false,
};

test("Auth0-only hosted login starts the existing native provider flow", () => {
  expect(automaticAuth0Provider(metadata)).toBe(provider);
});

test.each([
  null,
  { ...metadata, multiTenant: true },
  { ...metadata, passwordAuthEnabled: true },
  { ...metadata, ssoProviders: [] },
  { ...metadata, ssoProviders: [provider, { ...provider, name: "enterprise" }] },
  { ...metadata, ssoProviders: [{ ...provider, name: "enterprise" }] },
])("preserves other deployments' login choices: %s", (settings) => {
  expect(automaticAuth0Provider(settings)).toBeNull();
});
