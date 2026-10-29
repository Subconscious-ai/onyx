"""Run in the native backend environment; no database or provider calls."""

import copy
import json
import unittest
from contextlib import ExitStack
from unittest.mock import MagicMock, patch
from uuid import uuid4

from celery.exceptions import Retry
from fastapi import HTTPException

from onyx.background.celery.tasks.burn2.tasks import prepare_saved_brief


class BriefModelPolicyTests(unittest.TestCase):
    def test_complete_inline_draft_still_extracts_the_latest_journey_correction(self):
        from onyx.server.query_and_chat.burn2 import api

        statements = [
            "Increase quote-to-order wins from 25% to 30% next quarter.",
            "Industrial procurement teams send a qualified RFQ, receive a quote, then place an order.",
            "Our actual observed quote-to-order win rate remains 25%.",
        ]
        cached = {
            "company": "Unknown",
            "objective": {"status": "executive", "text": statements[0]},
            "keyResults": [{"metric": "Quote-to-order wins"}],
            "journey": [
                {"id": name}
                for name in (
                    "quote_request",
                    "sales_followup",
                    "proposal_review",
                    "order_placement",
                )
            ],
            "transitions": [{"from": "quote_request", "to": "sales_followup"}],
            "model": {"inputs": [{"name": "win_rate"}]},
        }
        corrected = copy.deepcopy(cached)
        corrected["journey"] = [
            {"id": name} for name in ("qualified_rfq", "quote", "order")
        ]
        corrected["transitions"] = [
            {"from": "qualified_rfq", "to": "quote"},
            {"from": "quote", "to": "order"},
        ]
        for revalidated in (False, True):
            with self.subTest(revalidated=revalidated), ExitStack() as stack:
                saved = copy.deepcopy(cached)
                if revalidated:
                    saved["company"] = "Unconfirmed old company"
                snapshot = {
                    "persona_id": 5,
                    "last_id": 7,
                    "last_text": "The follow-up effect is unknown.<interview-brief>"
                    + json.dumps(saved)
                    + "</interview-brief>",
                    "transcript": [],
                    "statements": statements,
                }
                llm = MagicMock()
                llm.config.model_provider = "bedrock"
                call = MagicMock()
                call.function.name = "prepare_model_brief"
                call.function.arguments = json.dumps(corrected)
                llm.invoke.return_value.choice.message.tool_calls = [call]
                persona = MagicMock()
                persona.name = "Burn 2.0"
                stack.enter_context(
                    patch.dict(
                        "os.environ",
                        {
                            "BURN2_ENABLED": "true",
                            "BURN2_BRIEF_MODEL_CONFIGURATION_ID": "",
                        },
                    )
                )
                replacements = {
                    "get_cache_backend": MagicMock(),
                    "is_chat_session_processing": False,
                    "owned_snapshot": snapshot,
                    "get_persona_by_id": persona,
                    "validate_brief": copy.deepcopy(cached),
                    "check_token_rate_limits": None,
                    "get_llm_for_persona": llm,
                    "check_llm_cost_limit_for_provider": None,
                    "get_llm_token_counter": lambda _: 1,
                    "latest_saved_brief": copy.deepcopy(cached),
                }
                for name, value in replacements.items():
                    stack.enter_context(patch.object(api, name, return_value=value))
                stack.enter_context(
                    patch("onyx.db.burn2_profile.read_profile", return_value={})
                )
                stack.enter_context(
                    patch("onyx.db.burn2_research.read_research", return_value=None)
                )
                extract = stack.enter_context(
                    patch.object(
                        api,
                        "prepare_validated_brief",
                        side_effect=lambda generate, _: generate(None),
                    )
                )
                save = stack.enter_context(
                    patch.object(api, "save_brief", return_value=7)
                )
                result = api._prepare_brief(
                    api.PrepareBrief(chat_id=uuid4()), MagicMock(), MagicMock()
                )

                extract.assert_called_once()
                self.assertEqual(extract.call_args.args[1], statements)
                self.assertEqual(save.call_args.args[3], corrected)
                returned = json.loads(
                    result.message.split("<interview-brief>")[1].split(
                        "</interview-brief>"
                    )[0]
                )
                self.assertEqual(
                    [stage["id"] for stage in returned["journey"]],
                    ["qualified_rfq", "quote", "order"],
                )
                payload = json.loads(llm.invoke.call_args.kwargs["prompt"][1].content)
                self.assertEqual(
                    payload["executive_messages"][1]["text"], statements[1]
                )
                self.assertEqual(
                    payload["executive_messages"][-1]["text"], statements[-1]
                )

    def test_revalidated_cache_must_be_saved_before_reporting_completion(self):
        import json

        from onyx.server.query_and_chat.burn2 import api

        saved = {"objective": {"status": "assumption"}}
        repaired = {
            "objective": {"status": "executive"},
            "keyResults": [{"metric": "Contribution"}],
            "model": {"inputs": [{"name": "Leads"}]},
        }
        snapshot = {
            "persona_id": 5,
            "last_id": 1,
            "last_text": "Answer<interview-brief>"
            + json.dumps(saved)
            + "</interview-brief>",
            "statements": ["Our goal is increasing contribution."],
        }
        persona = MagicMock(name="persona")
        persona.name = "Burn 2.0"
        with (
            patch.dict(
                "os.environ",
                {"BURN2_ENABLED": "true", "BURN2_BACKGROUND_PREPARATION": "true"},
            ),
            patch.object(api, "owned_snapshot", return_value=snapshot),
            patch.object(api, "get_persona_by_id", return_value=persona),
            patch.object(api, "validate_brief", return_value=repaired),
        ):
            result = api.read_executive_brief(uuid4(), MagicMock(), MagicMock())
        self.assertEqual(result, {"saved": False, "background": False})

    def test_extraction_honors_native_model_reasoning_default(self):
        from onyx.llm.models import ReasoningEffort, resolve_reasoning_effort
        from onyx.server.query_and_chat.burn2 import api

        llm = MagicMock()
        llm.config.model_provider = "bedrock"
        llm.config.reasoning_effort_default = ReasoningEffort.LOW
        call = MagicMock()
        call.function.name = "prepare_model_brief"
        call.function.arguments = "{}"
        llm.invoke.return_value.choice.message.tool_calls = [call]
        snapshot = {
            "persona_id": 5,
            "last_id": 1,
            "last_text": "A saved answer",
            "transcript": [],
            "statements": ["Improve customer retention"],
        }
        persona = MagicMock()
        persona.name = "Burn 2.0"
        with ExitStack() as stack:
            stack.enter_context(
                patch.dict(
                    "os.environ",
                    {"BURN2_ENABLED": "true", "BURN2_BRIEF_MODEL_CONFIGURATION_ID": ""},
                )
            )
            replacements = {
                "get_cache_backend": MagicMock(),
                "is_chat_session_processing": False,
                "owned_snapshot": snapshot,
                "get_persona_by_id": persona,
                "check_token_rate_limits": None,
                "get_llm_for_persona": llm,
                "check_llm_cost_limit_for_provider": None,
                "get_llm_token_counter": lambda _: 1,
                "save_brief": 1,
            }
            for name, value in replacements.items():
                stack.enter_context(patch.object(api, name, return_value=value))
            stack.enter_context(
                patch("onyx.db.burn2_profile.read_profile", return_value={})
            )
            stack.enter_context(
                patch("onyx.db.burn2_research.read_research", return_value=None)
            )
            stack.enter_context(
                patch.object(
                    api,
                    "latest_saved_brief",
                    return_value={
                        "company": "Unknown",
                        "objective": {"status": "executive"},
                        "model": {"equation": {"text": "Old assumption"}},
                    },
                )
            )
            stack.enter_context(
                patch.object(
                    api,
                    "prepare_validated_brief",
                    side_effect=lambda generate, _: generate(None),
                )
            )
            result = api._prepare_brief(
                api.PrepareBrief(chat_id=uuid4()), MagicMock(), MagicMock()
            )
        self.assertTrue(result.saved)
        import json

        payload = json.loads(llm.invoke.call_args.kwargs["prompt"][1].content)
        self.assertNotIn("company", payload["previous_draft"])
        self.assertNotIn("equation", payload["previous_draft"]["model"])
        requested = llm.invoke.call_args.kwargs.get(
            "reasoning_effort", ReasoningEffort.AUTO
        )
        resolved = resolve_reasoning_effort(
            requested,
            default=llm.config.reasoning_effort_default,
            user_default=None,
            maximum=None,
        )
        self.assertEqual(resolved, ReasoningEffort.LOW)


