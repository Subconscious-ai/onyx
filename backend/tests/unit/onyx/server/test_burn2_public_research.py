"""Executive research covers the company, its recent news and the executive's public record."""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import cast

import pytest

from onyx.server.query_and_chat.burn2.research import (
    collect_public_research,
    public_record_query,
    public_research_query,
    research_context,
)
from onyx.tools.tool_implementations.web_search.clients.exa_client import ExaClient


@dataclass
class _Result:
    link: str


@dataclass
class _Content:
    link: str
    title: str
    full_content: str
    scrape_successful: bool = True


class _Provider:
    def __init__(self, results: Mapping[str, list[str]], pages: Mapping[str, str]):
        self.results = results
        self.pages = pages
        self.queries: list[str] = []

    def search(self, query: str) -> list[_Result]:
        self.queries.append(query)
        if query not in self.results:
            raise ConnectionError("search provider unavailable")
        return [_Result(link) for link in self.results[query]]

    def contents(self, urls: list[str], preserve_source_text: bool) -> list[_Content]:
        assert preserve_source_text
        return [_Content(url, url, self.pages[url]) for url in urls]


def _collect(provider: _Provider, query: str, followup: str | None) -> dict:
    return collect_public_research(cast(ExaClient, provider), query, followup)


def _profile(person_website: str = "acme.com") -> dict:
    return {
        "status": "ready",
        "profile": {"website": "https://acme.com"},
        "provider_profile": {"name": "Ada Lovelace", "website": person_website},
    }


COMPANY = ["https://acme.com/", "https://acme.com/pricing"]
NEWS = ["https://news.example.com/acme-raises", "https://acme.com/"]


def test_public_record_query_names_the_executive_only_when_pdl_places_them_at_the_company() -> (
    None
):
    matched = public_record_query(_profile())
    elsewhere = public_record_query(_profile(person_website="other.com"))

    company_news = (
        "Recent news about the company at https://acme.com: funding, revenue, customers, "
        "product launches, partnerships, leadership and strategy changes."
    )
    assert matched == company_news + (
        " Include public interviews, talks, podcasts or articles by Ada Lovelace."
    ), "a matched executive's interviews and talks are searched"
    assert elsewhere == company_news, (
        "a PDL match at another company must not steer research about this one"
    )


def test_public_record_query_needs_a_researchable_company() -> None:
    assert public_record_query({"status": "ready", "profile": {}}) is None
    assert public_record_query(None) is None


def test_research_adds_news_sources_after_the_company_sources() -> None:
    profile = _profile()
    query, followup = public_research_query(profile), public_record_query(profile)
    assert query and followup
    provider = _Provider(
        {query: COMPANY, followup: NEWS},
        {url: f"text of {url}" for url in COMPANY + NEWS},
    )

    receipt = _collect(provider, query, followup)

    assert receipt["source_urls"] == [
        *COMPANY,
        "https://news.example.com/acme-raises",
    ], "company sources first, then only new news sources"


def test_a_long_company_page_cannot_crowd_news_out_of_the_report() -> None:
    profile = _profile()
    query, followup = public_research_query(profile), public_record_query(profile)
    assert query and followup
    pages = {url: "company detail " * 4000 for url in COMPANY}
    pages[NEWS[0]] = "Acme raised a Series B in October."
    provider = _Provider({query: COMPANY, followup: NEWS}, pages)

    receipt = _collect(provider, query, followup)

    assert "Acme raised a Series B in October." in receipt["report"]
    assert len(receipt["report"]) <= 16000
    assert receipt["truncated"] is True


def test_company_research_survives_a_failed_news_search() -> None:
    profile = _profile()
    query = public_research_query(profile)
    assert query
    provider = _Provider({query: COMPANY}, {url: "text" for url in COMPANY})

    receipt = _collect(provider, query, "query the provider rejects")

    assert receipt["source_urls"] == COMPANY


def test_company_research_without_sources_still_fails() -> None:
    provider = _Provider({"q": []}, {})

    with pytest.raises(ValueError, match="no public source URLs"):
        _collect(provider, "q", "news")


def test_interview_context_states_the_research_date() -> None:
    context = research_context(
        {
            "status": "ready",
            "report": "Acme sells anvils.",
            "source_urls": ["https://acme.com/"],
            "checked_at": 1_794_484_800.0,
        }
    )

    evidence = json.loads(context[context.index("{") :])
    assert evidence["checked_on"] == "2026-11-12"
    assert "checked_on research date" in context
