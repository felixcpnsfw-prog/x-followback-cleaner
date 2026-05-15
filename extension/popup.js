(function initPopup() {
  "use strict";

  const INDEX_KEY = "xfbc.snapshots";
  const STATUS_KEY = "xfbc.scanStatus";
  const SETTINGS_KEY = "xfbc.settings";
  const UNFOLLOW_STATUS_KEY = "xfbc.unfollowStatus";
  const DONATE_CONFIG = Object.assign({
    coffeeUrl: "https://www.buymeacoffee.com/ProfitKatze",
    stablecoin: {}
  }, globalThis.XFBC_DONATE_CONFIG || {});
  const OFFICIAL_PROTECTED_HANDLES = [
    "x",
    "twitter",
    "openai",
    "chatgptapp",
    "tesla",
    "spacex",
    "grok",
    "google",
    "youtube",
    "gmail",
    "geminiapp",
    "apple",
    "microsoft",
    "github",
    "anthropicai",
    "claudeai",
    "perplexity_ai",
    "meta",
    "instagram",
    "nasa",
    "whitehouse",
    "potus"
  ];
  const RESERVED_HANDLES = new Set([
    "compose",
    "explore",
    "home",
    "i",
    "messages",
    "notifications",
    "search",
    "settings"
  ]);

  const elements = {
    allowlist: document.getElementById("allowlist"),
    apiConfirmPanel: document.getElementById("apiConfirmPanel"),
    apiConfirmText: document.getElementById("apiConfirmText"),
    cancelApiUnfollow: document.getElementById("cancelApiUnfollow"),
    coffeeDonate: document.getElementById("coffeeDonate"),
    compare: document.getElementById("compare"),
    confirmApiUnfollow: document.getElementById("confirmApiUnfollow"),
    copyStablecoinAddress: document.getElementById("copyStablecoinAddress"),
    exportCsv: document.getElementById("exportCsv"),
    followersSnapshot: document.getElementById("followersSnapshot"),
    followingSnapshot: document.getElementById("followingSnapshot"),
    openFollowers: document.getElementById("openFollowers"),
    openFollowing: document.getElementById("openFollowing"),
    openScanFollowers: document.getElementById("openScanFollowers"),
    openScanFollowing: document.getElementById("openScanFollowing"),
    ownHandle: document.getElementById("ownHandle"),
    protectedSummary: document.getElementById("protectedSummary"),
    protectOfficial: document.getElementById("protectOfficial"),
    resultCount: document.getElementById("resultCount"),
    results: document.getElementById("results"),
    startApiUnfollow: document.getElementById("startApiUnfollow"),
    snapshotCount: document.getElementById("snapshotCount"),
    stablecoinAddress: document.getElementById("stablecoinAddress"),
    stablecoinAddressRow: document.getElementById("stablecoinAddressRow"),
    stablecoinDonate: document.getElementById("stablecoinDonate"),
    stablecoinPanel: document.getElementById("stablecoinPanel"),
    stablecoinText: document.getElementById("stablecoinText"),
    stablecoinTitle: document.getElementById("stablecoinTitle"),
    status: document.getElementById("status"),
    stopScan: document.getElementById("stopScan"),
    unfollowDelay: document.getElementById("unfollowDelay")
  };

  let snapshots = [];
  let lastResult = [];

  document.addEventListener("DOMContentLoaded", () => {
    wireEvents();
    refresh();
    window.setInterval(refreshStatus, 1200);
  });

  function wireEvents() {
    elements.openFollowers.addEventListener("click", () => openListPage("followers", false));
    elements.openFollowing.addEventListener("click", () => openListPage("following", false));
    elements.openScanFollowers.addEventListener("click", () => openListPage("followers", true));
    elements.openScanFollowing.addEventListener("click", () => openListPage("following", true));
    elements.stopScan.addEventListener("click", stopScan);
    elements.compare.addEventListener("click", compareSelected);
    elements.exportCsv.addEventListener("click", exportResultCsv);
    elements.startApiUnfollow.addEventListener("click", startApiUnfollow);
    elements.confirmApiUnfollow.addEventListener("click", confirmApiUnfollow);
    elements.cancelApiUnfollow.addEventListener("click", hideApiConfirm);
    elements.stablecoinDonate.addEventListener("click", openStablecoinDonate);
    elements.copyStablecoinAddress.addEventListener("click", copyStablecoinAddress);
    elements.ownHandle.addEventListener("input", saveSettings);
    elements.allowlist.addEventListener("input", saveSettings);
    elements.protectOfficial.addEventListener("change", () => {
      saveSettings();
      renderProtectedSummary();
    });
  }

  async function refresh() {
    renderDonateLinks();
    await loadSettings();
    await detectHandleFromActiveTab();
    await loadSnapshots();
    await refreshStatus();
    renderProtectedSummary();
  }

  function renderDonateLinks() {
    const stablecoin = donateStablecoinConfig();
    elements.coffeeDonate.href = DONATE_CONFIG.coffeeUrl || "https://www.buymeacoffee.com/ProfitKatze";
    elements.stablecoinDonate.textContent = stablecoin.label || "Stablecoin";
    elements.stablecoinDonate.hidden = stablecoin.enabled === false;
  }

  async function loadSettings() {
    const data = await chrome.storage.local.get(SETTINGS_KEY);
    const settings = data[SETTINGS_KEY] || {};
    if (settings.ownHandle && !elements.ownHandle.value) elements.ownHandle.value = settings.ownHandle;
    if (settings.allowlist && !elements.allowlist.value) elements.allowlist.value = settings.allowlist;
    if (typeof settings.protectOfficial === "boolean") elements.protectOfficial.checked = settings.protectOfficial;
  }

  async function saveSettings() {
    await chrome.storage.local.set({
      [SETTINGS_KEY]: {
        ownHandle: normalizeHandle(elements.ownHandle.value),
        allowlist: elements.allowlist.value,
        protectOfficial: elements.protectOfficial.checked
      }
    });
  }

  async function detectHandleFromActiveTab() {
    if (elements.ownHandle.value) return;
    const tab = await activeTab();
    const handle = handleFromUrl(tab && tab.url);
    if (handle) {
      elements.ownHandle.value = handle;
      await saveSettings();
    }
  }

  async function loadSnapshots() {
    const data = await chrome.storage.local.get(INDEX_KEY);
    snapshots = Array.isArray(data[INDEX_KEY]) ? data[INDEX_KEY] : [];
    elements.snapshotCount.textContent = String(snapshots.length);
    renderSnapshotSelect(elements.followersSnapshot, "followers");
    renderSnapshotSelect(elements.followingSnapshot, "following");
  }

  function renderSnapshotSelect(select, kind) {
    const previous = select.value;
    const filtered = snapshots.filter((snapshot) => snapshot.kind === kind);
    select.innerHTML = "";
    if (!filtered.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = `No ${kind} snapshot yet`;
      select.appendChild(option);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    for (const snapshot of filtered) {
      const option = document.createElement("option");
      option.value = snapshot.id;
      option.textContent = `${formatDate(snapshot.capturedAt)} · ${snapshot.accountCount}`;
      select.appendChild(option);
    }
    if (filtered.some((snapshot) => snapshot.id === previous)) select.value = previous;
  }

  async function openListPage(kind, shouldScan) {
    const handle = normalizeHandle(elements.ownHandle.value);
    if (!handle) {
      setStatus("請先輸入你的 X handle，例如 ProfitKatze。");
      elements.ownHandle.focus();
      return;
    }
    await saveSettings();

    const tab = await activeTab();
    if (!tab || !tab.id) {
      setStatus("No active tab found.");
      return;
    }

    const url = `https://x.com/${handle}/${kind}`;
    if (!shouldScan) {
      chrome.tabs.update(tab.id, { url, active: true });
      setStatus(`Opened ${kind} page. 回到插件後可按 Open + Scan 自動掃描。`);
      return;
    }

    setStatus(`Opening ${kind} page and starting scan`);
    chrome.runtime.sendMessage({ type: "XFBC_OPEN_AND_SCAN", tabId: tab.id, handle, kind }, async (response) => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message);
        return;
      }
      if (!response || !response.ok) {
        setStatus((response && response.error) || `Could not open and scan ${kind}.`);
        return;
      }
      const snapshot = response.result && response.result.snapshot;
      if (snapshot) {
        setStatus(scanDoneMessage(kind, snapshot.accountCount));
        await loadSnapshots();
      } else if (response.result && response.result.started) {
        setStatus(`${kind} scan started. You can close this popup; status will update when finished.`);
      } else {
        setStatus(`${kind} scan started.`);
      }
    });
  }

  async function stopScan() {
    sendToActiveXTab({ type: "XFBC_STOP_SCAN" }, () => {
      setStatus("Stop requested.");
    });
  }

  async function compareSelected() {
    const followers = await getSnapshot(elements.followersSnapshot.value);
    const following = await getSnapshot(elements.followingSnapshot.value);
    if (!followers || !following) {
      setStatus("Capture both followers and following snapshots first.");
      return;
    }

    lastResult = XFBC.compareAccounts(followers.accounts, following.accounts, protectedHandlesText());
    elements.resultCount.textContent = String(lastResult.length);
    elements.exportCsv.disabled = lastResult.length === 0;
    elements.startApiUnfollow.disabled = lastResult.length === 0;
    hideApiConfirm();
    renderResults(lastResult);
    setStatus(`Compared ${followers.accountCount} followers with ${following.accountCount} following.`);
  }

  async function exportResultCsv() {
    if (!lastResult.length) return;
    const csv = XFBC.accountsToCsv(lastResult, { includeStatus: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await downloadText(`non_followbacks_${stamp}.csv`, csv, "text/csv;charset=utf-8");
  }

  async function startApiUnfollow() {
    if (!lastResult.length) {
      setStatus("Compare snapshots first.");
      return;
    }
    const delaySeconds = Math.max(Number(elements.unfollowDelay.value) || 2.5, 1.2);
    elements.apiConfirmText.textContent = `${lastResult.length} accounts will be processed with about ${delaySeconds}s between accounts. Protected handles are already excluded.`;
    elements.apiConfirmPanel.hidden = false;
    elements.confirmApiUnfollow.focus();
    setStatus("Review the Fast API confirmation panel, then start the batch.");
  }

  async function confirmApiUnfollow() {
    if (!lastResult.length) {
      hideApiConfirm();
      setStatus("Compare snapshots first.");
      return;
    }
    const delaySeconds = Math.max(Number(elements.unfollowDelay.value) || 2.5, 1.2);
    hideApiConfirm();
    setStatus("Sending Fast API command to X tab");
    sendToActiveXTab(
      { type: "XFBC_START_API_UNFOLLOW", accounts: lastResult, delayMs: delaySeconds * 1000 },
      (response) => {
        if (!response || !response.ok) {
          setStatus((response && response.error) || "Fast API unfollow failed to start.");
          return;
        }
        setStatus(`Fast API unfollow started: ${response.session.total} accounts. Popup closing.`);
        window.setTimeout(() => window.close(), 250);
      }
    );
  }

  function hideApiConfirm() {
    elements.apiConfirmPanel.hidden = true;
  }

  async function openStablecoinDonate() {
    const stablecoin = donateStablecoinConfig();
    if (stablecoin.checkoutUrl) {
      setStatus("Opening stablecoin checkout.");
      window.open(stablecoin.checkoutUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const tokenHint = stablecoin.tokenHint || "USDT / USDC";
    const network = stablecoin.network ? ` · ${stablecoin.network}` : "";
    elements.stablecoinTitle.textContent = `${stablecoin.label || "Stablecoin"} donate`;
    elements.stablecoinPanel.hidden = false;

    if (stablecoin.address) {
      elements.stablecoinText.textContent = `${tokenHint}${network}. Please verify the network before sending.`;
      elements.stablecoinAddress.textContent = stablecoin.address;
      elements.stablecoinAddressRow.hidden = false;
      setStatus("Stablecoin address shown. Verify network before sending.");
      return;
    }

    elements.stablecoinText.textContent = stablecoin.setupHint || "Stablecoin support is ready. Add your checkout URL or public wallet address in donate-config.js.";
    elements.stablecoinAddress.textContent = "";
    elements.stablecoinAddressRow.hidden = true;
    setStatus("Stablecoin donate needs a checkout URL or wallet address.");
  }

  async function copyStablecoinAddress() {
    const address = elements.stablecoinAddress.textContent.trim();
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setStatus("Stablecoin address copied.");
  }

  async function getSnapshot(id) {
    if (!id) return null;
    const key = snapshotKey(id);
    const data = await chrome.storage.local.get(key);
    return data[key] || null;
  }

  async function refreshStatus() {
    const data = await chrome.storage.local.get([STATUS_KEY, UNFOLLOW_STATUS_KEY]);
    const unfollow = data[UNFOLLOW_STATUS_KEY];
    if (unfollow && ["running", "waiting", "pausing", "paused", "stopped", "done", "error"].includes(unfollow.state)) {
      if (unfollow.state === "running" || unfollow.state === "waiting" || unfollow.state === "pausing" || unfollow.state === "paused") {
        setStatus(`${unfollow.message} · ${unfollow.index}/${unfollow.total}`);
        return;
      }
      if (Date.now() - Date.parse(unfollow.updatedAt || 0) < 120000) {
        setStatus(unfollow.message || unfollow.state);
        return;
      }
    }

    const status = data[STATUS_KEY];
    if (!status) return;
    if (status.state === "running") {
      setStatus(`${status.message} · ${status.scrolls} scrolls`);
    } else {
      setStatus(status.message || status.state);
    }
  }

  function renderResults(accounts) {
    const visible = accounts.slice(0, 80);
    if (!visible.length) {
      elements.results.innerHTML = '<div class="empty-state">目前沒有未回關名單。</div>';
      return;
    }
    elements.results.innerHTML = "";
    for (const account of visible) {
      const row = document.createElement("div");
      row.className = "result-row";
      const info = document.createElement("div");
      const handle = document.createElement("div");
      handle.className = "handle";
      handle.textContent = `@${account.username}`;
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = account.displayName || "";
      info.append(handle, name);

      const link = document.createElement("a");
      link.className = "profile";
      link.href = account.profileUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Open";
      row.append(info, link);
      elements.results.appendChild(row);
    }
  }

  function protectedHandlesText() {
    const parts = [elements.allowlist.value || ""];
    if (elements.protectOfficial.checked) parts.push(OFFICIAL_PROTECTED_HANDLES.join("\n"));
    return parts.join("\n");
  }

  function scanDoneMessage(kind, count) {
    if (kind === "followers") return `Followers snapshot saved (${count}). Next: scan following.`;
    return `Following snapshot saved (${count}). Next: choose both snapshots and click Compare.`;
  }

  function renderProtectedSummary() {
    if (!elements.protectedSummary) return;
    if (elements.protectOfficial.checked) {
      elements.protectedSummary.textContent = `Built-in protection: ${OFFICIAL_PROTECTED_HANDLES.slice(0, 6).join(", ")} and ${OFFICIAL_PROTECTED_HANDLES.length - 6} more.`;
    } else {
      elements.protectedSummary.textContent = "Built-in official protection is off. Only your manual protected handles are used.";
    }
  }

  async function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename, saveAs: true });
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function sendToActiveXTab(message, callback) {
    const tab = await activeTab();
    if (!tab || !tab.id) {
      setStatus("No active tab found.");
      callback && callback({ ok: false, error: "No active tab found." });
      return;
    }

    if (!isXUrl(tab.url || "")) {
      setStatus("Open an x.com tab first, then click the extension icon there.");
      callback && callback({ ok: false, error: "Active tab is not x.com." });
      return;
    }

    const ping = await sendMessage(tab.id, { type: "XFBC_PING" });
    if (!ping.ok) {
      setStatus("Injecting helper into X tab");
      const injected = await injectContentScripts(tab.id);
      if (!injected.ok) {
        setStatus(injected.error);
        callback && callback({ ok: false, error: injected.error });
        return;
      }
    }

    const response = await sendMessage(tab.id, message);
    if (!response.ok) {
      setStatus(response.error);
      callback && callback({ ok: false, error: response.error });
      return;
    }
    callback && callback(response.value);
  }

  function sendMessage(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve({ ok: true, value: response });
      });
    });
  }

  async function injectContentScripts(tabId) {
    try {
      const prefix = location.pathname.includes("/extension/") ? "extension/" : "";
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [`${prefix}lib/core.js`, `${prefix}content.js`]
      });
      const ping = await sendMessage(tabId, { type: "XFBC_PING" });
      if (!ping.ok) return { ok: false, error: `Injected, but helper did not respond: ${ping.error}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: `Could not inject helper into X tab: ${error.message}` };
    }
  }

  function isXUrl(url) {
    return /^https:\/\/(x|twitter)\.com\//i.test(url);
  }

  function handleFromUrl(url) {
    if (!isXUrl(url || "")) return "";
    try {
      const parsed = new URL(url);
      const first = decodeURIComponent(parsed.pathname.split("/").filter(Boolean)[0] || "");
      return normalizeHandle(first);
    } catch (_error) {
      return "";
    }
  }

  function normalizeHandle(value) {
    let username = String(value || "").trim();
    username = username.replace(/^@+/, "");
    username = username.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "");
    username = username.split(/[/?#]/)[0];
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) return "";
    return RESERVED_HANDLES.has(username.toLowerCase()) ? "" : username;
  }

  function snapshotKey(id) {
    return `xfbc.snapshot.${id}`;
  }

  function setStatus(message) {
    elements.status.textContent = message;
    elements.status.title = message;
  }

  function donateStablecoinConfig() {
    return Object.assign({
      enabled: true,
      label: "Stablecoin",
      tokenHint: "USDT / USDC",
      checkoutUrl: "",
      address: "",
      network: ""
    }, DONATE_CONFIG.stablecoin || {});
  }

  function formatDate(value) {
    if (!value) return "unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }
})();
