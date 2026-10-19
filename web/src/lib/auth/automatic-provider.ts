import type { AuthTypeMetadata, SSOProviderOption } from "./types";

/** Hosted Auth0-only installs go directly to Universal Login. */
export function automaticAuth0Provider(
  metadata: AuthTypeMetadata | null,
  loggedOut = false
): SSOProviderOption | null {
  if (
    loggedOut ||
    metadata?.multiTenant !== false ||
    metadata.passwordAuthEnabled !== false
  ) {
    return null;
  }
  const providers = metadata.ssoProviders ?? [];
  return providers.length === 1 && providers[0]?.name === "auth0"
    ? providers[0]
    : null;
}
