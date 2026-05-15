from pathlib import Path
import tempfile
import unittest

from x_followback_cleaner.csvio import read_accounts, read_allowlist


class CsvIoTest(unittest.TestCase):
    def test_read_accounts_detects_snapshot_columns(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            csv_path = Path(temp_dir) / "following.csv"
            csv_path.write_text("#,Username,Display Name\n1,@Alice,Alice A.\n2,bob,Bob B.\n", encoding="utf-8")

            accounts = read_accounts(csv_path)

        self.assertEqual([account.username for account in accounts], ["Alice", "bob"])
        self.assertEqual([account.display_name for account in accounts], ["Alice A.", "Bob B."])

    def test_read_allowlist_ignores_comments_and_normalizes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            allowlist = Path(temp_dir) / "allowlist.txt"
            allowlist.write_text("# important\n@Alice\n\nhttps://x.com/Bob\n", encoding="utf-8")

            protected = read_allowlist(allowlist)

        self.assertEqual(protected, {"alice", "bob"})


if __name__ == "__main__":
    unittest.main()
