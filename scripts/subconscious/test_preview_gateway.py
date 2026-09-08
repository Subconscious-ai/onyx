"""Check the running preview gateway without creating accounts or chat data."""

import http.cookiejar
import json
import os
import unittest
from email.message import Message
from urllib.error import HTTPError
from urllib.request import Request, urlopen


class PreviewGatewayTest(unittest.TestCase):
    origin = os.environ.get("PREVIEW_GATEWAY_URL", "http://127.0.0.1:3176")

    def request(self, path: str) -> tuple[int, Message, bytes]:
        try:
            response = urlopen(self.origin + path, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def test_login_bootstrap_remains_available(self) -> None:
        for path in ("/health", "/auth/type"):
            with self.subTest(path=path):
                status, _, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertIsInstance(json.loads(body), dict)

    def test_private_denials_preserve_native_onyx_login_handling(self) -> None:
        # Native SWR parses auth errors as JSON before rendering the login shell.
        for path in ("/me", "/settings", "/persona/2"):
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 403)
                self.assertIn("application/json", headers.get("Content-Type", ""))
                self.assertIsInstance(json.loads(body).get("detail"), str)

    def test_preview_cannot_enroll_public_accounts(self) -> None:
        for path in ("/auth/register", "/auth/forgot-password", "/users"):
            with self.subTest(path=path):
                status, _, _ = self.request(path)
                self.assertEqual(status, 403)

    def test_existing_session_can_refresh_without_new_login(self) -> None:
        cookie_path = os.environ.get("PREVIEW_COOKIE_JAR")
        if not cookie_path:
            self.fail("Set PREVIEW_COOKIE_JAR to an authorized Onyx cookie jar")
        jar = http.cookiejar.MozillaCookieJar(cookie_path)
        jar.load(ignore_discard=True)
        cookie_header = "; ".join(f"{cookie.name}={cookie.value}" for cookie in jar)
        request = Request(
            self.origin + "/auth/refresh",
            method="POST",
            headers={"Cookie": cookie_header},
        )
        try:
            response = urlopen(request, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            self.assertIn(response.status, (200, 204))
            self.assertIn("fastapiusersauth=", response.headers.get("Set-Cookie", ""))


if __name__ == "__main__":
    unittest.main()
