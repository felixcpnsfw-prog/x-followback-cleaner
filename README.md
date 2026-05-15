# X Followback Cleaner

本機優先、可審核的 X/Twitter followback 清理工具。它可以用 Chrome Extension 直接建立 X/Twitter snapshots、匯出 CSV、執行 Fast API assisted unfollow，也保留 Python CLI 來處理既有 CSV。

Created by [@ProfitKatze](https://x.com/ProfitKatze).

Support links in the extension popup: [Buy me a coffee](https://www.buymeacoffee.com/ProfitKatze) and an optional stablecoin donate entry.

Privacy policy: [PRIVACY.md](PRIVACY.md).

它會比較「followers」與「following」資料，找出「你有 follow、但對方沒有 follow back」的帳號，並產生：

- `non_followbacks.csv`：可再處理的未回關清單
- `summary.md`：統計摘要
- `review_queue.html`：本機開啟的人工審核佇列

取消關注是破壞性操作，所以插件會先要求確認、在 X 頁面顯示可暫停的進度面板，並在授權錯誤或 rate limit 時停止。

## Features

- Chrome Extension captures followers/following snapshots from the open X tab
- Temporarily zooms the X tab out while scanning, then restores the original zoom
- Fast API unfollow mode with pause/resume/stop controls and per-account delay
- Compare follower/following CSV exports locally
- Handles `Username` and `Display Name` style snapshot files
- Case-insensitive username matching
- Optional protected accounts / allowlist
- CSV, Markdown, and local HTML review queue output
- No external server and no password required; Fast API mode uses your logged-in X web session locally
- Optional stablecoin donation entry via a configured Epusdt checkout URL or public wallet address

## Chrome Extension Quick Start

```text
chrome://extensions -> Developer mode -> Load unpacked -> x-followback-cleaner/extension
```

You can also load the repository root `x-followback-cleaner`; a root `manifest.json` is included for local development.

Then:

1. Open any logged-in `https://x.com/` page.
2. Enter your handle in the extension popup, then run `Open + Scan` for followers.
3. When followers finish, run `Open + Scan` for following.
4. Wait for the following completion hint.
5. Select both snapshots, click `Compare`, then `Export CSV` or `Fast API unfollow`.
6. For unfollow actions, review the confirmation panel, then click `Start batch`. The popup closes and the X page overlay handles pause, resume, and stop.

The popup can also open the correct followers/following page for you: enter your handle, then use `Open + Scan` in the snapshot section.

Common official accounts such as `openai`, `tesla`, `spacex`, `x`, `google`, and `youtube` are protected by default. Add any extra handles to `Protected handles`; protected accounts are removed from the non-followback result before export or unfollow.

Snapshots are stored in `chrome.storage.local` on your own machine.

Stablecoin donations are configured in `extension/lib/donate-config.js`. For Epusdt, keep the merchant `secret_key` on your backend and put only a public checkout/donation URL in the extension. See `docs/stablecoin-donations.md`.

## CSV CLI Quick Start

```bash
cd x-followback-cleaner
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

xfbc compare \
  --followers /path/to/snapshot_followers.csv \
  --following /path/to/snapshot_following.csv \
  --out ./out
```

Open the generated `out/review_queue.html` in your browser. It gives you profile links, local checkboxes, and a CSV export of your reviewed items.

## Example With Your Snapshot Format

The default column detection supports CSV files like:

```csv
#,Username,Display Name
1,alice,Alice
2,bob,Bob
```

If your CSV uses different headers, pass them explicitly:

```bash
xfbc compare \
  --followers followers.csv \
  --following following.csv \
  --username-column screen_name \
  --display-name-column name \
  --out ./out
```

## Protect Accounts

Use `--protect` for important accounts you never want in the cleanup list:

```bash
xfbc compare \
  --followers followers.csv \
  --following following.csv \
  --protect elonmusk,sama,openai \
  --out ./out
```

Or keep a one-handle-per-line allowlist:

```bash
xfbc compare \
  --followers followers.csv \
  --following following.csv \
  --allowlist allowlist.txt \
  --out ./out
```

Lines beginning with `#` in an allowlist are ignored.

## Philosophy

This tool is meant to make the boring part reliable:

1. Capture or import two follower snapshots.
2. Compute the set difference.
3. Give you reviewable output.
4. Leave the final social decision to you.

The Chrome Extension can run an assisted unfollow batch. Fast API mode uses the logged-in X web session without profile-by-profile navigation, waits between accounts, stores progress locally, supports pause/resume, and stops on auth errors or rate limits.

## Development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
python -m unittest discover -s tests
node extension/tests/core.test.js
```

## License

MIT
