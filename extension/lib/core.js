(function initCore(root) {
  "use strict";

  const RESERVED_PATHS = new Set([
    "compose",
    "explore",
    "hashtag",
    "home",
    "i",
    "intent",
    "jobs",
    "login",
    "logout",
    "messages",
    "notifications",
    "privacy",
    "search",
    "settings",
    "share",
    "tos"
  ]);

  function normalizeUsername(value) {
    let username = String(value || "").trim();
    if (!username) return "";
    username = username.replace(/^@+/, "");
    username = username.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "");
    username = username.split(/[/?#]/)[0];
    username = username.trim().replace(/^@+/, "");
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) return "";
    const key = username.toLowerCase();
    if (RESERVED_PATHS.has(key)) return "";
    return key;
  }

  function displayUsername(value) {
    let username = String(value || "").trim();
    username = username.replace(/^@+/, "");
    username = username.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "");
    username = username.split(/[/?#]/)[0];
    username = username.trim().replace(/^@+/, "");
    return normalizeUsername(username) ? username : "";
  }

  function profileUrl(username) {
    const normalized = displayUsername(username);
    return normalized ? `https://x.com/${normalized}` : "";
  }

  function dedupeAccounts(accounts) {
    const seen = new Set();
    const clean = [];
    for (const account of accounts || []) {
      const key = normalizeUsername(account && account.username);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const username = displayUsername(account.username) || key;
      clean.push({
        username,
        displayName: String(account.displayName || "").trim(),
        profileUrl: profileUrl(username)
      });
    }
    return clean;
  }

  function compareAccounts(followers, following, protectedHandles) {
    const followerKeys = new Set(dedupeAccounts(followers).map((account) => normalizeUsername(account.username)));
    const protectedKeys = new Set(parseAllowlist(protectedHandles || "").map(normalizeUsername));
    return dedupeAccounts(following).filter((account) => {
      const key = normalizeUsername(account.username);
      return key && !followerKeys.has(key) && !protectedKeys.has(key);
    });
  }

  function parseAllowlist(text) {
    if (Array.isArray(text)) return text.map(normalizeUsername).filter(Boolean);
    return String(text || "")
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map(normalizeUsername)
      .filter(Boolean);
  }

  function accountsToCsv(accounts, options) {
    const opts = Object.assign({ includeStatus: true }, options || {});
    const header = ["Username", "Display Name", "Profile URL"];
    if (opts.includeStatus) header.push("Status", "Notes");

    const rows = [header];
    for (const account of dedupeAccounts(accounts)) {
      const row = [account.username, account.displayName, account.profileUrl];
      if (opts.includeStatus) row.push("review", "");
      rows.push(row);
    }
    return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  }

  function snapshotToCsv(snapshot) {
    return accountsToCsv((snapshot && snapshot.accounts) || [], { includeStatus: false });
  }

  function csvCell(value) {
    const text = String(value == null ? "" : value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function makeSnapshot(kind, accounts, sourceUrl, capturedAt) {
    const time = capturedAt || new Date().toISOString();
    const cleanKind = kind === "following" ? "following" : "followers";
    const cleanAccounts = dedupeAccounts(accounts);
    return {
      id: `${cleanKind}_${time.replace(/[:.]/g, "-")}`,
      kind: cleanKind,
      capturedAt: time,
      sourceUrl: sourceUrl || "",
      accountCount: cleanAccounts.length,
      accounts: cleanAccounts
    };
  }

  const api = {
    accountsToCsv,
    compareAccounts,
    dedupeAccounts,
    displayUsername,
    makeSnapshot,
    normalizeUsername,
    parseAllowlist,
    profileUrl,
    snapshotToCsv
  };

  root.XFBC = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
