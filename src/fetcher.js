// Downloading the documents found in a portal page, one after the other, and remembering per
// job which were downloaded already. Runs in the panel; the queue ends when the panel closes.
//
// A link is downloaded with the browser's download interface, with the browser's cookies for
// the portal (in Firefox those of the tab's container), into "Portal-Download/<job>/" below the
// download folder. In Firefox a link without a file name in its address is fetched by the
// extension and saved under the name the server gives (see viaFetch). A button is clicked in the page; the first download from the portal that
// follows counts as its document, and in Chrome it is put into the same folder. A button that
// opens a new tab: a download that tab starts counts, else the tab's address is downloaded and
// the tab closed. A web page that comes back instead of a document (a login page after the
// session ended) counts as a failure and is deleted again.

const api = globalThis.browser ?? globalThis.chrome;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One part of a path, safe on every system: no separators, no reserved characters. */
export function safeName(s, fallback = "Portal") {
  const clean = String(s || "").normalize("NFC").replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim().replace(/^[.\s]+|[.\s]+$/g, "");
  const cut = [...clean].slice(0, 60).join("").trim();
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cut) || !cut ? fallback : cut;
}

/** The folder below the download folder: one per job, else one per site. */
export function folderFor(job, pageUrl) {
  if (job) return `Portal-Download/${safeName(job.title)}`;
  let host = "";
  try { host = new URL(pageUrl).hostname; } catch { /* stays empty */ }
  return `Portal-Download/${safeName(host)}`;
}

// Query parameters that change from visit to visit without naming another document. A
// parameter that might name the document (token, id, t) stays: better downloaded twice than missed.
const VOLATILE = /^(ts|_|sid|session|sessionid|jsessionid|phpsessid|csrf|xsrf|nonce|cb|cache|rnd|rand|random|timestamp|expires|signature|sig|x-amz-.*|utm_.*)$/i;

/** What identifies a document across visits: its address without volatile parameters, or a button's words. */
export function docKey(item) {
  if (item.url) {
    try {
      const u = new URL(item.url);
      const kept = [...u.searchParams].filter(([k]) => !VOLATILE.test(k)).sort(([a], [b]) => a.localeCompare(b));
      return `u:${u.origin}${u.pathname}?${new URLSearchParams(kept)}`;
    } catch { return `u:${item.url}`; }
  }
  // A button: the page it is on, the row it stands in, its words, and its order among equal ones.
  // The page with its query (without volatile parameters) and its "#…" part, which single-page portals use as their address.
  let page = "";
  try {
    const u = new URL(item.page || "");
    const kept = [...u.searchParams].filter(([k]) => !VOLATILE.test(k)).sort(([a], [b]) => a.localeCompare(b));
    page = `${u.origin}${u.pathname}?${new URLSearchParams(kept)}${u.hash}`;
  } catch { /* no page */ }
  return `b:${page}|${(item.context || "").toLowerCase()}|${(item.label || "").toLowerCase()}#${item.nth || 0}`;
}

async function digest(s) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What was downloaded already, per job (or per site), kept in storage.local as digests only:
 * the store names no address and no document.
 */
export const remembered = {
  async get(scope) {
    const { downloaded = {} } = await api.storage.local.get("downloaded");
    return downloaded[await digest(scope)] || {};
  },
  async keyOf(item) { return digest(docKey(item)); },
  async add(scope, keys) {
    const s = await digest(scope);
    const { downloaded = {} } = await api.storage.local.get("downloaded");
    const at = new Date().toISOString().slice(0, 10);
    downloaded[s] = { ...(downloaded[s] || {}), ...Object.fromEntries(keys.map((k) => [k, at])) };
    await api.storage.local.set({ downloaded });
  },
  async forget(scope) {
    const s = await digest(scope);
    const { downloaded = {} } = await api.storage.local.get("downloaded");
    delete downloaded[s];
    await api.storage.local.set({ downloaded });
  },
};

