"""Configure upstream GPT Researcher MCP for an authenticated local QA preview."""

import argparse
import asyncio
import json
import os
import re
import runpy
import sys
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.server.auth.providers.jwt import StaticTokenVerifier
from fastmcp.server.middleware import CallNext, Middleware, MiddlewareContext
from fastmcp.tools.tool import ToolResult
from mcp.types import CallToolRequestParams

SOURCE_LIMIT = 8000
SOURCE_LIMIT_NOTICE = "Research input was limited to 8,000 characters per source before relevance selection; later details may be omitted."


def install_source_limit() -> None:
    from gpt_researcher.skills.context_manager import ContextManager

    compress = ContextManager.get_similar_content_by_query
    if (compress.__module__, compress.__name__) == (__name__, "bounded_context"):
        return

    async def bounded_context(
        manager: object, query: str, pages: list[dict[str, object]]
    ) -> str:
        bounded = [
            {**page, "raw_content": content[:SOURCE_LIMIT]}
            if isinstance(content := page.get("raw_content"), str)
            else page
            for page in pages
        ]
        context = await compress(manager, query, bounded)
        if any(
            isinstance(content := page.get("raw_content"), str)
            and len(content) > SOURCE_LIMIT
            for page in pages
        ):
            return context + "\n\n" + SOURCE_LIMIT_NOTICE
        return context

    ContextManager.get_similar_content_by_query = bounded_context


class ResearchDeadline(Middleware):
    def __init__(self, seconds: float = 120):
        self.seconds = seconds

    async def on_call_tool(
        self,
        context: MiddlewareContext[CallToolRequestParams],
        call_next: CallNext[CallToolRequestParams, ToolResult],
    ) -> ToolResult:
        query = (context.message.arguments or {}).get("query", "")
        if not isinstance(query, str) or len(query) > 800:
            raise ValueError("Use one bounded public market question.")
        if re.search(r"[^\s@]+@[^\s@]+\.[^\s@]+", query):
            raise ValueError(
                "Public research accepts company or category questions, not email addresses."
            )
        try:
            async with asyncio.timeout(self.seconds):
                result = await call_next(context)
                receipt = result.structured_content
                if isinstance(receipt, dict):
                    data = receipt.get("data", receipt)
                    if isinstance(data, dict) and SOURCE_LIMIT_NOTICE in json.dumps(
                        data.get("context", [])
                    ):
                        data = {**data, "truncated": True}
                        receipt = (
                            {**receipt, "data": data} if "data" in receipt else data
                        )
                        return ToolResult(content=receipt, structured_content=receipt)
                return result
        except TimeoutError:
            receipt = {
                "status": "unavailable",
                "reason": "Research exceeded the preview deadline. Continue with explicit unknowns.",
                "source_urls": [],
            }
            return ToolResult(content=receipt, structured_content=receipt)


async def configure(upstream: Path) -> FastMCP:
    token = os.environ["GPTR_PREVIEW_TOKEN"]
    if len(token) < 32:
        raise ValueError(
            "A private preview token of at least 32 characters is required."
        )
    retriever = os.environ.get("RETRIEVER", "exa").strip()
    required_keys = ["AWS_DEFAULT_REGION"]
    if "exa" in {name.strip() for name in retriever.split(",")}:
        required_keys.append("EXA_API_KEY")
    for key in required_keys:
        if not os.environ.get(key):
            raise ValueError(f"{key} is required.")
    if not os.environ.get("AWS_BEARER_TOKEN_BEDROCK") and not all(
        os.environ.get(key) for key in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")
    ):
        raise ValueError(
            "Configure AWS Bedrock bearer authentication or an AWS key pair."
        )
    os.environ.update(
        {
            "FAST_LLM": "bedrock:us.amazon.nova-pro-v1:0",
            "SMART_LLM": "bedrock:us.amazon.nova-pro-v1:0",
            "STRATEGIC_LLM": "bedrock:us.amazon.nova-pro-v1:0",
            "EMBEDDING": "bedrock:amazon.titan-embed-text-v2:0",
            "SIMILARITY_THRESHOLD": "0.2",
            "RETRIEVER": retriever,
            "MAX_ITERATIONS": "2",
            "MAX_SEARCH_RESULTS_PER_QUERY": "3",
            "MAX_SCRAPER_WORKERS": "3",
            "FAST_TOKEN_LIMIT": "1200",
            "SMART_TOKEN_LIMIT": "2000",
            "STRATEGIC_TOKEN_LIMIT": "1200",
            "BROWSE_CHUNK_MAX_LENGTH": "4096",
            "CURATE_SOURCES": "false",
            "VERBOSE": "false",
        }
    )
    # Import the pinned upstream server; collection and source retrieval stay upstream.
    sys.path.insert(0, str(upstream.resolve()))
    server: FastMCP = runpy.run_path(str(upstream / "server.py"))["mcp"]
    install_source_limit()
    server.auth = StaticTokenVerifier(
        tokens={token: {"client_id": "onyx-executive-preview", "scopes": ["research"]}}
    )
    for name in await server.get_tools():
        if name not in {
            "deep_research",
            "get_research_sources",
            "get_research_context",
        }:
            server.remove_tool(name)
    server.add_middleware(ResearchDeadline())
    return server


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream", required=True, type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=3193, type=int)
    args = parser.parse_args()
    server = asyncio.run(configure(args.upstream))
    server.run(
        transport="streamable-http", host=args.host, port=args.port, show_banner=False
    )


if __name__ == "__main__":
    main()
