import httpx
import pytest

from onyx.server.features.mcp import ssrf


@pytest.mark.asyncio
async def test_transport_skips_validation_only_for_the_exact_pin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    checked: list[str] = []

    def fake_validate(url: str, **_: object) -> str:
        checked.append(url)
        raise ValueError("blocked")

    async def fake_send(_self: object, request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, request=request)

    monkeypatch.setattr(ssrf, "validate_mcp_outbound_url", fake_validate)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fake_send)
    monkeypatch.setenv("CAUSL_KB_HOST_MCP_SERVERS", "9=http://ep-mcp:8000/mcp")
    transport = ssrf._SSRFGuardAsyncTransport()

    ok = await transport.handle_async_request(
        httpx.Request("POST", "http://ep-mcp:8000/mcp")
    )
    assert ok.status_code == 200 and checked == []

    for url in (
        "http://ep-mcp:8000/mcp/",
        "http://ep-mcp:8000/.well-known/oauth-protected-resource",
        "http://cache:6379/mcp",
    ):
        with pytest.raises(ValueError):
            await transport.handle_async_request(httpx.Request("GET", url))
    assert len(checked) == 3