// The ending a file gets from its type, when the portal sends a name without one.
const ENDINGS = { "application/pdf": "pdf", "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "application/vnd.oasis.opendocument.text": "odt", "application/vnd.oasis.opendocument.spreadsheet": "ods", "application/zip": "zip", "application/xml": "xml", "text/xml": "xml", "text/csv": "csv", "text/plain": "txt", "image/tiff": "tif", "image/jpeg": "jpg", "image/png": "png", "message/rfc822": "eml" };
export function withEnding(name, mime) {
  const ending = ENDINGS[String(mime || "").split(";")[0].trim().toLowerCase()];
  return ending && !/\.[a-z0-9]{2,5}$/i.test(name) ? `${name}.${ending}` : name;
}

/** The file name the server gives in its Content-Disposition header, if any; safe on every system. */
export function nameFromHeader(cd) {
  const v = String(cd || "");
  let n = "";
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(v);
  if (star) { try { n = decodeURIComponent(star[2].trim().replace(/^"|"$/g, "")); } catch { n = ""; } }
  if (!n) { const m = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(v); if (m) n = (m[2] ?? m[1]).trim(); }
  n = n.split(/[\\/]/).pop();
  const m = /^(.*?)(\.[a-z0-9]{2,5})?$/i.exec(n);
  return m && m[1] ? `${safeName(m[1], "document")}${(m[2] || "").toLowerCase()}` : "";
}

/** The file name a link would give, if its address ends in one; safe on every system. */
function nameFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const n = decodeURIComponent(p.slice(p.lastIndexOf("/") + 1));
    const m = /^(.*?)(\.[a-z0-9]{2,5})$/i.exec(n);
    return m ? `${safeName(m[1], "document")}${m[2].toLowerCase()}` : "";
  } catch { return ""; }
}

/**
 * Downloads the items one after the other. items: [{n, kind, url, label, frameId, i}];
 * click(item) clicks a button in the page. onStep(n, status) reports each step: "running",
 * then { ok, file } or { ok: false, error }. stop() returning true ends the queue, also while
 * one document waits.
 */