class BriefLibrarySaveTests(unittest.TestCase):
    def test_browser_preparation_saves_the_library_before_reporting_success(self):
        from onyx.server.query_and_chat.burn2 import api

        body = api.PrepareBrief(chat_id=uuid4())
        user, db = MagicMock(), MagicMock()
        prepared = api.PreparedBrief(message_id=7, saved=True, message="Saved draft")
        events = []
        with (
            patch.object(api, "get_cache_backend"),
            patch("onyx.db.causl_workspace.read_causl_binding", return_value=None),
            patch.object(
                api,
                "_prepare_brief",
                side_effect=lambda *_: events.append("native") or prepared,
            ),
            patch(
                "onyx.server.query_and_chat.causl.context.send_interview_brief",
                side_effect=lambda *_: events.append("library"),
            ) as send,
        ):
            result = api.prepare_brief(body, user, db)

        self.assertIs(result, prepared)
        self.assertEqual(events, ["native", "library"])
        send.assert_called_once_with(db, user, body.chat_id)

    def test_complete_undelivered_brief_is_not_reported_saved_by_read_only_get(self):
        from onyx.server.query_and_chat.burn2 import api

        saved = {"objective": {"status": "executive"}}
        snapshot = {
            "persona_id": 5,
            "last_id": 7,
            "last_text": "Answer<interview-brief>"
            + json.dumps(saved)
            + "</interview-brief>",
            "statements": [],
            "digest": "latest-digest",
        }
        persona = MagicMock()
        persona.name = "Burn 2.0"
        binding = MagicMock(mode="interview", brief_digest="older-digest")
        with (
            patch.dict("os.environ", {"BURN2_ENABLED": "true"}),
            patch.object(api, "owned_snapshot", return_value=snapshot),
            patch.object(api, "get_persona_by_id", return_value=persona),
            patch.object(api, "validate_brief", return_value=saved),
            patch.object(api, "needs_completion", return_value=False),
            patch("onyx.db.causl_workspace.read_causl_binding", return_value=binding),
            patch(
                "onyx.server.query_and_chat.causl.context.send_interview_brief"
            ) as send,
        ):
            result = api.read_executive_brief(uuid4(), MagicMock(), MagicMock())
        self.assertEqual(result, {"saved": False, "background": False})
        send.assert_not_called()

    def test_native_complete_unbound_brief_is_not_reported_saved(self):
        from onyx.server.query_and_chat.burn2 import api

        saved = {"objective": {"status": "executive"}}
        persona = MagicMock()
        persona.name = "Burn 2.0"
        snapshot = {
            "persona_id": 5,
            "last_text": "<interview-brief>" + json.dumps(saved) + "</interview-brief>",
            "statements": [],
            "digest": "latest",
            "last_id": 7,
        }
        with (
            patch.dict(
                "os.environ",
                {"BURN2_ENABLED": "true", "BURN2_RESEARCH_PERSONA_ID": "11"},
            ),
            patch.object(api, "owned_snapshot", return_value=snapshot),
            patch.object(api, "get_persona_by_id", return_value=persona),
            patch.object(api, "validate_brief", return_value=saved),
            patch.object(api, "needs_completion", return_value=False),
            patch("onyx.db.causl_workspace.read_causl_binding", return_value=None),
        ):
            result = api.read_executive_brief(uuid4(), MagicMock(), MagicMock())
        self.assertEqual(result, {"saved": False, "background": False})

    def test_research_ready_resends_unchanged_prepared_brief_without_extraction(self):
        from onyx.server.query_and_chat.burn2 import api

        saved = {"objective": {"status": "executive"}}
        snapshot = {
            "persona_id": 5,
            "last_id": 7,
            "last_text": "Answer<interview-brief>"
            + json.dumps(saved)
            + "</interview-brief>",
            "statements": [],
            "digest": "delivered-digest",
        }
        persona = MagicMock()
        persona.name = "Burn 2.0"
        binding = MagicMock(mode="interview", brief_digest="delivered-digest")
        body, user, db = api.PrepareBrief(chat_id=uuid4()), MagicMock(), MagicMock()
        with (
            patch.dict("os.environ", {"BURN2_ENABLED": "true"}),
            patch.object(api, "get_cache_backend"),
            patch.object(api, "is_chat_session_processing", return_value=False),
            patch.object(api, "owned_snapshot", return_value=snapshot),
            patch.object(api, "get_persona_by_id", return_value=persona),
            patch.object(api, "validate_brief", return_value=saved),
            patch("onyx.db.causl_workspace.read_causl_binding", return_value=binding),
            patch.object(api, "_prepare_brief") as extract,
            patch(
                "onyx.server.query_and_chat.causl.context.send_interview_brief"
            ) as send,
        ):
            result = api.prepare_brief(body, user, db)
        extract.assert_not_called()
        send.assert_called_once_with(db, user, body.chat_id)
        self.assertEqual(result.message, snapshot["last_text"])
        self.assertTrue(result.saved)

    def test_library_failure_cannot_be_reported_as_a_saved_model_brief(self):
        from onyx.error_handling.error_codes import OnyxErrorCode
        from onyx.error_handling.exceptions import OnyxError
        from onyx.server.query_and_chat.burn2 import api

        failure = OnyxError(OnyxErrorCode.BAD_GATEWAY, "Library unavailable")
        with (
            patch.object(api, "get_cache_backend") as cache,
            patch("onyx.db.causl_workspace.read_causl_binding", return_value=None),
            patch.object(
                api,
                "_prepare_brief",
                return_value=api.PreparedBrief(
                    message_id=7, saved=True, message="Draft"
                ),
            ),
            patch(
                "onyx.server.query_and_chat.causl.context.send_interview_brief",
                side_effect=failure,
            ),
            self.assertRaises(OnyxError) as caught,
        ):
            api.prepare_brief(
                api.PrepareBrief(chat_id=uuid4()), MagicMock(), MagicMock()
            )

        self.assertIs(caught.exception, failure)
        cache.return_value.lock.return_value.release.assert_called_once()


