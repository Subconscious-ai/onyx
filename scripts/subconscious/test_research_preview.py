"""Protect bounded research without replacing the upstream collector."""

import asyncio
import unittest
from types import SimpleNamespace

from fastmcp import Client, FastMCP
from serve_research import ResearchDeadline


class ResearchDeadlineTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_cancels_work_instead_of_reporting_completed_research(self):
        cancelled = asyncio.Event()

        async def slow(query: str):
            self.assertEqual(query, "public ice cream retail")
            try:
                await asyncio.sleep(0.03)
            finally:
                cancelled.set()

        server = FastMCP("Deadline regression")
        server.tool(slow)
        server.add_middleware(ResearchDeadline(seconds=0.01))
        async with Client(server) as client:
            result = await client.call_tool(
                "slow", {"query": "public ice cream retail"}
            )
        self.assertEqual(result.data["status"], "unavailable")
        self.assertEqual(result.data["source_urls"], [])
        self.assertTrue(cancelled.is_set())

    async def test_email_query_cannot_reach_the_public_researcher(self):
        called = False

        async def collect(_context):
            nonlocal called
            called = True

        with self.assertRaises(ValueError):
            await ResearchDeadline().on_call_tool(
                SimpleNamespace(
                    message=SimpleNamespace(
                        arguments={"query": "Research executive alice@example.com"}
                    )
                ),
                collect,
            )
        self.assertFalse(called)


if __name__ == "__main__":
    unittest.main()
