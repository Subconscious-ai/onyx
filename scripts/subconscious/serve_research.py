"""Configure upstream GPT Researcher MCP for an authenticated local QA preview."""

import argparse
import asyncio
import ipaddress
import json
import os
import re
import runpy
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from fastmcp import FastMCP
from fastmcp.server.auth.providers.jwt import StaticTokenVerifier
from fastmcp.server.middleware import CallNext, Middleware, MiddlewareContext
from fastmcp.tools.tool import ToolResult
from mcp.types import CallToolRequestParams

SOURCE_LIMIT = 8000
SOURCE_LIMIT_NOTICE = "Research input was limited to 8,000 characters per source before relevance selection; later details may be omitted."


def install_website_source(server: FastMCP, upstream: dict[str, Any]) -> None:
    """Expose native website collection without changing upstream receipts or storage."""
    original = upstream["deep_research"]

    async def deep_research(
        query: str, source_urls: list[str] | None = None
    ) -> dict[str, Any]:
        """Research public context; optionally read one company website before web search."""
        if not source_urls:
            return await original.fn(query)
        if len(source_urls) != 1:
            raise ValueError("Use one public company website origin.")
        parsed = urlsplit(source_urls[0])
        host = parsed.hostname or ""
        if (
            parsed.scheme != "https"
            or parsed.netloc != host
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or not re.fullmatch(r"[a-z0-9.-]+", host)
            or "." not in host
            or len(host) > 253
            or host.endswith((".internal", ".localhost", ".local", ".invalid", ".test"))
        ):
            raise ValueError("Use one public company website origin.")
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError("Use one public company website origin.")
        research_id = str(uuid4())
        researcher = upstream["GPTResearcher"](
            query, source_urls=source_urls, complement_source_urls=True
        )
        try:
            await researcher.conduct_research()
            server.researchers[research_id] = researcher
            context = researcher.get_research_context()
            sources = researcher.get_research_sources()
            urls = researcher.get_source_urls()
            upstream["store_research_results"](query, context, sources, urls)
            return upstream["create_success_response"](
                {
                    "research_id": research_id,
                    "query": query,
                    "source_count": len(sources),
                    "context": context,
                    "sources": upstream["format_sources_for_response"](sources),
                    "source_urls": urls,
                }
            )
        except Exception as error:
            return upstream["handle_exception"](error, "Research")

    server.remove_tool("deep_research")
    server.tool(deep_research)


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
    namespace = runpy.run_path(str(upstream / "server.py"))
    server: FastMCP = namespace["mcp"]
    install_website_source(server, namespace)
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
