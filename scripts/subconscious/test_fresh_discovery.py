"""The live acceptance gate must not pass cached or late provider output."""

import unittest

from check_fresh_discovery import discovery_passed


class FreshDiscoveryTests(unittest.TestCase):
    def test_requires_fresh_complete_sources_within_sixty_seconds(self):
        receipt = {
            "cacheEmptyBeforeStart": True,
            "freshProfile": True,
            "freshResearch": True,
            "profileStatus": "ready",
            "researchStatus": "ready",
            "sourceCount": 3,
            "reportCharacters": 1000,
            "seconds": 23.0,
        }
        self.assertTrue(discovery_passed(receipt))
        for field, value in (
            ("cacheEmptyBeforeStart", False),
            ("freshProfile", False),
            ("freshResearch", False),
            ("profileStatus", "not_found"),
            ("researchStatus", "running"),
            ("sourceCount", 0),
            ("reportCharacters", 0),
            ("seconds", 60.001),
            ("seconds", -1),
        ):
            with self.subTest(field=field):
                self.assertFalse(discovery_passed({**receipt, field: value}))


if __name__ == "__main__":
    unittest.main()
