"""Prove configured native Auth0 login reaches Onyx through its gateway."""

import json
import unittest
from urllib.parse import parse_qs, urlsplit

import test_preview_gateway


class Auth0GatewayTest(unittest.TestCase):
    origin = test_preview_gateway.PreviewGatewayTest.origin
    setUp = test_preview_gateway.PreviewGatewayTest.setUp
    request = test_preview_gateway.PreviewGatewayTest.request

    def test_provider_is_visible(self) -> None:
        status, _, body = self.request("/auth/type")
        self.assertEqual(status, 200)
        providers = json.loads(body)["sso_providers"]
        self.assertTrue(any(provider["name"] == "auth0" for provider in providers))

    def test_native_authorize_uses_shared_identity_and_pkce(self) -> None:
        status, _, body = self.request("/auth/oidc/auth0/authorize")
        self.assertEqual(status, 200)
        url = urlsplit(json.loads(body)["authorization_url"])
        self.assertEqual((url.scheme, url.netloc), ("https", "auth.subconscious.ai"))
        query = parse_qs(url.query)
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertTrue(query["state"][0])
        self.assertEqual(
            query["redirect_uri"],
            [
                "https://onyx-executive-git-codex-1-executive-interviewer-"
                "subconcious.vercel.app/api/auth/oidc/auth0/callback"
            ],
        )

    def test_bad_callback_reaches_native_validation(self) -> None:
        status, _, body = self.request(
            "/auth/oidc/auth0/callback?code=invalid&state=invalid"
        )
        self.assertIn(status, (400, 401, 422))
        self.assertNotIn(b"preview access restricted", body)

    def test_other_authentication_paths_remain_closed(self) -> None:
        for path in (
            "/auth/oidc/unconfigured/authorize",
            "/auth/register",
            "/auth/forgot-password",
            "/users",
            "/me",
        ):
            with self.subTest(path=path):
                status, _, _ = self.request(path)
                self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()
