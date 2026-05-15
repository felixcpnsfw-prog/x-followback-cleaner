(function initContentScript() {
  "use strict";

  if (globalThis.__XFBC_CONTENT_LOADED__) return;
  globalThis.__XFBC_CONTENT_LOADED__ = true;

  const INDEX_KEY = "xfbc.snapshots";
  const STATUS_KEY = "xfbc.scanStatus";
  const API_UNFOLLOW_SESSION_KEY = "xfbc.apiUnfollowSession";
  const UNFOLLOW_STATUS_KEY = "xfbc.unfollowStatus";
  const MAX_INDEX_ITEMS = 30;
  const SCAN_DELAY_MS = 850;
  const MAX_IDLE_ROUNDS = 8;
  const MAX_SCROLLS = 1200;
  const SCAN_ZOOM_FACTOR = 0.67;
  const MIN_API_UNFOLLOW_DELAY_MS = 1200;
  const DEFAULT_API_UNFOLLOW_DELAY_MS = 2500;
  const X_WEB_BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const USER_BY_SCREEN_NAME_QUERY_ID = "IGgvgiOx4QZndDHuD3x9TQ";
  const USER_BY_SCREEN_NAME_FEATURES = {
    hidden_profile_subscriptions_enabled: true,
    payments_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    subscriptions_verification_info_is_identity_verified_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    highlights_tweets_tab_ui_enabled: true,
    responsive_web_twitter_article_notes_tab_enabled: true,
    subscriptions_feature_can_gift_premium: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true
  };

  let activeScan = null;
  let activeApiUnfollow = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "XFBC_PING") {
      sendResponse({ ok: true, url: location.href });
      return false;
    }

    if (message.type === "XFBC_START_SCAN") {
      startScan(message.kind)
        .then((snapshot) => sendResponse({ ok: true, snapshot: snapshotSummary(snapshot) }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "XFBC_START_SCAN_ASYNC") {
      startScan(message.kind).catch((error) => updateStatus("error", error.message));
      sendResponse({ ok: true, started: true, kind: message.kind });
      return false;
    }

    if (message.type === "XFBC_STOP_SCAN") {
      if (activeScan) activeScan.stopRequested = true;
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "XFBC_GET_VISIBLE_ACCOUNTS") {
      sendResponse({ ok: true, accounts: collectVisibleAccounts() });
      return false;
    }

    if (message.type === "XFBC_START_API_UNFOLLOW") {
      startApiUnfollowSession(message.accounts || [], message.delayMs)
        .then((session) => sendResponse({ ok: true, session: sessionSummary(session) }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "XFBC_STOP_API_UNFOLLOW") {
      stopApiUnfollowSession()
        .then((session) => sendResponse({ ok: true, session }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "XFBC_PAUSE_API_UNFOLLOW") {
      pauseApiUnfollowSession()
        .then((session) => sendResponse({ ok: true, session }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "XFBC_RESUME_API_UNFOLLOW") {
      resumeApiUnfollowSession()
        .then((session) => sendResponse({ ok: true, session }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });

  async function startScan(kind) {
    const cleanKind = kind === "following" ? "following" : "followers";
    if (activeScan) throw new Error("A scan is already running in this tab.");

    activeScan = {
      kind: cleanKind,
      startedAt: new Date().toISOString(),
      stopRequested: false,
      seen: new Map(),
      scrolls: 0
    };

    renderOverlay();
    await updateStatus("running", "Starting scan");

    try {
      await prepareScanZoom();
      await runScanLoop();
      const accounts = Array.from(activeScan.seen.values());
      const snapshot = XFBC.makeSnapshot(cleanKind, accounts, location.href);
      await saveSnapshot(snapshot);
      await updateStatus("done", scanDoneMessage(cleanKind, snapshot.accountCount));
      return snapshot;
    } finally {
      await restoreScanZoom();
      window.setTimeout(removeOverlay, 2500);
      activeScan = null;
    }
  }

  async function runScanLoop() {
    let idleRounds = 0;
    let lastCount = 0;

    while (activeScan && !activeScan.stopRequested && activeScan.scrolls < MAX_SCROLLS) {
      for (const account of collectVisibleAccounts()) {
        const key = XFBC.normalizeUsername(account.username);
        if (key && !activeScan.seen.has(key)) activeScan.seen.set(key, account);
      }

      const count = activeScan.seen.size;
      if (count > lastCount) {
        idleRounds = 0;
        lastCount = count;
      } else {
        idleRounds += 1;
      }

      await updateStatus("running", `Scanning ${activeScan.kind}: ${count} found`);
      updateOverlay();

      if (idleRounds >= MAX_IDLE_ROUNDS) break;

      const beforeY = window.scrollY;
      window.scrollBy({ top: Math.max(window.innerHeight * 0.86, 620), behavior: "smooth" });
      activeScan.scrolls += 1;
      await sleep(SCAN_DELAY_MS);

      if (Math.abs(window.scrollY - beforeY) < 8) idleRounds += 1;
    }
  }

  function scanDoneMessage(kind, count) {
    if (kind === "followers") return `Followers snapshot saved (${count}). Next: scan following.`;
    return `Following snapshot saved (${count}). Next: choose both snapshots and compare.`;
  }

  function collectVisibleAccounts() {
    const roots = Array.from(
      document.querySelectorAll('main [data-testid="cellInnerDiv"], main [data-testid="UserCell"], main article')
    );
    const accounts = [];
    const seen = new Set();

    for (const root of roots.length ? roots : [document.querySelector("main") || document.body]) {
      const account = extractAccount(root);
      if (!account) continue;
      const key = XFBC.normalizeUsername(account.username);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      accounts.push(account);
    }

    return accounts;
  }

  function extractAccount(root) {
    const anchors = Array.from(root.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      const username = usernameFromHref(anchor.getAttribute("href"));
      if (!username) continue;
      return {
        username,
        displayName: extractDisplayName(root, username),
        profileUrl: XFBC.profileUrl(username)
      };
    }
    return null;
  }

  function usernameFromHref(href) {
    if (!href) return "";
    let url;
    try {
      url = new URL(href, location.origin);
    } catch (_error) {
      return "";
    }
    if (!/(\.|^)x\.com$|(\.|^)twitter\.com$/i.test(url.hostname)) return "";
    const firstPath = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] || "");
    return XFBC.displayUsername(firstPath);
  }

  function extractDisplayName(root, username) {
    const normalized = XFBC.normalizeUsername(username);
    const ignored = new Set([
      "",
      `@${normalized}`,
      normalized,
      "follow",
      "following",
      "verified",
      "subscribe"
    ]);
    const candidates = Array.from(root.querySelectorAll('a[href] span, div[dir="ltr"] span, span'))
      .map((element) => String(element.textContent || "").trim())
      .filter((text) => text && text.length <= 80);

    for (const text of candidates) {
      const key = text.toLowerCase();
      if (ignored.has(key)) continue;
      if (key.startsWith("@")) continue;
      if (/^\d+[KM]?$/.test(text)) continue;
      return text;
    }
    return "";
  }

  async function saveSnapshot(snapshot) {
    const existing = await chrome.storage.local.get(INDEX_KEY);
    const index = Array.isArray(existing[INDEX_KEY]) ? existing[INDEX_KEY] : [];
    const nextIndex = [snapshotSummary(snapshot), ...index.filter((item) => item.id !== snapshot.id)].slice(0, MAX_INDEX_ITEMS);
    await chrome.storage.local.set({
      [snapshotKey(snapshot.id)]: snapshot,
      [INDEX_KEY]: nextIndex
    });
  }

  function snapshotSummary(snapshot) {
    return {
      id: snapshot.id,
      kind: snapshot.kind,
      capturedAt: snapshot.capturedAt,
      sourceUrl: snapshot.sourceUrl,
      accountCount: snapshot.accountCount
    };
  }

  function snapshotKey(id) {
    return `xfbc.snapshot.${id}`;
  }

  async function updateStatus(state, message) {
    const status = {
      state,
      message,
      kind: activeScan ? activeScan.kind : "",
      count: activeScan ? activeScan.seen.size : 0,
      scrolls: activeScan ? activeScan.scrolls : 0,
      updatedAt: new Date().toISOString(),
      sourceUrl: location.href
    };
    await chrome.storage.local.set({ [STATUS_KEY]: status });
  }

  async function prepareScanZoom() {
    const response = await chrome.runtime.sendMessage({
      type: "XFBC_PREPARE_SCAN_ZOOM",
      zoomFactor: SCAN_ZOOM_FACTOR
    });
    if (!response || !response.ok) return;
    await sleep(500);
  }

  async function restoreScanZoom() {
    try {
      await chrome.runtime.sendMessage({ type: "XFBC_RESTORE_SCAN_ZOOM" });
      await sleep(250);
    } catch (_error) {
      // Best effort. The original zoom is also cleared when the tab closes.
    }
  }

  async function startApiUnfollowSession(accounts, delayMs) {
    const queue = XFBC.dedupeAccounts(accounts);
    if (!queue.length) throw new Error("No accounts to unfollow. Compare snapshots first.");
    if (!csrfToken()) throw new Error("Missing X csrf token. Open x.com while logged in, then reload the tab.");

    const delay = Math.max(Number(delayMs) || DEFAULT_API_UNFOLLOW_DELAY_MS, MIN_API_UNFOLLOW_DELAY_MS);
    const now = new Date().toISOString();
    const session = {
      id: `api_unfollow_${now.replace(/[:.]/g, "-")}`,
      mode: "api",
      state: "running",
      queue,
      index: 0,
      delayMs: delay,
      ok: 0,
      errors: 0,
      results: [],
      startedAt: now,
      updatedAt: now
    };

    const control = { stopRequested: false, pauseRequested: false };
    activeApiUnfollow = control;
    await chrome.storage.local.set({ [API_UNFOLLOW_SESSION_KEY]: session });
    await updateUnfollowStatus("running", `Fast API unfollow started: ${queue.length} accounts`);
    renderApiUnfollowOverlay(session, "starting");
    runApiUnfollowSession(control).catch((error) => updateUnfollowStatus("error", error.message));
    return session;
  }

  async function stopApiUnfollowSession() {
    if (activeApiUnfollow) activeApiUnfollow.stopRequested = true;
    const session = await getApiUnfollowSession();
    if (!session) return null;
    await markApiUnfollowStopped(session);
    activeApiUnfollow = null;
    return sessionSummary(session);
  }

  async function pauseApiUnfollowSession() {
    if (activeApiUnfollow) activeApiUnfollow.pauseRequested = true;
    const session = await getApiUnfollowSession();
    if (!session) return null;
    if (session.state === "done" || session.state === "error" || session.state === "stopped") {
      return sessionSummary(session);
    }
    if (session.state === "running" && activeApiUnfollow) {
      session.state = "pausing";
      session.updatedAt = new Date().toISOString();
      await saveApiUnfollowSession(session);
      await updateUnfollowStatus("paused", `Fast API pausing after current account at ${session.index}/${session.queue.length}`);
      renderApiUnfollowOverlay(session, "pausing after current account");
      return sessionSummary(session);
    }
    await markApiUnfollowPaused(session, "paused");
    return sessionSummary(session);
  }

  async function resumeApiUnfollowSession() {
    const session = await getApiUnfollowSession();
    if (!session) throw new Error("No paused Fast API session found.");
    if (session.state === "done" || session.state === "error" || session.state === "stopped") {
      return sessionSummary(session);
    }
    if (session.state === "pausing") {
      throw new Error("Pause is settling. Resume after the current account finishes.");
    }
    session.state = "running";
    session.updatedAt = new Date().toISOString();
    const control = { stopRequested: false, pauseRequested: false };
    activeApiUnfollow = control;
    await saveApiUnfollowSession(session);
    await updateUnfollowStatus("running", `Fast API resumed at ${session.index}/${session.queue.length}`);
    renderApiUnfollowOverlay(session, "resumed");
    runApiUnfollowSession(control).catch((error) => updateUnfollowStatus("error", error.message));
    return sessionSummary(session);
  }

  async function markApiUnfollowStopped(session) {
    session.state = "stopped";
    session.updatedAt = new Date().toISOString();
    await saveApiUnfollowSession(session);
    await updateUnfollowStatus("stopped", `Fast API stopped at ${session.index}/${session.queue.length}`);
    renderApiUnfollowOverlay(session, "stopped");
    window.setTimeout(removeApiUnfollowOverlay, 1600);
  }

  async function markApiUnfollowPaused(session, message) {
    session.state = "paused";
    session.updatedAt = new Date().toISOString();
    await saveApiUnfollowSession(session);
    await updateUnfollowStatus("paused", `Fast API paused at ${session.index}/${session.queue.length}`);
    renderApiUnfollowOverlay(session, message || "paused");
  }

  async function runApiUnfollowSession(control) {
    let session = await getApiUnfollowSession();
    if (!session || session.state !== "running") return;
    const runControl = control || activeApiUnfollow || { stopRequested: false, pauseRequested: false };
    if (!activeApiUnfollow) activeApiUnfollow = runControl;

    renderApiUnfollowOverlay(session);

    while (session.index < session.queue.length) {
      if (runControl.stopRequested) {
        await markApiUnfollowStopped(session);
        if (activeApiUnfollow === runControl) activeApiUnfollow = null;
        return;
      }

      if (runControl.pauseRequested || session.state === "paused") {
        await markApiUnfollowPaused(session);
        return;
      }

      const target = session.queue[session.index];
      const username = XFBC.displayUsername(target.username);
      if (!username) {
        recordApiResult(session, target, "skipped", "Invalid username");
        await saveApiUnfollowSession(session);
        continue;
      }

      await updateUnfollowStatus("running", `Fast unfollow @${username}`);
      renderApiUnfollowOverlay(session, `unfollowing @${username}`);

      const result = await destroyFriendship(username);
      if (result.ok) {
        recordApiResult(session, target, "unfollowed", result.message);
      } else if (result.stop) {
        recordApiResult(session, target, "error", result.message);
        session.state = "error";
        session.updatedAt = new Date().toISOString();
        await saveApiUnfollowSession(session);
        await updateUnfollowStatus("error", `Stopped on @${username}: ${result.message}`);
        renderApiUnfollowOverlay(session, `error @${username}: ${result.message}`);
        if (activeApiUnfollow === runControl) activeApiUnfollow = null;
        return;
      } else {
        recordApiResult(session, target, "error", result.message);
      }

      await saveApiUnfollowSession(session);
      renderApiUnfollowOverlay(session);

      if (session.index < session.queue.length) {
        const waitMs = session.delayMs + Math.floor(Math.random() * 1000);
        const waitSeconds = Math.max(1, Math.round(waitMs / 1000));
        await updateUnfollowStatus("waiting", `Waiting ${waitSeconds}s before next account`);
        renderApiUnfollowOverlay(session, `waiting ${waitSeconds}s`);
        const waitState = await waitForApiDelay(waitMs, runControl);
        if (waitState === "stopped") {
          session = (await getApiUnfollowSession()) || session;
          await markApiUnfollowStopped(session);
          if (activeApiUnfollow === runControl) activeApiUnfollow = null;
          return;
        }
        if (waitState === "paused") {
          session = (await getApiUnfollowSession()) || session;
          await markApiUnfollowPaused(session);
          return;
        }
        if (waitState !== "done") return;
      }

      session = await getApiUnfollowSession();
      if (!session || session.state !== "running") return;
    }

    session.state = "done";
    session.updatedAt = new Date().toISOString();
    await saveApiUnfollowSession(session);
    await updateUnfollowStatus("done", `Fast API finished: ok=${session.ok} err=${session.errors}`);
    renderApiUnfollowOverlay(session, "done");
    window.setTimeout(removeApiUnfollowOverlay, 3500);
    if (activeApiUnfollow === runControl) activeApiUnfollow = null;
  }

  async function waitForApiDelay(waitMs, control) {
    const endAt = Date.now() + waitMs;
    while (Date.now() < endAt) {
      if (control.stopRequested) return "stopped";
      if (control.pauseRequested) return "paused";

      const session = await getApiUnfollowSession();
      if (!session) return "missing";
      if (session.state === "stopped") return "stopped";
      if (session.state === "paused") return "paused";
      if (session.state !== "running") return session.state;

      await sleep(Math.min(300, Math.max(0, endAt - Date.now())));
    }
    return "done";
  }

  function recordApiResult(session, target, status, message) {
    session.results = Array.isArray(session.results) ? session.results : [];
    session.results.push({
      username: target.username,
      displayName: target.displayName || "",
      status,
      message: message || "",
      at: new Date().toISOString()
    });
    session.index += 1;
    if (status === "unfollowed" || status === "already_not_following") session.ok += 1;
    if (status === "error") session.errors += 1;
    session.updatedAt = new Date().toISOString();
  }

  async function destroyFriendship(username) {
    const direct = await destroyFriendshipByIdentity({ screen_name: username });
    if (direct.ok || direct.stop) return direct;

    if (!direct.canFallback) return direct;

    const lookup = await lookupUserIdByScreenName(username);
    if (!lookup.ok) return lookup;

    const byUserId = await destroyFriendshipByIdentity({ user_id: lookup.userId });
    if (byUserId.ok) return { ok: true, message: `HTTP 200 via user_id ${lookup.userId}` };
    return byUserId;
  }

  async function destroyFriendshipByIdentity(identity) {
    const body = new URLSearchParams({
      include_profile_interstitial_type: "1",
      include_blocking: "1",
      include_blocked_by: "1",
      include_followed_by: "1",
      include_want_retweets: "1",
      include_mute_edge: "1",
      include_can_dm: "1",
      include_can_media_tag: "1",
      include_ext_is_blue_verified: "1",
      include_ext_verified_type: "1",
      include_ext_profile_image_shape: "1",
      skip_status: "1"
    });
    if (identity.user_id) body.set("user_id", identity.user_id);
    else body.set("screen_name", identity.screen_name);

    let response;
    let text = "";
    try {
      response = await fetch("/i/api/1.1/friendships/destroy.json", {
        method: "POST",
        credentials: "include",
        headers: xApiHeaders(),
        body
      });
      text = await response.text();
    } catch (error) {
      return { ok: false, stop: true, message: `${error.name}: ${error.message}` };
    }

    if (response.ok) return { ok: true, message: "HTTP 200" };

    const detail = readableApiError(text) || `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return { ok: false, stop: true, message: detail };
    }
    return { ok: false, stop: false, canFallback: !identity.user_id, message: detail };
  }

  async function lookupUserIdByScreenName(username) {
    const variables = encodeURIComponent(JSON.stringify({ screen_name: username }));
    const features = encodeURIComponent(JSON.stringify(USER_BY_SCREEN_NAME_FEATURES));
    const fieldToggles = encodeURIComponent(JSON.stringify({ withAuxiliaryUserLabels: false }));
    const url = `/i/api/graphql/${USER_BY_SCREEN_NAME_QUERY_ID}/UserByScreenName?variables=${variables}&features=${features}&fieldToggles=${fieldToggles}`;

    let response;
    let text = "";
    try {
      response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: xApiHeaders({ contentType: false })
      });
      text = await response.text();
    } catch (error) {
      return { ok: false, stop: true, message: `${error.name}: ${error.message}` };
    }

    const detail = readableApiError(text) || `lookup HTTP ${response.status}`;
    if (!response.ok) {
      return {
        ok: false,
        stop: response.status === 401 || response.status === 403 || response.status === 429,
        message: detail
      };
    }

    try {
      const parsed = JSON.parse(text);
      const userId = parsed && parsed.data && parsed.data.user && parsed.data.user.result && parsed.data.user.result.rest_id;
      if (userId) return { ok: true, userId: String(userId) };
      return { ok: false, stop: false, message: "lookup did not return rest_id" };
    } catch (_error) {
      return { ok: false, stop: false, message: "lookup response was not JSON" };
    }
  }

  function xApiHeaders(options) {
    const opts = Object.assign({ contentType: true }, options || {});
    const headers = {
      authorization: `Bearer ${X_WEB_BEARER_TOKEN}`,
      "x-csrf-token": csrfToken(),
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en"
    };
    if (opts.contentType) headers["content-type"] = "application/x-www-form-urlencoded";
    return headers;
  }

  function csrfToken() {
    return decodeURIComponent((document.cookie.match(/(?:^|; )ct0=([^;]+)/) || [])[1] || "");
  }

  function readableApiError(text) {
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.errors) && parsed.errors[0]) {
        return parsed.errors.map((error) => error.message || error.code || JSON.stringify(error)).join("; ");
      }
      if (parsed.error) return String(parsed.error);
      if (parsed.message) return String(parsed.message);
    } catch (_error) {
      return text.slice(0, 160);
    }
    return text.slice(0, 160);
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  async function getApiUnfollowSession() {
    const data = await chrome.storage.local.get(API_UNFOLLOW_SESSION_KEY);
    return data[API_UNFOLLOW_SESSION_KEY] || null;
  }

  async function saveApiUnfollowSession(session) {
    await chrome.storage.local.set({ [API_UNFOLLOW_SESSION_KEY]: session });
  }

  function sessionSummary(session) {
    if (!session) return null;
    return {
      id: session.id,
      state: session.state,
      index: session.index,
      total: session.queue.length,
      delayMs: session.delayMs,
      ok: session.ok || 0,
      errors: session.errors || 0,
      resultCount: Array.isArray(session.results) ? session.results.length : 0
    };
  }

  async function updateUnfollowStatus(state, message) {
    const apiSession = await getApiUnfollowSession();
    const session = apiSession && ["running", "waiting", "pausing", "paused", "stopped", "done", "error"].includes(apiSession.state)
      ? apiSession
      : null;
    await chrome.storage.local.set({
      [UNFOLLOW_STATUS_KEY]: {
        state,
        message,
        index: session ? session.index : 0,
        total: session ? session.queue.length : 0,
        updatedAt: new Date().toISOString(),
        sourceUrl: location.href
      }
    });
  }

  function renderOverlay() {
    removeOverlay();
    const overlay = document.createElement("div");
    overlay.id = "xfbc-overlay";
    overlay.innerHTML = [
      '<div id="xfbc-title" style="font-weight:750;margin-bottom:5px">Scanning snapshot</div>',
      '<div id="xfbc-message">Starting scan</div>',
      '<button id="xfbc-stop" type="button" style="margin-top:10px;width:100%;border:1px solid #64748b;border-radius:6px;background:#1f2937;color:#f8fafc;padding:7px 9px;font:inherit;cursor:pointer">Stop scan</button>'
    ].join("");
    overlay.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "right:14px",
      "top:14px",
      "width:300px",
      "background:#0f172a",
      "color:#f9fafb",
      "border:1px solid #38bdf8",
      "border-radius:8px",
      "box-shadow:0 12px 40px rgba(0,0,0,.35)",
      "font:13px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "padding:12px"
    ].join(";");
    document.documentElement.appendChild(overlay);
    overlay.querySelector("#xfbc-stop").addEventListener("click", () => {
      if (activeScan) activeScan.stopRequested = true;
      updateOverlay("Stopping after current pass");
    });
  }

  function updateOverlay(customMessage) {
    const overlay = document.getElementById("xfbc-overlay");
    if (!overlay || !activeScan) return;
    const message = overlay.querySelector("#xfbc-message");
    message.textContent = customMessage || `${activeScan.kind}: ${activeScan.seen.size} found, ${activeScan.scrolls} scrolls`;
  }

  function removeOverlay() {
    const overlay = document.getElementById("xfbc-overlay");
    if (overlay) overlay.remove();
  }

  function renderApiUnfollowOverlay(session, customMessage) {
    const overlay = ensureApiUnfollowOverlay();
    const recent = (session.results || []).slice(-10).map((result) => {
      const emoji = result.status === "unfollowed" ? "✅" : result.status === "error" ? "⚠️" : "•";
      const label = result.status === "unfollowed" ? "unfollowed" : result.status;
      return `${emoji} ${label} @${result.username}`;
    });
    const percent = session.queue.length ? Math.round((session.index / session.queue.length) * 100) : 0;
    const meta = apiUnfollowStateMeta(session.state);
    const remaining = Math.max(0, session.queue.length - session.index);
    const actionMessage = customMessage || meta.message;
    const canPause = session.state === "running";
    const canResume = session.state === "paused";
    const canStop = session.state === "running" || session.state === "paused" || session.state === "pausing";
    const pauseLabel = session.state === "paused" ? "▶️ Resume" : "⏸️ Pause";

    overlay.dataset.xfbcState = session.state;
    overlay.querySelector("[data-xfbc-state-dot]").style.background = meta.color;
    overlay.querySelector("[data-xfbc-state-label]").textContent = meta.label;
    overlay.querySelector("[data-xfbc-progress-text]").textContent = `${session.index}/${session.queue.length}`;
    overlay.querySelector("[data-xfbc-success]").textContent = String(session.ok || 0);
    overlay.querySelector("[data-xfbc-left]").textContent = String(remaining);
    overlay.querySelector("[data-xfbc-progress-bar]").style.width = `${percent}%`;
    overlay.querySelector("[data-xfbc-message]").textContent = actionMessage;
    overlay.querySelector("[data-xfbc-errors]").textContent = `err=${session.errors || 0}`;
    overlay.querySelector("[data-xfbc-recent]").textContent = recent.join("\n") || "✨ waiting for first result";

    const flow = overlay.querySelector("[data-xfbc-flow]");
    flow.style.animationPlayState = session.state === "paused" ? "paused" : "running";
    flow.style.opacity = session.state === "paused" ? ".28" : "1";

    const controls = overlay.querySelector("[data-xfbc-controls]");
    const toggle = overlay.querySelector("[data-xfbc-toggle]");
    const stop = overlay.querySelector("[data-xfbc-stop]");
    const close = overlay.querySelector("[data-xfbc-close]");
    if (canPause || canResume) {
      controls.style.display = "grid";
      controls.style.gridTemplateColumns = "1fr 1fr";
      toggle.style.display = "";
      toggle.textContent = pauseLabel;
      stop.style.display = "";
      close.style.display = "none";
    } else if (canStop) {
      controls.style.display = "grid";
      controls.style.gridTemplateColumns = "1fr";
      toggle.style.display = "none";
      stop.style.display = "";
      close.style.display = "none";
    } else {
      controls.style.display = "none";
      close.style.display = "block";
    }
  }

  function ensureApiUnfollowOverlay() {
    const existing = document.getElementById("xfbc-api-unfollow-overlay");
    if (existing) return existing;

    const overlay = document.createElement("div");
    overlay.id = "xfbc-api-unfollow-overlay";
    overlay.innerHTML = [
      '<style>',
      '@keyframes xfbcSlideIn{from{opacity:0;transform:translateY(-8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes xfbcPulse{0%,100%{transform:scale(1);opacity:.72}50%{transform:scale(1.55);opacity:1}}',
      '@keyframes xfbcFlow{0%{transform:translateX(-100%)}100%{transform:translateX(220%)}}',
      '</style>',
      '<div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:12px">',
      '<div>',
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:3px">',
      '<span style="position:relative;width:13px;height:13px;display:inline-block"><span data-xfbc-state-dot style="position:absolute;left:1px;top:1px;width:11px;height:11px;border-radius:50%;background:#5eead4;animation:xfbcPulse 1.25s ease-in-out infinite"></span></span>',
      '<strong style="font-size:15px">🐱 X Followback Cleaner</strong>',
      '</div>',
      '<a href="https://x.com/ProfitKatze" target="_blank" rel="noreferrer" style="color:#93c5fd;text-decoration:none;font-size:12px">by @ProfitKatze</a>',
      '</div>',
      '<span data-xfbc-state-label style="border:1px solid rgba(148,163,184,.35);border-radius:999px;padding:5px 9px;background:rgba(15,23,42,.72);font-size:12px">⚡ Running</span>',
      '</div>',
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">',
      '<div style="border:1px solid rgba(148,163,184,.18);border-radius:7px;padding:9px;background:rgba(15,23,42,.58)"><div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Progress</div><strong data-xfbc-progress-text>0/0</strong></div>',
      '<div style="border:1px solid rgba(148,163,184,.18);border-radius:7px;padding:9px;background:rgba(15,23,42,.58)"><div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Success</div><strong data-xfbc-success>0</strong></div>',
      '<div style="border:1px solid rgba(148,163,184,.18);border-radius:7px;padding:9px;background:rgba(15,23,42,.58)"><div style="font-size:11px;color:#94a3b8;margin-bottom:2px">Left</div><strong data-xfbc-left>0</strong></div>',
      '</div>',
      '<div style="position:relative;height:8px;border-radius:999px;background:#1e293b;overflow:hidden;margin-bottom:10px">',
      '<div data-xfbc-progress-bar style="height:100%;width:0%;background:linear-gradient(90deg,#38bdf8,#5eead4);transition:width .35s ease"></div>',
      '<div data-xfbc-flow style="position:absolute;inset:0;width:40%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.32),transparent);animation:xfbcFlow 1.6s linear infinite"></div>',
      '</div>',
      '<div style="display:flex;justify-content:space-between;gap:10px;color:#cbd5e1;margin-bottom:10px"><span data-xfbc-message>處理中</span><span data-xfbc-errors>err=0</span></div>',
      '<div style="border-top:1px solid rgba(148,163,184,.18);padding-top:10px">',
      '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px">Recent actions</div>',
      '<pre data-xfbc-recent style="max-height:142px;overflow:auto;margin:0;white-space:pre-wrap;font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.4">✨ waiting for first result</pre>',
      '</div>',
      '<div data-xfbc-controls style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px">',
      '<button data-xfbc-toggle type="button" style="border:1px solid #38bdf8;border-radius:7px;background:#0f172a;color:#f8fafc;padding:9px 10px;font:13px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer">⏸️ Pause</button>',
      '<button data-xfbc-stop type="button" style="border:1px solid #fb7185;border-radius:7px;background:#3f111c;color:#fff1f2;padding:9px 10px;font:13px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer">🛑 Stop</button>',
      '</div>',
      '<button data-xfbc-close type="button" style="display:none;margin-top:14px;width:100%;border:1px solid #38bdf8;border-radius:7px;background:#0f172a;color:#f8fafc;padding:9px 10px;font:13px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;cursor:pointer">Close</button>'
    ].join("");
    overlay.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "top:40px",
      "right:24px",
      "width:min(520px,calc(100vw - 48px))",
      "max-height:min(560px,calc(100vh - 80px))",
      "overflow:auto",
      "background:linear-gradient(180deg,#07111f,#0b1324)",
      "color:#f8fafc",
      "border:1px solid rgba(56,189,248,.72)",
      "box-shadow:0 20px 56px rgba(0,0,0,.42)",
      "border-radius:8px",
      "font:14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "padding:16px",
      "animation:xfbcSlideIn .2s ease-out"
    ].join(";");
    document.documentElement.appendChild(overlay);
    overlay.querySelector("[data-xfbc-toggle]").addEventListener("click", () => {
      const action = overlay.dataset.xfbcState === "paused" ? resumeApiUnfollowSession : pauseApiUnfollowSession;
      action().catch((error) => updateUnfollowStatus("error", error.message));
    });
    overlay.querySelector("[data-xfbc-stop]").addEventListener("click", () => {
      stopApiUnfollowSession().catch((error) => updateUnfollowStatus("error", error.message));
    });
    overlay.querySelector("[data-xfbc-close]").addEventListener("click", removeApiUnfollowOverlay);
    return overlay;
  }

  function apiUnfollowStateMeta(state) {
    const stateMeta = {
      running: { label: "⚡ Running", color: "#5eead4", message: "處理中" },
      pausing: { label: "⏸️ Pausing", color: "#fbbf24", message: "正在暫停，會先完成目前這一筆" },
      paused: { label: "⏸️ Paused", color: "#fbbf24", message: "已暫停，可稍後繼續" },
      stopped: { label: "🛑 Stopped", color: "#fb7185", message: "已停止" },
      done: { label: "✅ Done", color: "#86efac", message: "批次完成" },
      error: { label: "⚠️ Error", color: "#fb7185", message: "遇到錯誤，已停止" }
    };
    return stateMeta[state] || stateMeta.running;
  }

  function removeApiUnfollowOverlay() {
    const overlay = document.getElementById("xfbc-api-unfollow-overlay");
    if (overlay) overlay.remove();
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
