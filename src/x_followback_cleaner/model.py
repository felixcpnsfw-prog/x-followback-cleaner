from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Account:
    username: str
    display_name: str = ""
    row_number: int | None = None

    @property
    def key(self) -> str:
        return normalize_username(self.username)

    @property
    def profile_url(self) -> str:
        return f"https://x.com/{self.username}"


@dataclass(frozen=True)
class CompareResult:
    followers_count: int
    following_count: int
    protected_count: int
    non_followbacks: tuple[Account, ...]


def normalize_username(value: str) -> str:
    username = (value or "").strip()
    if username.startswith("@"):
        username = username[1:]
    if username.startswith("https://x.com/") or username.startswith("https://twitter.com/"):
        username = username.rstrip("/").split("/")[-1]
    return username.strip().lower()


def display_username(value: str) -> str:
    username = (value or "").strip()
    if username.startswith("@"):
        username = username[1:]
    if username.startswith("https://x.com/") or username.startswith("https://twitter.com/"):
        username = username.rstrip("/").split("/")[-1]
    return username.strip()