export async function runQueue({ items, tabId, pageUrl, folder, click, alive = null, onStep, stop, pause = 1500, wait = 20000, grace = 3000, poll = 250, longest = 5 * 60000 }) {
  const origin = (() => { try { return new URL(pageUrl).origin; } catch { return ""; } })();
  const bare = (u) => String(u || "").split("#")[0];
  const sameSite = (u, o = origin) => { try { return !!o && new URL(u).origin === o; } catch { return false; } };
  const self = api.runtime && api.runtime.id;
  // A download the page started, from the portal: neither by an extension nor from elsewhere.
  const fromSite = (d, o = origin) => !d.byExtensionId && (sameSite(d.referrer, o) || sameSite(d.url, o) || sameSite(d.finalUrl, o));
  // In Firefox a container tab: its cookies are the ones logged in to the portal. The normal store
  // is not named: Firefox takes it anyway, and naming any store needs the "cookies" permission.
  let jar = {};
  try { const tab = await api.tabs.get(tabId); if (tab && tab.cookieStoreId && tab.cookieStoreId !== "firefox-default") jar = { cookieStoreId: tab.cookieStoreId }; } catch { /* no tab */ }

  // In Chrome our own downloads, and the one download a click is waiting for, go into the job's
  // folder; every other download of the browser is left alone. Firefox has no such hook.
  let catching = null;
  // Downloads taken as a document, by id: their name may be decided only after the click's wait ended.
  const claimed = new Set();
  const place = (d, suggest) => {
    const name = (d.filename || "").split(/[\\/]/).pop();
    if (name && ((self && d.byExtensionId === self) || claimed.has(d.id) || (catching && catching(d)))) { suggest({ filename: `${folder}/${withEnding(name, d.mime)}`, conflictAction: "uniquify" }); return; }
    suggest();
  };
  const canPlace = !!api.downloads.onDeterminingFilename;
  if (canPlace) api.downloads.onDeterminingFilename.addListener(place);

  const download = (url) => {
    const opts = { url, conflictAction: "uniquify", saveAs: false, ...jar };
    // Without the hook the folder can only be given with the name; a name is known only from the address.
    const name = canPlace ? "" : nameFromUrl(url);
    if (name) opts.filename = `${folder}/${name}`;
    // A container the browser refuses (without the "cookies" permission): with the normal store; if
    // that is not logged in, a web page comes back and is reported as such.
    return api.downloads.download(opts).catch((e) => {
      if (!opts.cookieStoreId || !/cookieStoreId/i.test(String((e && e.message) || e))) throw e;
      delete opts.cookieStoreId;
      return api.downloads.download(opts);
    });
  };

  // Firefox takes the name of a download an extension starts from the address only, not from the
  // server's header: a link without a file name in its address would be saved as "documentDownload".
  // There the extension fetches the document itself, with the browser's cookies for the portal,
  // and saves it under the server's name into the job's folder. When that does not give a
  // document (not logged in for the extension's request, an error), the browser's download as before.
  const viaFetch = async (url) => {
    let r;
    try { r = await fetch(url, { credentials: "include", cache: "no-store" }); } catch { return null; }
    const mime = r.headers.get("content-type") || "";
    if (!r.ok || /^(text\/html|application\/xhtml\+xml)\b/i.test(mime)) return null;
    let blob;
    try { blob = await r.blob(); } catch { return null; }
    const base = nameFromHeader(r.headers.get("content-disposition")) || nameFromUrl(r.url) || safeName(new URL(url).pathname.split("/").pop(), "document");
    const href = URL.createObjectURL(blob);
    try { return await settle(await api.downloads.download({ url: href, filename: `${folder}/${withEnding(base, mime)}`, conflictAction: "uniquify", saveAs: false })); }
    finally { URL.revokeObjectURL(href); }
  };
  const link = async (url) => {
    if (!canPlace && !jar.cookieStoreId && !nameFromUrl(url)) { const r = await viaFetch(url); if (r) return r; }
    return settle(await download(url));
  };

  try {
    for (const item of items) {
      if (stop()) break;
      await onStep(item.n, "running");
      let result;
      try { result = item.url ? await link(item.url) : await clickAndCatch(item); }
      catch (e) { result = { ok: false, error: String((e && e.message) || e) }; }
      await onStep(item.n, result);
      // The page went elsewhere: the remaining items are no longer there.
      if (result.stop) break;
      if (!stop()) await sleep(pause);
    }
  } finally {
    if (canPlace) api.downloads.onDeterminingFilename.removeListener(place);
  }

  /** Waits until the download ends: its file, or an error. A web page instead of a document is deleted. */
  async function settle(id) {
    const started = Date.now();
    for (;;) {
      const [d] = await api.downloads.search({ id });
      if (d && d.state === "complete") {
        if (/^(text\/html|application\/xhtml\+xml)\b/i.test(d.mime || "")) { try { await api.downloads.removeFile(id); await api.downloads.erase({ id }); } catch { /* left as it is */ } return { ok: false, error: "html" }; }
        return { ok: true, file: d.filename };
      }
      if (!d || d.state === "interrupted") return { ok: false, error: (d && d.error) || "interrupted" };
      if (stop()) return { ok: false, error: "stopped" };
      if (Date.now() - started > longest) return { ok: false, error: "timeout" };
      await sleep(poll);
    }
  }

  /** A button: clicked in the page; what follows from the portal is its document. */
  async function clickAndCatch(item) {
    const seen = { downloads: [], others: [], tab: null, loading: false };
    // From the portal, or from the tab the click opened: its document. A download without any
    // origin (a file server under no-referrer, a file the page made itself) is kept aside as a
    // last resort; one with another site's referrer is someone else's and left alone.
    const take = (d) => { seen.downloads.push(d.id); claimed.add(d.id); };
    const onCreated = (d) => {
      if (fromSite(d) || (seen.tab && seen.tab.origin && fromSite(d, seen.tab.origin))) take(d);
      else if (originless(d)) seen.others.push(d);
    };
    const onTab = (t) => { if (t.openerTabId === tabId && !seen.tab) seen.tab = { id: t.id, origin: "" }; };
    const onNav = (id, info) => { if (id === tabId && info.status === "loading") seen.loading = true; };
    // Moved into the job's folder while the click waits: what it would take, the last resort included.
    const originless = (d) => !d.byExtensionId && (!d.referrer || /^(data|blob):/i.test(d.url || ""));
    catching = (d) => fromSite(d) || !!(seen.tab && seen.tab.origin && fromSite(d, seen.tab.origin)) || originless(d);
    api.downloads.onCreated.addListener(onCreated);
    api.tabs.onCreated.addListener(onTab);
    api.tabs.onUpdated.addListener(onNav);
    const moved = async () => { try { return bare((await api.tabs.get(tabId)).url) !== bare(pageUrl); } catch { return true; } };
    try {
      // Still the page that was searched? Asked in the page itself where possible: a single-page
      // portal may change its address and keep its elements. A frame gone affects only its items.
      if (alive) {
        let same = true;
        try { same = await alive(item); } catch { same = false; }
        if (!same) return item.frameId ? { ok: false, error: "gone" } : { ok: false, error: "navigated", stop: true };
      } else if (await moved()) return { ok: false, error: "navigated", stop: true };
      let pressed;
      try { pressed = await click(item); } catch { pressed = { gone: true }; }
      if (pressed && pressed.gone) return (seen.loading || (await moved())) ? { ok: false, error: "navigated", stop: true } : { ok: false, error: "gone" };
      const until = Date.now() + wait;
      let loadingSince = 0;
      while (Date.now() < until) {
        if (seen.downloads.length) break;
        if (seen.tab) break;
        if (stop()) return { ok: false, error: "stopped" };
        // The page started loading: a download it turns into shows up soon; else it went elsewhere
        // or loaded anew, and the elements found are gone either way.
        if (seen.loading && !loadingSince) loadingSince = Date.now();
        if (loadingSince && Date.now() - loadingSince > grace) {
          if (await moved()) return { ok: false, error: "navigated", stop: true };
          // Same address: loaded anew, or only its "#…" part changed. Only a page loaded anew has forgotten what was found.
          let same = true;
          if (alive) { try { same = await alive(item); } catch { same = false; } }
          if (!same) return { ok: false, error: "navigated", stop: true };
          loadingSince = Infinity;
        }
        await sleep(poll);
      }
      if (seen.downloads.length) { catching = null; return await settle(seen.downloads[0]); }
      if (seen.tab) return await fromTab(seen);
      // Nothing from the portal, but exactly one other download began after the click: most likely its document.
      if (seen.others.length === 1) { claimed.add(seen.others[0].id); return await settle(seen.others[0].id); }
      return { ok: false, error: "nothing" };
    } finally {
      catching = null;
      api.downloads.onCreated.removeListener(onCreated);
      api.tabs.onCreated.removeListener(onTab);
      api.tabs.onUpdated.removeListener(onNav);
    }
  }

  /** A tab the button opened: a download it starts counts; else its address is downloaded and the tab closed. */
  async function fromTab(seen) {
    const id = seen.tab.id;
    let url = "", gone = false;
    const until = Date.now() + Math.max(wait / 2, 2000);
    while (Date.now() < until && !seen.downloads.length) {
      try { url = (await api.tabs.get(id)).url || ""; } catch { gone = true; }
      if (/^https?:/i.test(url)) {
        seen.tab.origin = new URL(url).origin;
        // Downloads that came before the tab's address was known are looked at again.
        for (const d of seen.others) if (fromSite(d, seen.tab.origin) && !seen.downloads.includes(d.id)) take(d);
        break;
      }
      if (gone) break;
      if (stop()) return { ok: false, error: "stopped" };
      await sleep(poll);
    }
    // A tab that loads an attachment turns into a download and may close itself: give it a moment.
    const extra = Date.now() + grace;
    while (!seen.downloads.length && Date.now() < extra && !gone) { await sleep(poll); try { await api.tabs.get(id); } catch { gone = true; } }
    let r;
    if (seen.downloads.length) { catching = null; r = await settle(seen.downloads[0]); }
    else if (!gone) {
      // The address it ended at, after redirects.
      try { url = (await api.tabs.get(id)).url || url; } catch { gone = true; }
      if (gone || !/^https?:/i.test(url)) {
        // A tab without an address of its own, but one download without origin: that is it.
        if (seen.others.length === 1) { claimed.add(seen.others[0].id); r = await settle(seen.others[0].id); if (r.ok && !gone) api.tabs.remove(id).catch(() => {}); return r; }
        return { ok: false, error: gone ? "nothing" : "tab_open" };
      }
      r = await settle(await download(url));
    }
    else if (seen.others.length === 1) { claimed.add(seen.others[0].id); return await settle(seen.others[0].id); }
    else return { ok: false, error: gone ? "nothing" : "tab_open" };
    if (r.ok) api.tabs.remove(id).catch(() => {});
    return r;
  }
}
