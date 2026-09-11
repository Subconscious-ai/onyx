"""The structured handoff must fail closed before persistence."""

import unittest

from onyx.server.query_and_chat.burn2.validation import validate_brief


class StructuredBriefTest(unittest.TestCase):
    def test_invalid_generated_links_get_one_repair_before_persistence(self):
        from onyx.server.query_and_chat.burn2.validation import prepare_validated_brief

        attempts = []

        def generate(feedback):
            attempts.append(feedback)
            value = self.brief()
            if len(attempts) == 1:
                value["transitions"] = [
                    {
                        "id": "invalid",
                        "from": "missing",
                        "to": "also_missing",
                        "behavior": {"text": "Buys", "status": "assumption"},
                        "metric": "Purchase rate",
                    }
                ]
            return value

        result = prepare_validated_brief(
            generate, ["The objective is increasing renewals."]
        )
        self.assertEqual(result["transitions"], [])
        self.assertEqual(attempts, [None, "Unknown behavior transition endpoint"])

    def test_repeated_invalid_extraction_fails_without_an_infinite_retry_or_fallback(
        self,
    ):
        from onyx.server.query_and_chat.burn2.validation import prepare_validated_brief

        attempts = []

        def generate(feedback):
            attempts.append(feedback)
            raise ValueError("Structured brief was not returned")

        with self.assertRaisesRegex(ValueError, "Structured brief was not returned"):
            prepare_validated_brief(generate, ["The objective is increasing renewals."])
        self.assertEqual(len(attempts), 2)

    def test_provider_outage_is_not_retried_as_a_schema_repair(self):
        from onyx.server.query_and_chat.burn2.validation import prepare_validated_brief

        attempts = []

        def generate(feedback):
            attempts.append(feedback)
            raise TimeoutError("Provider unavailable")

        with self.assertRaises(TimeoutError):
            prepare_validated_brief(generate, ["The objective is increasing renewals."])
        self.assertEqual(attempts, [None])

    def brief(self):
        return {
            "version": 2,
            "company": "Example",
            "objective": {
                "text": "Grow renewal",
                "status": "executive",
                "quote": "The objective is increasing renewals.",
            },
            "horizon": "Unknown",
            "journey": [],
            "keyResults": [],
            "transitions": [],
            "model": {
                "equation": {
                    "text": "Eligible accounts times renewal",
                    "status": "executive",
                    "quote": "The objective is increasing renewals.",
                },
                "inputs": [],
                "gaps": [],
            },
            "interventions": [],
            "conflicts": [],
        }

    def test_blank_horizon_is_rejected_before_frontend_readback(self):
        value = self.brief()
        value["horizon"] = ""
        with self.assertRaises(ValueError):
            validate_brief(value, ["The objective is increasing renewals."])

    def test_literal_stated_targets_are_sourced_without_becoming_baselines(self):
        brief = self.brief()
        brief["keyResults"] = [
            {
                "id": "revenue",
                "metric": "Annual revenue",
                "unit": "USD",
                "direction": "increase",
                "baseline": {"text": "Unknown", "status": "unknown"},
                "target": {
                    "text": "$4 million in annual consulting revenue",
                    "status": "assumption",
                },
                "deadline": {"text": "by December 2027", "status": "assumption"},
                "journeyIds": [],
            }
        ]
        source = (
            "The objective is $4 million in annual consulting revenue by December 2027."
        )
        result = validate_brief(brief, [source])
        self.assertEqual(result["keyResults"][0]["target"]["status"], "executive")
        self.assertEqual(result["keyResults"][0]["target"]["quote"], source)
        self.assertEqual(result["keyResults"][0]["baseline"]["status"], "unknown")
        scenario = validate_brief(brief, ["Hypothetical scenario: " + source])
        self.assertEqual(scenario["keyResults"][0]["target"]["status"], "assumption")

    def test_source_indices_copy_original_evidence_instead_of_generated_quotes(self):
        brief = self.brief()
        brief["objective"] = {
            "text": "Improve renewal",
            "status": "executive",
            "sourceMessageIndex": 0,
        }
        source = "The objective is increasing annual renewal to 95 percent."
        result = validate_brief(brief, [source])
        self.assertEqual(result["objective"]["quote"], source)
        self.assertEqual(result["objective"]["status"], "executive")
        brief["objective"]["sourceMessageIndex"] = 99
        with self.assertRaises(ValueError):
            validate_brief(brief, [source])

    def test_hypothesis_never_becomes_an_observation(self):
        value = self.brief()
        result = validate_brief(
            value, ["Assume a scenario. The objective is increasing renewals."]
        )
        self.assertEqual(result["objective"]["status"], "assumption")
        self.assertEqual(result["model"]["equation"]["status"], "assumption")

    def test_missing_protocol_fields_and_dangling_links_fail(self):
        value = self.brief()
        del value["model"]
        with self.assertRaises(ValueError):
            validate_brief(value, [])
        value = self.brief()
        value["transitions"] = [
            {
                "id": "bad",
                "from": "a",
                "to": "b",
                "behavior": {"text": "Buys", "status": "assumption"},
                "metric": "Purchase rate",
            }
        ]
        with self.assertRaises(ValueError):
            validate_brief(value, [])

    def test_actual_quote_survives_without_promoting_a_proposed_equation(self):
        result = validate_brief(self.brief(), ["The objective is increasing renewals."])
        self.assertEqual(result["objective"]["status"], "executive")
        self.assertEqual(result["model"]["equation"]["status"], "assumption")

    def test_null_optional_evidence_is_missing_not_a_claim(self):
        value = self.brief()
        value["objective"]["url"] = None
        value["model"]["equation"]["quote"] = None
        result = validate_brief(value, ["The objective is increasing renewals."])
        self.assertNotIn("url", result["objective"])
        self.assertEqual(result["model"]["equation"]["status"], "assumption")

    def test_short_exact_scalar_keeps_full_original_source_without_accepting_a_paraphrase(
        self,
    ):
        value = self.brief()
        value["objective"] = {
            "text": "$10 million",
            "quote": "$10 million",
            "status": "executive",
        }
        source = "The objective is $10 million by December 2027."
        result = validate_brief(value, [source])
        self.assertEqual(result["objective"]["status"], "executive")
        self.assertEqual(result["objective"]["quote"], source)
        value["objective"]["text"] = "Observed annual revenue of $10 million"
        self.assertEqual(
            validate_brief(value, [source])["objective"]["status"], "assumption"
        )


