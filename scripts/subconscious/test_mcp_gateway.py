"""Check native MCP catalog routing through the authenticated Burn frontend."""

import json
import os
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class McpGatewayTest(unittest.TestCase):
    def setUp(self) -> None:
        self.origin = os.environ["MCP_GATEWAY_ORIGIN"].rstrip("/")
        self.assertEqual(urlsplit(self.origin).scheme, "https")
        state = json.loads(Path(os.environ["MCP_GATEWAY_STORAGE_STATE"]).read_text())
        host = urlsplit(self.origin).hostname
        self.cookies = "; ".join(
            f"{cookie['name']}={cookie['value']}"
            for cookie in state["cookies"]
            if host == cookie["domain"].lstrip(".")
            or host.endswith("." + cookie["domain"].lstrip("."))
        )
        self.assertTrue(self.cookies)

    def status(self, path: str, authenticated: bool) -> tuple[int, bytes]:
        headers = {"Cookie": self.cookies} if authenticated else {}
        request = Request(  # noqa: S310 - HTTPS origin checked in setUp
            self.origin + path, headers=headers
        )
        try:
            response = urlopen(request, timeout=15)  # noqa: S310 - fixed HTTPS origin
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.read()

    def test_native_catalog_and_standalone_mcp_keep_separate_auth(self) -> None:
        status, body = self.status("/api/mcp/servers/persona/5", True)
        self.assertEqual(status, 200)
        self.assertIsInstance(json.loads(body)["mcp_servers"], list)

        denied, _ = self.status("/api/mcp/servers/persona/5", False)
        self.assertIn(denied, (401, 403))

        metadata, _ = self.status("/api/mcp/oauth/client-metadata", False)
        self.assertEqual(metadata, 200)

        standalone, _ = self.status("/api/mcp", True)
        self.assertEqual(standalone, 401)


if __name__ == "__main__":
    unittest.main()
