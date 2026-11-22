// Downloading the documents found in a portal page, one after the other, and remembering per
// job which were downloaded already. Runs in the panel; the queue ends when the panel closes.
//
// A link is downloaded with the browser's download interface, with the browser's cookies for
// the portal, into "Portal-Download/<job>/" below the download folder. A button is clicked in
// the page; whatever download the browser then starts counts as its document, and in Chrome
// it is put into the same folder. A button that opens the document in a new tab instead: the
// tab's address is downloaded and the tab closed.

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

// Query parameters that change from visit to visit without naming another document.
const VOLATILE = /^(s|t|ts|_|sid|session|sessionid|jsessionid|phpsessid|token|csrf|xsrf|nonce|cb|cache|rnd|rand|random|timestamp|time|expires|signature|sig|x-amz-.*|utm_.*)$/i;

/** What identifies a document across visits: its address without volatile parameters, or a button's words. */
export function docKey(item) {
  if (item.url) {
    try {
      const u = new URL(item.url);
      const kept = [...u.searchParams].filter(([k]) => !VOLATILE.test(k)).sort(([a], [b]) => a.localeCompare(b));
      return `u:${u.origin}${u.pathname}?${new URLSearchParams(kept)}`;
    } catch { return `u:${item.url}`; }
  }
  return `b:${(item.label || "").toLowerCase()}#${item.nth || 0}`;
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

/** The file name a link would give, if its address ends in one. */
function nameFromUrl(url) {
  try { const p = new URL(url).pathname; const n = decodeURIComponent(p.slice(p.lastIndexOf("/") + 1)); return /\.[a-z0-9]{2,5}$/i.test(n) ? n : ""; } catch { return ""; }
}

/** Waits until the download id ends: its file name, or an error. */
function settle(id, ms = 5 * 60000) {
  return new Promise((resolve) => {
    const done = (r) => { clearTimeout(timer); api.downloads.onChanged.removeListener(on); resolve(r); };
    const on = async (d) => {
      if (d.id !== id || !d.state) return;
      if (d.state.current === "complete") { const [it] = await api.downloads.search({ id }); done({ ok: true, file: it ? it.filename : "" }); }
      if (d.state.current === "interrupted") { const [it] = await api.downloads.search({ id }); done({ ok: false, error: (it && it.error) || "interrupted" }); }
    };
    const timer = setTimeout(() => done({ ok: false, error: "timeout" }), ms);
    api.downloads.onChanged.addListener(on);
    // It may have ended before the listener came.
    api.downloads.search({ id }).then(([it]) => { if (it && it.state === "complete") done({ ok: true, file: it.filename }); else if (it && it.state === "interrupted") done({ ok: false, error: it.error || "interrupted" }); });
  });
}

/**
 * Downloads the items one after the other. items: [{n, kind, url, label, frameId, i}];
 * click(item) clicks a button in the page. onStep(n, status) reports each step: "running",
 * then { ok, file } or { ok: false, error }. stop() returning true ends the queue.
 */
export async function runQueue({ items, tabId, pageUrl, folder, click, onStep, stop, pause = 1500, wait = 20000 }) {
  // In Chrome every download started meanwhile (by the extension or by a clicked button) goes
  // into the job's folder; Firefox has no such hook and keeps the button's downloads where it
  // puts downloads.
  let expecting = false;
  const ours = new Set();
  const place = (item, suggest) => {
    if (expecting || ours.has(item.id)) { suggest({ filename: `${folder}/${withEnding(item.filename.split(/[\\/]/).pop(), item.mime)}`, conflictAction: "uniquify" }); return; }
    suggest();
  };
  const canPlace = !!api.downloads.onDeterminingFilename;
  if (canPlace) api.downloads.onDeterminingFilename.addListener(place);
  try {
    for (const item of items) {
      if (stop()) break;
      onStep(item.n, "running");
      let result;
      try {
        if (item.url) {
          const name = nameFromUrl(item.url);
          const opts = { url: item.url, conflictAction: "uniquify", saveAs: false };
          // Without the hook the folder can only be given with the name; a name is known only from the address.
          if (!canPlace && name) opts.filename = `${folder}/${name}`;
          expecting = true;
          const id = await api.downloads.download(opts);
          ours.add(id);
          expecting = false;
          result = await settle(id);
        } else {
          result = await clickAndCatch(item);
        }
      } catch (e) { expecting = false; result = { ok: false, error: String((e && e.message) || e) }; }
      onStep(item.n, result);
      // The page went elsewhere: the remaining items are no longer there.
      if (result.stop) break;
      await sleep(pause);
    }
  } finally {
    if (canPlace) api.downloads.onDeterminingFilename.removeListener(place);
  }

  // A button: clicked in the page; the first download the browser starts, or the first tab it opens from this one, is its document.
  async function clickAndCatch(item) {
    let onCreated, onTab, onNav, timer;
    const caught = new Promise((resolve) => {
      onCreated = (d) => resolve({ download: d.id });
      onTab = (t) => { if (t.openerTabId === tabId) resolve({ tab: t.id }); };
      // A change of the "#…" part only is no navigation.
      const bare = (u) => String(u).split("#")[0];
      onNav = (id, info) => { if (id === tabId && info.url && bare(info.url) !== bare(pageUrl)) resolve({ navigated: info.url }); };
      timer = setTimeout(() => resolve({ none: true }), wait);
      api.downloads.onCreated.addListener(onCreated);
      api.tabs.onCreated.addListener(onTab);
      api.tabs.onUpdated.addListener(onNav);
    });
    expecting = true;
    try {
      await click(item);
      const got = await caught;
      if (got.download !== undefined) { ours.add(got.download); return await settle(got.download); }
      if (got.tab !== undefined) return await fromTab(got.tab);
      if (got.navigated) return { ok: false, error: "navigated", stop: true };
      return { ok: false, error: "nothing" };
    } finally {
      expecting = false;
      clearTimeout(timer);
      api.downloads.onCreated.removeListener(onCreated);
      api.tabs.onCreated.removeListener(onTab);
      api.tabs.onUpdated.removeListener(onNav);
    }
  }

  // A tab the button opened: once it has an address, that address is downloaded and the tab closed.
  async function fromTab(id) {
    let url = "";
    for (let k = 0; k < 40 && !/^https?:/i.test(url); k++) { await sleep(250); try { url = (await api.tabs.get(id)).url || ""; } catch { return { ok: false, error: "tab_closed" }; } }
    if (!/^https?:/i.test(url)) return { ok: false, error: "tab_open" };
    const name = nameFromUrl(url);
    const opts = { url, conflictAction: "uniquify", saveAs: false };
    if (!canPlace && name) opts.filename = `${folder}/${name}`;
    expecting = true;
    const did = await api.downloads.download(opts);
    ours.add(did);
    expecting = false;
    const r = await settle(did);
    if (r.ok) api.tabs.remove(id).catch(() => {});
    return r;
  }
}
