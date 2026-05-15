from __future__ import annotations

import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path

from .model import CompareResult


def write_outputs(result: CompareResult, output_dir: str | Path) -> dict[str, Path]:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    csv_path = out / "non_followbacks.csv"
    markdown_path = out / "summary.md"
    html_path = out / "review_queue.html"

    write_csv(result, csv_path)
    write_markdown(result, markdown_path)
    write_review_html(result, html_path)

    return {"csv": csv_path, "summary": markdown_path, "html": html_path}


def write_csv(result: CompareResult, path: str | Path) -> None:
    with Path(path).open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["Username", "Display Name", "Profile URL", "Status", "Notes"],
        )
        writer.writeheader()
        for account in result.non_followbacks:
            writer.writerow(
                {
                    "Username": account.username,
                    "Display Name": account.display_name,
                    "Profile URL": account.profile_url,
                    "Status": "review",
                    "Notes": "",
                }
            )


def write_markdown(result: CompareResult, path: str | Path) -> None:
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines = [
        "# X Followback Cleaner Summary",
        "",
        f"- Generated: {generated_at}",
        f"- Followers: {result.followers_count}",
        f"- Following: {result.following_count}",
        f"- Protected handles: {result.protected_count}",
        f"- Non-followbacks: {len(result.non_followbacks)}",
        "",
        "## First 50 Non-Followbacks",
        "",
        "| # | Username | Display Name | Profile |",
        "|---:|---|---|---|",
    ]

    for index, account in enumerate(result.non_followbacks[:50], start=1):
        username = escape_markdown(account.username)
        display_name = escape_markdown(account.display_name)
        lines.append(f"| {index} | `{username}` | {display_name} | <{account.profile_url}> |")

    if len(result.non_followbacks) > 50:
        lines.extend(["", f"...and {len(result.non_followbacks) - 50} more in `non_followbacks.csv`."])

    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_review_html(result: CompareResult, path: str | Path) -> None:
    rows = [
        {
            "username": account.username,
            "displayName": account.display_name,
            "profileUrl": account.profile_url,
        }
        for account in result.non_followbacks
    ]
    data = json.dumps(rows, ensure_ascii=False)
    total = len(rows)
    generated_at = html.escape(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>X Followback Review Queue</title>
  <style>
    :root {{
      color-scheme: light dark;
      --bg: #f7f8fb;
      --panel: #ffffff;
      --text: #172033;
      --muted: #687386;
      --line: #dce2ea;
      --accent: #1667d9;
      --done: #0f8a55;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #11151d;
        --panel: #171d27;
        --text: #eef3fb;
        --muted: #98a3b4;
        --line: #2a3443;
        --accent: #78a9ff;
        --done: #50c98f;
      }}
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font: 15px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }}
    header {{
      position: sticky;
      top: 0;
      z-index: 2;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--panel) 94%, transparent);
      backdrop-filter: blur(10px);
    }}
    .bar {{
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: center;
      max-width: 1080px;
      margin: 0 auto;
      padding: 16px;
    }}
    h1 {{
      margin: 0;
      font-size: 20px;
      letter-spacing: 0;
    }}
    .meta {{
      margin-top: 3px;
      color: var(--muted);
      font-size: 13px;
    }}
    main {{
      max-width: 1080px;
      margin: 0 auto;
      padding: 18px 16px 40px;
    }}
    .tools {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-bottom: 14px;
    }}
    input[type="search"] {{
      min-width: min(420px, 100%);
      flex: 1;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 11px;
      background: var(--panel);
      color: var(--text);
      font: inherit;
    }}
    button, .button {{
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 11px;
      background: var(--panel);
      color: var(--text);
      font: inherit;
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
    }}
    button.primary {{
      border-color: var(--accent);
      background: var(--accent);
      color: white;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--line);
    }}
    th, td {{
      border-bottom: 1px solid var(--line);
      padding: 10px;
      text-align: left;
      vertical-align: middle;
    }}
    th {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }}
    tr.done td {{
      color: var(--muted);
      background: color-mix(in srgb, var(--done) 8%, transparent);
    }}
    .handle {{
      font-weight: 650;
    }}
    .name {{
      color: var(--muted);
      overflow-wrap: anywhere;
    }}
    .profile {{
      color: var(--accent);
      text-decoration: none;
    }}
    .empty {{
      padding: 38px 16px;
      text-align: center;
      color: var(--muted);
      background: var(--panel);
      border: 1px solid var(--line);
    }}
    @media (max-width: 720px) {{
      .bar {{ grid-template-columns: 1fr; }}
      table, thead, tbody, tr, th, td {{ display: block; }}
      thead {{ display: none; }}
      tr {{ border-bottom: 1px solid var(--line); }}
      td {{ border-bottom: 0; }}
      td[data-label]::before {{
        content: attr(data-label);
        display: block;
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 3px;
      }}
    }}
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div>
        <h1>X Followback Review Queue</h1>
        <div class="meta"><span id="count">{total}</span> accounts · generated {generated_at} · saved locally in this browser</div>
      </div>
      <button class="primary" id="export">Export reviewed CSV</button>
    </div>
  </header>
  <main>
    <div class="tools">
      <input id="search" type="search" placeholder="Search handle or display name">
      <button id="showAll">All</button>
      <button id="showOpen">Open</button>
      <button id="showDone">Done</button>
      <button id="clearDone">Clear marks</button>
    </div>
    <div id="table"></div>
  </main>
  <script>
    const rows = {data};
    const key = "xfbc-review-" + location.pathname;
    const state = JSON.parse(localStorage.getItem(key) || "{{}}");
    let filter = "all";
    const table = document.getElementById("table");
    const search = document.getElementById("search");
    const count = document.getElementById("count");

    function save() {{
      localStorage.setItem(key, JSON.stringify(state));
    }}

    function visibleRows() {{
      const query = search.value.trim().toLowerCase();
      return rows.filter(row => {{
        const done = Boolean(state[row.username]);
        if (filter === "open" && done) return false;
        if (filter === "done" && !done) return false;
        if (!query) return true;
        return row.username.toLowerCase().includes(query) || row.displayName.toLowerCase().includes(query);
      }});
    }}

    function render() {{
      const list = visibleRows();
      count.textContent = `${{list.length}}/${{rows.length}}`;
      if (!list.length) {{
        table.innerHTML = '<div class="empty">No accounts match the current view.</div>';
        return;
      }}
      table.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Handle</th>
              <th>Display Name</th>
              <th>Profile</th>
            </tr>
          </thead>
          <tbody>
            ${{list.map(row => `
              <tr class="${{state[row.username] ? "done" : ""}}">
                <td data-label="Status">
                  <label>
                    <input type="checkbox" data-user="${{escapeAttr(row.username)}}" ${{state[row.username] ? "checked" : ""}}>
                    reviewed
                  </label>
                </td>
                <td class="handle" data-label="Handle">@${{escapeHtml(row.username)}}</td>
                <td class="name" data-label="Display Name">${{escapeHtml(row.displayName || "")}}</td>
                <td data-label="Profile"><a class="profile" href="${{escapeAttr(row.profileUrl)}}" target="_blank" rel="noreferrer">Open profile</a></td>
              </tr>
            `).join("")}}
          </tbody>
        </table>`;
      table.querySelectorAll("input[type=checkbox]").forEach(input => {{
        input.addEventListener("change", event => {{
          const username = event.target.dataset.user;
          if (event.target.checked) state[username] = new Date().toISOString();
          else delete state[username];
          save();
          render();
        }});
      }});
    }}

    function escapeHtml(value) {{
      return String(value).replace(/[&<>"']/g, char => ({{
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }}[char]));
    }}

    function escapeAttr(value) {{
      return escapeHtml(value);
    }}

    function downloadReviewedCsv() {{
      const csvRows = [["Username", "Display Name", "Profile URL", "Reviewed At"]];
      for (const row of rows) {{
        if (state[row.username]) {{
          csvRows.push([row.username, row.displayName || "", row.profileUrl, state[row.username]]);
        }}
      }}
      const csv = csvRows.map(cols => cols.map(csvCell).join(",")).join("\\n") + "\\n";
      const blob = new Blob([csv], {{ type: "text/csv;charset=utf-8" }});
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "reviewed_non_followbacks.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    }}

    function csvCell(value) {{
      const text = String(value ?? "");
      if (/[",\\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
      return text;
    }}

    search.addEventListener("input", render);
    document.getElementById("showAll").addEventListener("click", () => {{ filter = "all"; render(); }});
    document.getElementById("showOpen").addEventListener("click", () => {{ filter = "open"; render(); }});
    document.getElementById("showDone").addEventListener("click", () => {{ filter = "done"; render(); }});
    document.getElementById("clearDone").addEventListener("click", () => {{
      if (confirm("Clear all local reviewed marks?")) {{
        for (const username of Object.keys(state)) delete state[username];
        save();
        render();
      }}
    }});
    document.getElementById("export").addEventListener("click", downloadReviewedCsv);
    render();
  </script>
</body>
</html>
"""
    Path(path).write_text(html_text, encoding="utf-8")


def escape_markdown(value: str) -> str:
    return (value or "").replace("|", "\\|")
