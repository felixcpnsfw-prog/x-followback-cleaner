import unittest

from x_followback_cleaner.compare import compare_accounts
from x_followback_cleaner.model import Account


class CompareAccountsTest(unittest.TestCase):
    def test_compare_finds_following_accounts_that_are_not_followers(self):
        result = compare_accounts(
            followers=[Account("alice"), Account("charlie")],
            following=[Account("Alice"), Account("bob"), Account("charlie")],
        )

        self.assertEqual([account.username for account in result.non_followbacks], ["bob"])
        self.assertEqual(result.followers_count, 2)
        self.assertEqual(result.following_count, 3)

    def test_compare_respects_protected_handles(self):
        result = compare_accounts(
            followers=[Account("alice")],
            following=[Account("alice"), Account("bob"), Account("dana")],
            protected=["@bob"],
        )

        self.assertEqual([account.username for account in result.non_followbacks], ["dana"])


if __name__ == "__main__":
    unittest.main()
