"""Native-runtime checks for conditional research updates; no provider calls."""

import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from onyx.db.burn2_research import update_research_if_current


class ResearchStateUpdateTests(unittest.TestCase):
    def test_update_rechecks_job_and_status_under_row_lock(self):
        for current in (
            None,
            {"job_id": "new-job", "status": "running"},
            {"job_id": "old-job", "status": "ready"},
            {"job_id": "old-job", "status": "running"},
        ):
            with (
                self.subTest(current=current),
                patch(
                    "onyx.db.burn2_research.get_session_with_current_tenant"
                ) as session,
            ):
                db = session.return_value.__enter__.return_value
                query = db.query.return_value.filter_by.return_value
                row = None if current is None else MagicMock()
                if row is not None:
                    row.value.get_value.return_value = current
                query.with_for_update.return_value.first.return_value = row
                applied = update_research_if_current(
                    uuid4(),
                    {"job_id": "old-job", "status": "ready"},
                    job_id="old-job",
                    status="running",
                )
                query.with_for_update.assert_called_once_with()
                expected = current == {"job_id": "old-job", "status": "running"}
                self.assertEqual(applied, expected)
                self.assertEqual(db.execute.call_count, int(expected))
                self.assertEqual(db.commit.call_count, int(expected))


if __name__ == "__main__":
    unittest.main()
