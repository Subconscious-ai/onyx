"""Run in the native API container. Only fresh synthetic profile keys are changed."""

import unittest
from uuid import uuid4

from onyx.db.burn2_profile import correct_profile, read_profile, save_profile
from onyx.db.encrypted_kv_store import delete_encrypted_kv, load_encrypted_kv
from onyx.db.engine.sql_engine import SqlEngine
from onyx.key_value_store.interface import KvKeyNotFoundError
from onyx.server.query_and_chat.burn2.models import ProfileCorrection


class ProfileStorageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        SqlEngine.init_engine(pool_size=2, max_overflow=0)

    def setUp(self):
        self.owner = uuid4()
        self.other = uuid4()

    def tearDown(self):
        for user_id in (self.owner, self.other):
            key = f"burn2:profile-correction:{user_id}"
            for owned_key in (
                f"burn2:profile:{user_id}",
                key,
                f"{key}:revision:1",
                f"{key}:revision:2",
            ):
                try:
                    delete_encrypted_kv(owned_key)
                except KvKeyNotFoundError:
                    pass

    def test_reload_refresh_revision_conflict_and_separate_owner(self):
        save_profile(
            self.owner,
            {
                "status": "ready",
                "profile": {"company": "Provider", "website": "old.example.com"},
            },
        )
        saved = correct_profile(
            self.owner,
            ProfileCorrection(
                revision=0,
                fields={"company": "Executive", "website": "new.example.com"},
            ),
        )
        self.assertEqual(saved["correction"]["revision"], 1)
        self.assertEqual(read_profile(self.other)["profile"], {})
        with self.assertRaises(ValueError):
            correct_profile(
                self.owner, ProfileCorrection(revision=0, fields={"company": "Stale"})
            )
        save_profile(
            self.owner, {"status": "ready", "profile": {"company": "Refreshed"}}
        )
        self.assertEqual(read_profile(self.owner)["profile"]["company"], "Executive")
        archived = load_encrypted_kv(
            f"burn2:profile-correction:{self.owner}:revision:1"
        )
        self.assertEqual(archived["updated_by"], str(self.owner))
        corrected = correct_profile(
            self.owner, ProfileCorrection(revision=1, fields={"company": "Different"})
        )
        self.assertNotIn("website", corrected["profile"])
        self.assertEqual(corrected["correction"]["revision"], 2)


if __name__ == "__main__":
    unittest.main()
