"""Protect bounded research without replacing the upstream collector."""

import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastmcp import Client, FastMCP
from serve_research import ResearchDeadline, configure


class ResearchDeadlineTests(unittest.IsolatedAsyncioTestCase):
    async def test_native_curation_defaults_on_and_respects_explicit_configuration(
        self,
    ):
        for configured, expected in (
            (None, "true"),
            ("false", "false"),
            ("true", "true"),
        ):
            with self.subTest(configured=configured):
                environment = {
                    "AWS_BEARER_TOKEN_BEDROCK": "test-bearer",
                    "AWS_DEFAULT_REGION": "us-east-1",
                    "EXA_API_KEY": "test-search",
                    "GPTR_PREVIEW_TOKEN": "t" * 40,
                }
                if configured is not None:
                    environment["CURATE_SOURCES"] = configured
                upstream = FastMCP("Native source curation")
                with (
                    patch.dict(os.environ, environment, clear=True),
                    patch(
                        "serve_research.runpy.run_path", return_value={"mcp": upstream}
                    ),
                    patch("serve_research.install_source_limit", create=True),
                ):
                    await configure(Path("/unused"))
                    self.assertEqual(os.environ["CURATE_SOURCES"], expected)

    async def test_duckduckgo_uses_selected_retriever_without_an_exa_key(self):
        environment = {
            "AWS_BEARER_TOKEN_BEDROCK": "test-bearer",
            "AWS_DEFAULT_REGION": "us-east-1",
            "GPTR_PREVIEW_TOKEN": "t" * 40,
            "RETRIEVER": "duckduckgo",
        }
        upstream = FastMCP("Native keyless research")
        with (
            patch.dict(os.environ, environment, clear=True),
            patch("serve_research.runpy.run_path", return_value={"mcp": upstream}),
            patch("serve_research.install_source_limit", create=True),
        ):
            server = await configure(Path("/unused"))
            self.assertIs(server, upstream)
            self.assertIsNotNone(server.auth)
            self.assertEqual(os.environ["RETRIEVER"], "duckduckgo")
            self.assertNotIn("EXA_API_KEY", os.environ)

    async def test_default_exa_retriever_still_requires_its_api_key(self):
        environment = {
            "AWS_BEARER_TOKEN_BEDROCK": "test-bearer",
            "AWS_DEFAULT_REGION": "us-east-1",
            "GPTR_PREVIEW_TOKEN": "t" * 40,
        }
        with (
            patch.dict(os.environ, environment, clear=True),
            self.assertRaisesRegex(ValueError, "EXA_API_KEY is required"),
        ):
            await configure(Path("/unused"))

    async def test_bedrock_bearer_auth_does_not_require_an_unrelated_iam_key_pair(self):
        environment = {
            "AWS_BEARER_TOKEN_BEDROCK": "test-bearer",
            "AWS_DEFAULT_REGION": "us-east-1",
            "EXA_API_KEY": "test-search",
            "GPTR_PREVIEW_TOKEN": "t" * 40,
        }
        upstream = FastMCP("Upstream research")
        with (
            patch.dict(os.environ, environment, clear=True),
            patch("serve_research.runpy.run_path", return_value={"mcp": upstream}),
            patch("serve_research.install_source_limit", create=True),
        ):
            server = await configure(Path("/unused"))
            self.assertIs(server, upstream)
            self.assertIsNotNone(server.auth)
            self.assertEqual(os.environ["RETRIEVER"], "exa")
            self.assertEqual(os.environ["SIMILARITY_THRESHOLD"], "0.2")

    async def test_oversized_source_is_bounded_before_embedding_with_original_provenance(
        self,
    ):
        pages = [
            {
                "url": "https://example.com/large",
                "title": "Original large source",
                "raw_content": "x" * 575939,
            },
            {
                "url": "https://example.com/product",
                "title": "Original product source",
                "raw_content": "A sourced product description.",
            },
        ]
        embedded = []

        class ContextManager:
            async def get_similar_content_by_query(self, _query, source_pages):
                embedded.extend(source_pages)
                return "Relevant sourced product description."

        upstream = FastMCP("Bounded source regression")

        @upstream.tool()
        async def deep_research(query: str):
            context = await ContextManager().get_similar_content_by_query(query, pages)
            return {
                "success": True,
                "data": {
                    "context": [context],
                    "source_urls": [page["url"] for page in pages],
                },
            }

        with (
            patch.dict(
                os.environ,
                {
                    "AWS_BEARER_TOKEN_BEDROCK": "test-bearer",
                    "AWS_DEFAULT_REGION": "us-east-1",
                    "EXA_API_KEY": "test-search",
                    "GPTR_PREVIEW_TOKEN": "t" * 40,
                },
                clear=True,
            ),
            patch("serve_research.runpy.run_path", return_value={"mcp": upstream}),
            patch.dict(
                sys.modules,
                {
                    "gpt_researcher.skills.context_manager": SimpleNamespace(
                        ContextManager=ContextManager
                    )
                },
            ),
        ):
            server = await configure(Path("/unused"))
            server = await configure(Path("/unused"))
            async with Client(server) as client:
                result = await client.call_tool(
                    "deep_research", {"query": "Public product context"}
                )

        self.assertEqual(len(embedded[0]["raw_content"]), 8000)
        self.assertEqual(embedded[0]["url"], pages[0]["url"])
        self.assertEqual(embedded[0]["title"], pages[0]["title"])
        self.assertEqual(embedded[1], pages[1])
        self.assertEqual(len(pages[0]["raw_content"]), 575939)
        self.assertTrue(result.data["data"]["truncated"])
        self.assertIn(
            "limited to 8,000 characters per source", result.data["data"]["context"][0]
        )
        self.assertEqual(
            result.data["data"]["context"][0].count(
                "limited to 8,000 characters per source"
            ),
            1,
        )
        self.assertEqual(
            result.data["data"]["source_urls"], [page["url"] for page in pages]
        )

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
