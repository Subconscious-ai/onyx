"""Check the real frontend login boundary, not only the AWS gateway.

Set LOGIN_FRONTEND_URL and LOGIN_CANONICAL_ORIGIN. Protected previews also need
VERCEL_AUTOMATION_BYPASS_SECRET. No accounts, authenticated sessions or chat records are created.
Actual Auth0 sign-in and saved-data recovery remain separate browser checks.
"""

import json
import os
import unittest
from email.message import Message
from http.cookies import SimpleCookie
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, _request, _response, _code, _message, _headers, _url):
        return None


class LoginOriginTest(unittest.TestCase):
    def setUp(self) -> None:
        self.frontend = os.environ["LOGIN_FRONTEND_URL"].rstrip("/")
        self.canonical = os.environ["LOGIN_CANONICAL_ORIGIN"].rstrip("/")
        for origin in (self.frontend, self.canonical):
            parsed = urlsplit(origin)
            self.assertEqual(parsed.scheme, "https")
            self.assertTrue(parsed.hostname)
            self.assertFalse(parsed.path or parsed.query or parsed.fragment)
        self.client = build_opener(NoRedirect())

    def request(self, origin: str, path: str) -> tuple[int, Message, bytes]:
        headers = {}
        bypass = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET")
        if bypass:
            headers["x-vercel-protection-bypass"] = bypass
        try:
            response = self.client.open(
                Request(origin + path, headers=headers),  # noqa: S310 - HTTPS origins checked in setUp; redirects disabled
                timeout=30,
            )
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def test_login_moves_to_callback_origin_before_oauth_starts(self) -> None:
        path = "/auth/login?next=%2Fapp%3FagentId%3D5"
        status, headers, _ = self.request(self.frontend, path)
        if self.frontend == self.canonical:
            self.assertEqual(status, 200)
        else:
            self.assertEqual(status, 307)
            self.assertEqual(headers.get("Location"), self.canonical + path)
        self.assertFalse(headers.get("Set-Cookie"))

    def test_cookie_origin_matches_registered_callback(self) -> None:
        status, headers, body = self.request(
            self.canonical, "/api/auth/oidc/auth0/authorize"
        )
        self.assertEqual(status, 200)
        authorization = urlsplit(json.loads(body)["authorization_url"])
        self.assertEqual(authorization.netloc, "auth.subconscious.ai")
        query = parse_qs(authorization.query)
        self.assertEqual(
            query["redirect_uri"],
            [self.canonical + "/api/auth/oidc/auth0/callback"],
        )
        self.assertEqual(query["code_challenge_method"], ["S256"])
        cookies = SimpleCookie()
        for header in headers.get_all("Set-Cookie", []):
            cookies.load(header)
        self.assertIn("fastapiusersoauthcsrf", cookies)
        self.assertTrue(
            any(name.startswith("fastapiusersoauthpkce_") for name in cookies)
        )
        for cookie in cookies.values():
            self.assertFalse(cookie["domain"])
            self.assertTrue(cookie["secure"] and cookie["httponly"])

    def test_missing_session_and_invalid_callback_still_fail(self) -> None:
        status, _, _ = self.request(self.canonical, "/api/me")
        self.assertIn(status, (401, 403))
        status, _, _ = self.request(
            self.canonical, "/api/auth/oidc/auth0/callback?state=invalid&code=invalid"
        )
        self.assertIn(status, (400, 401, 422))


if __name__ == "__main__":
    unittest.main()
