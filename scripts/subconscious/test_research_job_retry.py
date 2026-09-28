"""Native-runtime worker regressions; mocks all storage, cache and provider calls."""

import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from celery.exceptions import Retry

from onyx.background.celery.tasks.burn2.tasks import research_company

MODULE = "onyx.background.celery.tasks.burn2.tasks"


class ResearchJobRetryTests(unittest.TestCase):
    def setUp(self):
        self.owner = str(uuid4())
        self.state = {
            "job_id": "client-job",
            "status": "queued",
            "query": "Client query",
            "checked_at": 1000,
        }
        self.lock = MagicMock()
        self.lock.acquire.return_value = True
        self.lock.owned.return_value = True
        self.patches = [
            patch.dict("os.environ", {"BURN2_ENABLED": "true"}),
            patch(f"{MODULE}.get_current_tenant_id", return_value="public"),
            patch(f"{MODULE}.time.time", return_value=1001),
            patch(f"{MODULE}.get_cache_backend"),
            patch(f"{MODULE}.read_research", side_effect=lambda _: dict(self.state)),
            patch(f"{MODULE}.read_profile", return_value={}),
            patch(f"{MODULE}.public_research_query", return_value="Client query"),
            patch(f"{MODULE}.save_research", create=True),
            patch(
                f"{MODULE}.research_connection",
                return_value=("https://example.com", {}, None),
            ),
            patch(f"{MODULE}.call_mcp_tool", return_value="provider response"),
            patch(
                f"{MODULE}.research_receipt",
                return_value={
                    "report": "Client report",
                    "source_urls": ["https://example.com/client"],
                },
            ),
        ]
        started = [p.start() for p in self.patches]
        for p in self.patches:
            self.addCleanup(p.stop)
        (
            self.cache,
            self.read,
            self.profile,
            self.query,
            self.save,
            self.connection,
            self.call,
            self.receipt,
        ) = started[3:]
        self.cache.return_value.lock.return_value = self.lock

        def save(_owner, value):
            self.state = dict(value)

        self.save.side_effect = save

        def update(owner, value, *, job_id, status):
            if self.state["job_id"] != job_id or self.state["status"] != status:
                return False
            self.save(owner, value)
            return True

        conditional = patch(
            f"{MODULE}.update_research_if_current", side_effect=update, create=True
        )
        conditional.start()
        self.addCleanup(conditional.stop)

    def invoke(self):
        research_company.run(
            user_id=self.owner, persona_id=5, job_id="client-job", tenant_id="public"
        )

    def test_duplicate_worker_retries_then_processes_latest_job(self):
        self.lock.acquire.side_effect = [False, True]
        with patch.object(research_company, "retry", side_effect=Retry()) as retry:
            with self.assertRaises(Retry):
                self.invoke()
            retry.assert_called_once()
            self.assertEqual(retry.call_args.kwargs["countdown"], 5)
            self.assertLessEqual(retry.call_args.kwargs["expires"], 300)
        self.call.assert_not_called()
        self.invoke()
        self.call.assert_called_once()
        self.assertEqual(self.call.call_args.args[2], {"query": "Client query"})
        self.assertEqual(self.save.call_args.args[1]["status"], "ready")
        self.lock.release.assert_called_once()

    def test_superseded_company_work_does_not_block_a_new_job(self):
        old_lock = MagicMock()
        old_lock.acquire.return_value = False
        self.cache.return_value.lock.side_effect = lambda key, **_kwargs: (
            self.lock if key.endswith(":client-job") else old_lock
        )
        with patch.object(research_company, "retry", side_effect=Retry()):
            self.invoke()
        self.call.assert_called_once()
        self.assertEqual(self.save.call_args.args[1]["status"], "ready")

    def test_replaced_or_completed_jobs_never_retry_or_call_provider(self):
        self.lock.acquire.return_value = False
        for change in (
            {"job_id": "newer-job"},
            {"status": "ready"},
            {"query": "Older company"},
        ):
            original = dict(self.state)
            self.state.update(change)
            with patch.object(research_company, "retry", side_effect=Retry()) as retry:
                self.invoke()
                retry.assert_not_called()
            self.state = original
        self.call.assert_not_called()

    def test_job_changed_after_lock_does_not_call_provider(self):
        self.read.side_effect = [
            dict(self.state),
            {**self.state, "job_id": "newer-job"},
        ]
        self.invoke()
        self.call.assert_not_called()
        self.lock.release.assert_called_once()

    def test_exhausted_or_expired_wait_is_reported_without_provider_work(self):
        self.lock.acquire.return_value = False
        self.assertEqual(research_company.max_retries, 12)
        for retries, checked_at in ((12, 1000), (0, 600)):
            self.state.update(status="queued", checked_at=checked_at)
            research_company.push_request(retries=retries)
            try:
                with patch.object(
                    research_company, "retry", side_effect=Retry()
                ) as retry:
                    self.invoke()
                    retry.assert_not_called()
                    self.assertEqual(
                        self.save.call_args.args[1]["status"], "unavailable"
                    )
            finally:
                research_company.pop_request()
        self.call.assert_not_called()

    def test_replacement_between_profile_check_and_write_preserves_new_job(self):
        for boundary in ("expiry", "running", "result"):
            with self.subTest(boundary=boundary):
                self.state = {
                    "job_id": "client-job",
                    "query": "Client query",
                    "status": "queued",
                    "checked_at": 1000,
                }
                if boundary == "expiry":
                    self.state["checked_at"] = 600
                replacement = {
                    **self.state,
                    "job_id": "newer-job",
                    "query": "Another client",
                    "checked_at": 1001,
                }
                calls = 0
                replace_at = {"expiry": 1, "running": 2, "result": 3}[boundary]

                def replace_after_snapshot(
                    _owner, replace_at=replace_at, replacement=replacement
                ):
                    nonlocal calls
                    calls += 1
                    if calls == replace_at:
                        self.state = dict(replacement)
                    return {}

                self.profile.side_effect = replace_after_snapshot
                self.invoke()
                self.assertEqual(self.state, replacement)

    def test_replacement_between_retry_exhaustion_check_and_write_is_preserved(self):
        self.lock.acquire.return_value = False
        replacement = {**self.state, "job_id": "newer-job", "query": "Another client"}
        calls = 0

        def replace_after_snapshot(_owner):
            nonlocal calls
            snapshot = dict(self.state)
            calls += 1
            if calls == 2:
                self.state = dict(replacement)
            return snapshot

        self.read.side_effect = replace_after_snapshot
        research_company.push_request(retries=12)
        try:
            self.invoke()
        finally:
            research_company.pop_request()
        self.assertEqual(self.state, replacement)

    def test_new_company_replacing_job_during_provider_call_keeps_newer_state(self):
        def replace(*_args, **_kwargs):
            self.state = {
                **self.state,
                "job_id": "newer-job",
                "query": "Another client",
            }
            return "provider response"

        self.call.side_effect = replace
        self.invoke()
        self.assertEqual(self.save.call_count, 1)
        self.assertEqual(self.save.call_args.args[1]["status"], "running")


if __name__ == "__main__":
    unittest.main()