class BriefBackgroundTests(unittest.TestCase):
    def invoke(self, failure=None, allowed=True, retries=0, provider_failures=0):
        arguments = {
            "user_id": str(uuid4()),
            "chat_id": str(uuid4()),
            "tenant_id": "public",
            "provider_failures": provider_failures,
        }
        with (
            patch.dict("os.environ", {"BURN2_BACKGROUND_PREPARATION": "true"}),
            patch(
                "onyx.background.celery.tasks.burn2.tasks.get_current_tenant_id",
                return_value="public",
            ),
            patch(
                "onyx.background.celery.tasks.burn2.tasks.get_session_with_current_tenant"
            ) as session,
            patch("onyx.auth.permissions.has_global_permission", return_value=allowed),
            patch(
                "onyx.server.query_and_chat.burn2.api.prepare_brief",
                side_effect=failure,
            ) as prepare,
            patch.object(prepare_saved_brief, "retry", side_effect=Retry()) as retry,
        ):
            session.return_value.__enter__.return_value.get.return_value = MagicMock(
                is_active=True
            )
            prepare_saved_brief.push_request(retries=retries, kwargs=arguments)
            try:
                prepare_saved_brief.run(**arguments)
            except Retry:
                pass
            finally:
                prepare_saved_brief.pop_request()
            return prepare, retry

    def native_retry(
        self, status: int, retries: int, provider_failures: int | None = None
    ) -> None:
        """Exercise Celery's retry limit/signature; isolate storage and the broker."""
        arguments: dict[str, str | int] = {
            "user_id": str(uuid4()),
            "chat_id": str(uuid4()),
            "tenant_id": "public",
        }
        if provider_failures is not None:
            arguments["provider_failures"] = provider_failures
        with (
            patch.dict("os.environ", {"BURN2_BACKGROUND_PREPARATION": "true"}),
            patch(
                "onyx.background.celery.tasks.burn2.tasks.get_current_tenant_id",
                return_value="public",
            ),
            patch(
                "onyx.background.celery.tasks.burn2.tasks.get_session_with_current_tenant"
            ) as session,
            patch("onyx.auth.permissions.has_global_permission", return_value=True),
            patch(
                "onyx.server.query_and_chat.burn2.api.prepare_brief",
                side_effect=HTTPException(status, "Synthetic transient failure"),
            ),
        ):
            session.return_value.__enter__.return_value.get.return_value = MagicMock(
                is_active=True
            )
            prepare_saved_brief.push_request(
                id=str(uuid4()),
                retries=retries,
                kwargs=arguments,
                called_directly=False,
                is_eager=True,
            )
            try:
                prepare_saved_brief.run(**arguments)
            finally:
                prepare_saved_brief.pop_request()

    def test_native_retry_waits_past_the_75_second_lock_lifetime(self) -> None:
        with self.assertRaises(Retry) as retried:
            self.native_retry(409, retries=15)
        self.assertEqual(retried.exception.when, 5)

    def test_native_provider_retry_is_not_consumed_by_lock_contention(self) -> None:
        with self.assertRaises(Retry) as retried:
            self.native_retry(502, retries=8)
        self.assertEqual(retried.exception.when, 5)
        self.assertEqual(retried.exception.sig.kwargs["provider_failures"], 1)
        self.assertEqual(retried.exception.sig.kwargs["tenant_id"], "public")

    def test_native_provider_backoff_counts_provider_failures_only(self) -> None:
        for failures, delay in enumerate((5, 10, 20, 40)):
            with self.subTest(failures=failures):
                with self.assertRaises(Retry) as retried:
                    self.native_retry(
                        502, retries=8 + failures, provider_failures=failures
                    )
                self.assertEqual(retried.exception.when, delay)
                self.assertEqual(
                    retried.exception.sig.kwargs["provider_failures"], failures + 1
                )
        with self.assertRaises(HTTPException) as exhausted:
            self.native_retry(502, retries=12, provider_failures=4)
        self.assertEqual(exhausted.exception.status_code, 502)

    def test_native_contention_retries_remain_bounded_after_provider_failures(
        self,
    ) -> None:
        with self.assertRaises(HTTPException) as exhausted:
            self.native_retry(409, retries=20, provider_failures=4)
        self.assertEqual(exhausted.exception.status_code, 409)

    def test_transient_lock_and_provider_errors_schedule_a_bounded_retry(self):
        for status in (409, 502):
            with self.subTest(status=status):
                prepare, retry = self.invoke(HTTPException(status, "Synthetic error"))
                prepare.assert_called_once()
                retry.assert_called_once()
                self.assertEqual(retry.call_args.kwargs["countdown"], 5)
                self.assertEqual(retry.call_args.kwargs["expires"], 120)
        self.assertEqual(prepare_saved_brief.max_retries, 4)

    def test_library_transport_error_uses_existing_bounded_retry(self):
        from onyx.error_handling.error_codes import OnyxErrorCode
        from onyx.error_handling.exceptions import OnyxError

        _, retry = self.invoke(
            OnyxError(OnyxErrorCode.BAD_GATEWAY, "Library unavailable")
        )
        retry.assert_called_once()
        self.assertEqual(retry.call_args.kwargs["expires"], 120)

    def test_waiting_for_another_turn_does_not_back_off_like_a_provider_failure(self):
        # An older extraction can hold the lock through several quick answers.
        # The newest answer must retry promptly once that lock becomes free.
        _, busy = self.invoke(HTTPException(409, "Preparation in progress"), retries=3)
        self.assertLessEqual(busy.call_args.kwargs["countdown"], 5)
        self.assertGreaterEqual(busy.call_args.kwargs["max_retries"], 12)
        _, provider = self.invoke(
            HTTPException(502, "Provider unavailable"), retries=3, provider_failures=3
        )
        self.assertEqual(provider.call_args.kwargs["countdown"], 40)

    def test_permission_failure_does_not_retry_or_prepare(self):
        prepare, retry = self.invoke(allowed=False)
        prepare.assert_not_called()
        retry.assert_not_called()

    def test_success_does_not_repeat_preparation(self):
        prepare, retry = self.invoke()
        prepare.assert_called_once()
        retry.assert_not_called()

    def test_nontransient_error_does_not_retry(self):
        _, retry = self.invoke(HTTPException(404, "Not found"))
        retry.assert_not_called()


if __name__ == "__main__":
    unittest.main()
