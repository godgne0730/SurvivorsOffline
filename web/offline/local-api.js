/* Local transport/storage boundary. The original client keeps its guest rules and saves. */
(function installOfflineBoundary(global) {
  "use strict";
  if (global.__RO_OFFLINE__) return;

  const base = new URL(document.baseURI);
  const qa = base.searchParams.get("qa") === "1";
  const loopback = base.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  const nativeFetch = global.fetch.bind(global);
  const storage = global.localStorage;
  const storagePrototype = global.Storage.prototype;
  const originalSet = storagePrototype.setItem;
  const originalRemove = storagePrototype.removeItem;
  const originalClear = storagePrototype.clear;
  const missingAssets = [];
  const blockedRequests = [];
  const storageErrors = [];
  let saveTimer = null;
  let closing = false;

  function remember(list, entry) {
    list.push(entry);
    if (list.length > 256) list.shift();
    if (qa && list === missingAssets) console.error("[offline missing asset]", entry.url, entry.error ?? entry.status);
  }

  function urlOf(input) {
    return new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, base);
  }

  function localResource(url) {
    return (loopback && url.origin === base.origin && ["http:", "https:"].includes(url.protocol)) ||
      url.protocol === "data:" || (url.protocol === "blob:" && url.origin === base.origin);
  }

  function blocked(url, method, transport, reason) {
    // No request bodies, session headers, or external query secrets enter diagnostics.
    const safeURL = new URL(url);
    safeURL.username = "";
    safeURL.password = "";
    if (safeURL.origin !== base.origin) safeURL.search = "";
    remember(blockedRequests, { url: safeURL.href, method, transport, reason });
  }

  function networkError(url, method, transport) {
    blocked(url, method, transport, "network-disabled");
    return new DOMException("RO Survivors Offline does not allow this network request.", "SecurityError");
  }

  function json(value, status = 200) {
    return new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }

  function localRead(url, method) {
    if (url.pathname === "/status.json" && method === "GET") return json({ state: "ok", offline: true });
    if (!url.pathname.startsWith("/api/")) return null;
    blocked(url, method, "fetch", "online-api-disabled");
    if (method === "GET") {
      if (url.pathname === "/api/lobbies") return json({ lobbies: [], offline: true });
      if (url.pathname === "/api/mail") return json({ mail: [], pending: 0, offline: true });
      if (url.pathname === "/api/ladder") {
        return json({ season: "all", seasons: [], rows: [], me: [], offline: true });
      }
    }
    // Never pretend that login, a server save, a purchase, or a reward succeeded.
    return json({ error: "offlineUnavailable", offline: true, endpoint: url.pathname }, 503);
  }

  global.fetch = async function offlineFetch(input, options) {
    const url = urlOf(input);
    const method = String(options?.method ?? input?.method ?? "GET").toUpperCase();
    if (!localResource(url)) throw networkError(url, method, "fetch");
    const response = url.origin === base.origin ? localRead(url, method) : null;
    if (response) return response;
    if (method !== "GET" && method !== "HEAD") throw networkError(url, method, "fetch");
    try {
      // A local redirect must not escape this check through the native fetch implementation.
      const result = await nativeFetch(input, { ...options, redirect: "error" });
      if (!result.ok) remember(missingAssets, { url: url.href, status: result.status });
      return result;
    } catch (error) {
      remember(missingAssets, { url: url.href, error: String(error) });
      throw error;
    }
  };

  class OfflineWebSocket {
    constructor(url) { throw networkError(new URL(url, base), "CONNECT", "WebSocket"); }
  }
  Object.assign(OfflineWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  global.WebSocket = OfflineWebSocket;
  if (global.EventSource) {
    global.EventSource = class OfflineEventSource {
      constructor(url) { throw networkError(new URL(url, base), "CONNECT", "EventSource"); }
    };
  }
  if (global.navigator?.sendBeacon) {
    global.navigator.sendBeacon = function offlineBeacon(url) {
      blocked(new URL(url, base), "POST", "beacon", "network-disabled");
      return false;
    };
  }
  if (global.XMLHttpRequest) {
    const open = global.XMLHttpRequest.prototype.open;
    global.XMLHttpRequest.prototype.open = function offlineOpen(method, input, ...rest) {
      const url = new URL(input, base);
      const verb = String(method).toUpperCase();
      if (!localResource(url) || !["GET", "HEAD"].includes(verb) || url.pathname.startsWith("/api/")) {
        throw networkError(url, verb, "XMLHttpRequest");
      }
      // The loopback server never redirects; CSP also restricts XHR destinations.
      return open.call(this, method, input, ...rest);
    };
  }

  function storageFailure(error, operation) {
    const entry = { operation, message: String(error) };
    remember(storageErrors, entry);
    console.error("[offline storage]", operation, error);
    global.dispatchEvent(new CustomEvent("ro-offline-storage-error", { detail: entry }));
  }

  function snapshotStorage() {
    const values = Object.create(null);
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key !== null) values[key] = storage.getItem(key);
    }
    return values;
  }

  function flushStorage() {
    if (saveTimer !== null) global.clearTimeout(saveTimer);
    saveTimer = null;
    try {
      if (global.__RO_OFFLINE_BOOT_ERROR__) throw new Error(global.__RO_OFFLINE_BOOT_ERROR__);
      const values = snapshotStorage();
      global.webkit?.messageHandlers?.offlineStorage?.postMessage({ values });
      global.dispatchEvent(new CustomEvent("ro-offline-storage", { detail: { values } }));
      return values;
    } catch (error) {
      storageFailure(error, "flush");
      throw error;
    }
  }

  function changed() {
    if (closing || document.hidden) return flushStorage();
    if (saveTimer === null) saveTimer = global.setTimeout(() => {
      // A failed native backup remains visible; the synchronous browser save is still intact.
      try { flushStorage(); } catch (_) { /* already reported by flushStorage */ }
    }, 250);
  }

  for (const [method, original] of [["setItem", originalSet], ["removeItem", originalRemove], ["clear", originalClear]]) {
    storagePrototype[method] = function trackedStorageWrite(...args) {
      try {
        const result = original.apply(this, args);
        if (this === storage) changed();
        return result;
      } catch (error) {
        if (this === storage) storageFailure(error, method);
        throw error;
      }
    };
  }

  function restoreStorage(values) {
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new TypeError("Expected a storage dictionary.");
    const entries = Object.entries(values);
    const encoder = new TextEncoder();
    let size = 0;
    for (const [key, value] of entries) {
      if (typeof value !== "string") throw new TypeError("Storage values must be strings.");
      const keySize = encoder.encode(key).length, valueSize = encoder.encode(value).length;
      if (keySize > 512 || valueSize > 8_000_000) throw new RangeError("Storage entry is too large.");
      size += keySize + valueSize;
    }
    // Same limits as OfflineSaveStore, so a successful import can also be backed up natively.
    if (entries.length > 512 || size > 24_000_000) throw new RangeError("Storage backup is too large.");
    const previous = snapshotStorage();
    try {
      originalClear.call(storage);
      for (const [key, value] of entries) originalSet.call(storage, key, value);
    } catch (error) {
      try {
        originalClear.call(storage);
        for (const [key, value] of Object.entries(previous)) originalSet.call(storage, key, value);
      } catch (rollbackError) { storageFailure(rollbackError, "restore rollback"); }
      storageFailure(error, "restore");
      throw error;
    }
    return flushStorage();
  }

  global.__RO_OFFLINE__ = Object.freeze({
    version: 1, missingAssets, blockedRequests, storageErrors,
    snapshotStorage, restoreStorage, flushStorage
  });
  global.addEventListener("pagehide", () => {
    closing = true;
    try { flushStorage(); } catch (_) { /* already reported */ }
  });
  global.addEventListener("pageshow", () => { closing = false; });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try { flushStorage(); } catch (_) { /* already reported */ }
    }
  });
  global.addEventListener("error", event => {
    const resource = event.target?.currentSrc || event.target?.src || event.target?.href;
    if (resource && event.target !== global) remember(missingAssets, { url: resource, error: "resource-load" });
  }, true);
})(window);