if __name__ == "__main__":
    unittest.main()


class CompletionTest(unittest.TestCase):
    def test_stated_numeric_objective_cannot_cache_missing_key_results(self):
        from onyx.server.query_and_chat.burn2.validation import needs_completion

        value = {
            "objective": {"status": "executive", "text": "95 percent annual renewal"},
            "keyResults": [],
            "model": {"inputs": []},
        }
        self.assertTrue(needs_completion(value))
        value["objective"]["text"] = "Objective unknown"
        value["objective"]["status"] = "unknown"
        self.assertFalse(needs_completion(value))


class ExtractionSchemaTest(unittest.TestCase):
    def test_only_existing_messages_can_be_cited(self):
        from jsonschema import Draft7Validator

        from onyx.server.query_and_chat.burn2.validation import extraction_schema

        schema = extraction_schema(1)
        reference = schema["properties"]["objective"]["properties"][
            "sourceMessageIndex"
        ]
        validator = Draft7Validator(reference)
        self.assertTrue(validator.is_valid(0))
        self.assertFalse(validator.is_valid(1))
        self.assertFalse(validator.is_valid(-1))
        self.assertNotIn("version", schema["properties"])
        self.assertEqual(
            extraction_schema(3)["properties"]["objective"]["properties"][
                "sourceMessageIndex"
            ]["maximum"],
            2,
        )
        self.assertEqual(reference["maximum"], 0)
