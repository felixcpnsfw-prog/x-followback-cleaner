from __future__ import annotations

import csv
from pathlib import Path

from .model import Account, display_username, normalize_username

USERNAME_COLUMNS = (
    "Username",
    "username",
    "Screen Name",
    "screen_name",
    "screenName",
    "Handle",
    "handle",
    "User Name",
    "user_name",
)

DISPLAY_NAME_COLUMNS = (
    "Display Name",
    "display_name",
    "Name",
    "name",
    "Full Name",
    "full_name",
)


def read_accounts(
    path: str | Path,
    *,
    username_column: str | None = None,
    display_name_column: str | None = None,
) -> list[Account]:
    csv_path = Path(path)
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError(f"{csv_path} has no header row")

        username_key = pick_column(reader.fieldnames, username_column, USERNAME_COLUMNS)
        display_key = pick_column(reader.fieldnames, display_name_column, DISPLAY_NAME_COLUMNS, required=False)

        accounts: list[Account] = []
        seen: set[str] = set()
        for index, row in enumerate(reader, start=2):
            username = display_username(row.get(username_key, ""))
            key = normalize_username(username)
            if not key or key in seen:
                continue
            seen.add(key)
            accounts.append(
                Account(
                    username=username,
                    display_name=(row.get(display_key, "") if display_key else "").strip(),
                    row_number=index,
                )
            )
    return accounts


def pick_column(
    fieldnames: list[str],
    requested: str | None,
    candidates: tuple[str, ...],
    *,
    required: bool = True,
) -> str | None:
    if requested:
        matched = find_column(fieldnames, requested)
        if matched:
            return matched
        raise ValueError(f"Column '{requested}' was not found. Available columns: {', '.join(fieldnames)}")

    for candidate in candidates:
        matched = find_column(fieldnames, candidate)
        if matched:
            return matched

    if required:
        raise ValueError(
            "Could not detect username column. "
            f"Tried: {', '.join(candidates)}. Available columns: {', '.join(fieldnames)}"
        )
    return None


def find_column(fieldnames: list[str], name: str) -> str | None:
    normalized = name.strip().lower().replace(" ", "_")
    for field in fieldnames:
        if field == name:
            return field
        if field.strip().lower().replace(" ", "_") == normalized:
            return field
    return None


def read_allowlist(path: str | Path | None) -> set[str]:
    if not path:
        return set()

    allowlist_path = Path(path)
    protected: set[str] = set()
    with allowlist_path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            protected.add(normalize_username(line))
    return protected
