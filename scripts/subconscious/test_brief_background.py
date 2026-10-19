"""Run in the native backend environment; no database or provider calls."""

import copy
import hashlib
import json
import unittest
from contextlib import ExitStack
from unittest.mock import MagicMock, patch
from uuid import uuid4

from celery.exceptions import Retry
from fastapi import HTTPException
from redis.exceptions import RedisError

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
                    "transcript": [
                        {"id": 7, "type": "assistant", "message": "Saved answer"}
                    ],
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
                stack.enter_context(
                    patch(
                        "onyx.db.causl_workspace.read_causl_binding", return_value=None
                    )
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
            "transcript": [{"id": 1, "type": "assistant", "message": "A saved answer"}],
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
                patch("onyx.db.causl_workspace.read_causl_binding", return_value=None)
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

    def test_library_write_uses_validated_brief_and_preserves_native_source_ids(self):
        self.library_preparation()

    def test_library_failure_cannot_save_a_completed_native_projection(self):
        from onyx.error_handling.error_codes import OnyxErrorCode
        from onyx.error_handling.exceptions import OnyxError

        self.library_preparation(OnyxError(OnyxErrorCode.BAD_GATEWAY))

    def test_worker_prepares_native_projection_without_a_request_identity(self):
        self.library_preparation(publish_memory=False)

    def test_optional_marker_failure_cannot_lose_a_saved_projection(self):
        self.library_preparation(marker_failure=RedisError("Cache unavailable"))

    def library_preparation(
        self, library_failure=None, *, publish_memory=True, marker_failure=None
    ):
        from onyx.server.query_and_chat.burn2 import api

        user, db, cache = MagicMock(), MagicMock(), MagicMock()
        cache.set.side_effect = marker_failure
        user.id = uuid4()
        chat_id = uuid4()
        transcript = [
            {"id": 31, "type": "user", "message": "Raise conversion to 7%."},
            {"id": 34, "type": "tool", "message": "Private tool transport"},
            {"id": 32, "type": "assistant", "message": "The baseline stays unknown."},
        ]
        snapshot = {
            "persona_id": 5,
            "last_id": 32,
            "last_text": transcript[-1]["message"],
            "transcript": transcript,
            "statements": [transcript[0]["message"]],
        }
        brief = {"objective": {"status": "executive", "text": transcript[0]["message"]}}
        persona, llm, binding = MagicMock(), MagicMock(), MagicMock()
        persona.name = "Burn 2.0"
        llm.config.model_provider = "bedrock"
        order = []
        with ExitStack() as stack:
            stack.enter_context(
                patch.dict(
                    "os.environ",
                    {"BURN2_ENABLED": "true", "BURN2_BRIEF_MODEL_CONFIGURATION_ID": ""},
                )
            )
            for name, value in {
                "get_cache_backend": cache,
                "is_chat_session_processing": False,
                "owned_snapshot": snapshot,
                "get_persona_by_id": persona,
                "check_token_rate_limits": None,
                "get_llm_for_persona": llm,
                "check_llm_cost_limit_for_provider": None,
                "get_llm_token_counter": lambda _: 1,
                "latest_saved_brief": None,
            }.items():
                stack.enter_context(patch.object(api, name, return_value=value))
            stack.enter_context(
                patch("onyx.db.burn2_profile.read_profile", return_value={})
            )
            stack.enter_context(
                patch("onyx.db.burn2_research.read_research", return_value=None)
            )
            stack.enter_context(
                patch(
                    "onyx.db.causl_workspace.read_causl_binding", return_value=binding
                )
            )

            def validated(*_):
                order.append("validate")
                return brief

            stack.enter_context(
                patch.object(api, "prepare_validated_brief", side_effect=validated)
            )

            def publish(*_, **__):
                order.append("publish")
                if library_failure is not None:
                    raise library_failure
                return {"statements": 1, "stages": 0, "transitions": 0}

            publish_mock = stack.enter_context(
                patch(
                    "onyx.server.query_and_chat.causl.context.save_interview_context",
                    side_effect=publish,
                )
            )
            save = stack.enter_context(
                patch.object(
                    api, "save_brief", side_effect=lambda *_: order.append("save") or 32
                )
            )
            if library_failure is not None:
                with self.assertRaises(type(library_failure)):
                    api._prepare_brief(api.PrepareBrief(chat_id=chat_id), user, db)
                save.assert_not_called()
                cache.set.assert_not_called()
                self.assertEqual(order, ["validate", "publish"])
            else:
                result = api._prepare_brief(
                    api.PrepareBrief(chat_id=chat_id),
                    user,
                    db,
                    publish_memory=publish_memory,
                )
                self.assertTrue(result.saved)
                prepared_transcript = copy.deepcopy(transcript)
                prepared_transcript[-1]["message"] = result.message
                cache.set.assert_called_once_with(
                    api._prepared_brief_key(api.PrepareBrief(chat_id=chat_id), user),
                    hashlib.sha256(
                        json.dumps(prepared_transcript, sort_keys=True).encode()
                    ).hexdigest(),
                    ex=300,
                )
                if not publish_memory:
                    self.assertIsNone(result.memory_saved)
                    self.assertEqual(order, ["validate", "save"])
                    publish_mock.assert_not_called()
                    return
                self.assertTrue(result.memory_saved)
                self.assertEqual(order, ["validate", "publish", "save"])
                sent = publish_mock.call_args.args[3]
                self.assertEqual(len(sent), 2)
                self.assertEqual(sent[0], transcript[0])
                self.assertEqual(sent[1]["id"], 32)
                self.assertEqual(sent[1]["type"], "assistant")
                self.assertTrue(
                    sent[1]["message"].startswith(transcript[-1]["message"])
                )
                self.assertEqual(
                    json.loads(
                        sent[1]["message"]
                        .split("<interview-brief>")[1]
                        .split("</interview-brief>")[0]
                    ),
                    brief,
                )
                self.assertEqual(
                    transcript[-1]["message"], "The baseline stays unknown."
                )

    def test_only_a_server_prepared_transcript_can_skip_extraction(self):
        for digest in (
            None,
            b"another-transcript",
            b"prepared-transcript",
            RedisError("Cache unavailable"),
        ):
            with self.subTest(digest=digest):
                self.cached_preparation(digest)

    def test_new_turn_during_cached_publication_returns_conflict(self):
        self.cached_preparation(b"prepared-transcript", changed=True)

    def cached_preparation(self, digest, *, changed=False):
        from onyx.server.query_and_chat.burn2 import api

        user, db, cache = MagicMock(), MagicMock(), MagicMock()
        user.id = uuid4()
        if isinstance(digest, RedisError):
            cache.get.side_effect = digest
        else:
            cache.get.return_value = digest
        snapshot = {
            "last_id": 32,
            "last_text": "<interview-brief>{}</interview-brief>",
            "digest": "prepared-transcript",
            "statements": ["Improve conversion"],
        }
        current = {"saved": True, "message_id": 32, "message": snapshot["last_text"]}
        final = {**snapshot, "digest": "new-turn"} if changed else snapshot
        result = api.PreparedBrief(message_id=32, saved=True, message="extracted")
        with (
            patch.object(api, "get_cache_backend", return_value=cache),
            patch.object(api, "is_chat_session_processing", return_value=False),
            patch.object(api, "read_executive_brief", return_value=current),
            patch.object(api, "owned_snapshot", side_effect=[snapshot, final]),
            patch.object(api, "validate_brief", return_value={}),
            patch.object(api, "_publish_interview", return_value=True) as publish,
            patch.object(api, "_prepare_brief", return_value=result) as extract,
            patch("onyx.db.burn2_profile.read_profile", return_value={}),
            patch("onyx.db.burn2_research.read_research", return_value=None),
        ):
            body = api.PrepareBrief(chat_id=uuid4())
            if changed:
                with self.assertRaises(HTTPException) as error:
                    api._locked_prepare(body, user, db, publish_memory=True)
                self.assertEqual(error.exception.status_code, 409)
                extract.assert_not_called()
            else:
                prepared = api._locked_prepare(body, user, db, publish_memory=True)
                if digest == b"prepared-transcript":
                    self.assertTrue(prepared.memory_saved)
                    publish.assert_called_once()
                    extract.assert_not_called()
                else:
                    self.assertEqual(prepared, result)
                    extract.assert_called_once_with(body, user, db, publish_memory=True)
                    publish.assert_not_called()


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
                "onyx.server.query_and_chat.burn2.api.prepare_background_brief",
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
                "onyx.server.query_and_chat.burn2.api.prepare_background_brief",
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
