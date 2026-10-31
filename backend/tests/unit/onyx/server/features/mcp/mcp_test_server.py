"""Serve a FastMCP server on loopback for tests that need a real MCP connection."""

import socket
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager

import uvicorn
from fastmcp import FastMCP


@contextmanager
def serve(server: FastMCP) -> Iterator[str]:
    """Run ``server`` over streamable HTTP and yield its URL."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    config = uvicorn.Config(
        server.http_app(path="/mcp"),
        host="127.0.0.1",
        port=port,
        log_level="warning",
    )
    uvicorn_server = uvicorn.Server(config)
    thread = threading.Thread(target=uvicorn_server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not uvicorn_server.started:
        assert time.monotonic() < deadline, "fake MCP server did not start"
        time.sleep(0.02)
    try:
        yield f"http://127.0.0.1:{port}/mcp"
    finally:
        uvicorn_server.should_exit = True
        thread.join(timeout=10)
