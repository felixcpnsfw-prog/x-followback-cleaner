from __future__ import annotations

import argparse
from pathlib import Path

from .compare import compare_accounts
from .csvio import read_accounts, read_allowlist
from .model import normalize_username
from .reports import write_outputs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="xfbc",
        description="Compare X/Twitter followers and following CSVs, then create a reviewable non-followback list.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    compare = subparsers.add_parser("compare", help="Build non-followback reports from two CSV files.")
    compare.add_argument("--followers", required=True, help="CSV file containing accounts that follow you.")
    compare.add_argument("--following", required=True, help="CSV file containing accounts you follow.")
    compare.add_argument("--out", default="out", help="Output directory. Default: ./out")
    compare.add_argument("--username-column", help="Username column name when auto-detection is not enough.")
    compare.add_argument("--display-name-column", help="Display-name column name when auto-detection is not enough.")
    compare.add_argument(
        "--protect",
        default="",
        help="Comma-separated handles to exclude from the result, for example: openai,sama",
    )
    compare.add_argument("--allowlist", help="Text file with one protected handle per line.")
    compare.set_defaults(func=run_compare)

    return parser


def run_compare(args: argparse.Namespace) -> int:
    followers = read_accounts(
        args.followers,
        username_column=args.username_column,
        display_name_column=args.display_name_column,
    )
    following = read_accounts(
        args.following,
        username_column=args.username_column,
        display_name_column=args.display_name_column,
    )
    protected = parse_protected(args.protect) | read_allowlist(args.allowlist)
    result = compare_accounts(followers=followers, following=following, protected=protected)
    outputs = write_outputs(result, Path(args.out))

    print(f"Followers: {result.followers_count}")
    print(f"Following: {result.following_count}")
    print(f"Protected: {result.protected_count}")
    print(f"Non-followbacks: {len(result.non_followbacks)}")
    for label, path in outputs.items():
        print(f"{label}: {path}")
    return 0


def parse_protected(value: str) -> set[str]:
    if not value:
        return set()
    return {normalize_username(part) for part in value.split(",") if normalize_username(part)}


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
