(function initBackground() {
  "use strict";

  const SCAN_ZOOM_KEY = "xfbc.scanZoomOriginals";
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "XFBC_OPEN_AND_SCAN") {
      openAndScan(message.tabId, message.handle, message.kind)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "XFBC_PREPARE_SCAN_ZOOM") {
      prepareScanZoom(sender.tab && sender.tab.id, message.zoomFactor)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "XFBC_RESTORE_SCAN_ZOOM") {
      restoreScanZoom(sender.tab && sender.tab.id)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    removeOriginalZoom(tabId);
  });

  async function prepareScanZoom(tabId, zoomFactor) {
    if (!tabId) throw new Error("No sender tab for scan zoom.");
    const currentZoom = await chrome.tabs.getZoom(tabId);
    const originals = await getOriginalZooms();
    if (!Object.prototype.hasOwnProperty.call(originals, tabId)) {
      originals[tabId] = currentZoom;
      await setOriginalZooms(originals);
    }

    const targetZoom = clampZoom(Number(zoomFactor) || 0.67);
    if (Math.abs(currentZoom - targetZoom) > 0.01) {
      await chrome.tabs.setZoom(tabId, targetZoom);
    }

    return {
      tabId,
      originalZoom: originals[tabId],
      activeZoom: targetZoom
    };
  }

  async function restoreScanZoom(tabId) {
    if (!tabId) throw new Error("No sender tab for scan zoom restore.");
    const originals = await getOriginalZooms();
    const originalZoom = originals[tabId];
    if (!originalZoom) return { tabId, restored: false };

    await chrome.tabs.setZoom(tabId, originalZoom);
    delete originals[tabId];
    await setOriginalZooms(originals);
    return { tabId, restored: true, activeZoom: originalZoom };
  }

  async function getOriginalZooms() {
    const data = await chrome.storage.local.get(SCAN_ZOOM_KEY);
    return data[SCAN_ZOOM_KEY] && typeof data[SCAN_ZOOM_KEY] === "object" ? data[SCAN_ZOOM_KEY] : {};
  }

  async function setOriginalZooms(originals) {
    await chrome.storage.local.set({ [SCAN_ZOOM_KEY]: originals });
  }

  async function removeOriginalZoom(tabId) {
    const originals = await getOriginalZooms();
    if (Object.prototype.hasOwnProperty.call(originals, tabId)) {
      delete originals[tabId];
      await setOriginalZooms(originals);
    }
  }

  async function openAndScan(tabId, handle, kind) {
    const username = normalizeHandle(handle);
    const scanKind = kind === "following" ? "following" : "followers";
    if (!tabId) throw new Error("No active tab found.");
    if (!username) throw new Error("Enter your X handle first.");

    const url = `https://x.com/${username}/${scanKind}`;
    await chrome.tabs.update(tabId, { url, active: true });
    await waitForTabComplete(tabId);
    await sleep(1200);
    await ensureContentScripts(tabId);

    return await sendTabMessage(tabId, { type: "XFBC_START_SCAN_ASYNC", kind: scanKind });
  }

  async function ensureContentScripts(tabId) {
    const ping = await trySendTabMessage(tabId, { type: "XFBC_PING" });
    if (ping && ping.ok) return;

    const prefix = assetPrefix();
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [`${prefix}lib/core.js`, `${prefix}content.js`]
    });

    const injectedPing = await trySendTabMessage(tabId, { type: "XFBC_PING" });
    if (!injectedPing || !injectedPing.ok) throw new Error("Opened X page, but scanner did not load.");
  }

  function sendTabMessage(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function trySendTabMessage(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    });
  }

  function waitForTabComplete(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.get(tabId, (tab) => {
        if (tab && tab.status === "complete") {
          resolve();
          return;
        }

        const listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    });
  }

  function assetPrefix() {
    const popup = chrome.runtime.getManifest().action.default_popup || "";
    return popup.startsWith("extension/") ? "extension/" : "";
  }

  function normalizeHandle(value) {
    let username = String(value || "").trim();
    username = username.replace(/^@+/, "");
    username = username.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "");
    username = username.split(/[/?#]/)[0];
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) return "";
    return RESERVED_HANDLES.has(username.toLowerCase()) ? "" : username;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clampZoom(value) {
    if (!Number.isFinite(value)) return 0.67;
    return Math.min(Math.max(value, 0.25), 1);
  }
})();
