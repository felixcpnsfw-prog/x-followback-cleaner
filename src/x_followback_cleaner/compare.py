from __future__ import annotations

from collections.abc import Iterable

from .model import Account, CompareResult, normalize_username


def compare_accounts(
    *,
    followers: Iterable[Account],
    following: Iterable[Account],
    protected: Iterable[str] = (),
) -> CompareResult:
    follower_list = list(followers)
    following_list = list(following)
    follower_keys = {account.key for account in follower_list}
    protected_keys = {normalize_username(username) for username in protected if normalize_username(username)}

    non_followbacks = tuple(
        account
        for account in following_list
        if account.key not in follower_keys and account.key not in protected_keys
    )

    return CompareResult(
        followers_count=len(follower_list),
        following_count=len(following_list),
        protected_count=len(protected_keys),
        non_followbacks=non_followbacks,
    )
