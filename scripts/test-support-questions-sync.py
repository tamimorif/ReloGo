"""Adversarial checks for the support-allowlist CI gate, using disposable copies."""

from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SQL_FILES = (
    "supabase/migrations/010_support_question_privacy_boundary.sql",
    "supabase/migrations/019_policy_reconsent.sql",
)


class SupportQuestionSyncTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="relogo-support-sync-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for name in (
            "scripts/check-support-questions-sync.sh",
            "mobile/lib/supportQuestions.ts",
            "supabase/functions/support-ai/supportQuestions.ts",
            *SQL_FILES,
        ):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)

    def check(self):
        return subprocess.run(
            ["bash", str(self.root / "scripts/check-support-questions-sync.sh")],
            capture_output=True,
            text=True,
            timeout=10,
        ).returncode

    def test_matching_copies_pass(self):
        self.assertEqual(self.check(), 0)

    def test_drift_in_either_deployed_sql_copy_fails(self):
        for name in SQL_FILES:
            with self.subTest(migration=name):
                path = self.root / name
                original = path.read_text()
                before, block = original.split("-- SUPPORT_QUESTIONS_SQL_START", 1)
                path.write_text(before + "-- SUPPORT_QUESTIONS_SQL_START" +
                                block.replace("'", "'Unexpected question: ", 1))
                self.assertNotEqual(self.check(), 0)
                path.write_text(original)

    def test_removed_sql_markers_fail(self):
        for name in SQL_FILES:
            for marker in ("START", "END"):
                with self.subTest(migration=name, marker=marker):
                    path = self.root / name
                    original = path.read_text()
                    path.write_text(original.replace("SUPPORT_QUESTIONS_SQL_" + marker, "REMOVED"))
                    self.assertNotEqual(self.check(), 0)
                    path.write_text(original)

    def test_new_sql_copy_is_also_checked(self):
        path = self.root / "supabase/migrations/999_test_copy.sql"
        path.write_text("-- SUPPORT_QUESTIONS_SQL_START\n'Unexpected question'\n"
                        "-- SUPPORT_QUESTIONS_SQL_END\n")
        self.assertNotEqual(self.check(), 0)


if __name__ == "__main__":
    unittest.main()
