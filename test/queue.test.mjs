// The download queue against a stand-in for the browser's downloads and tabs: links, buttons,
// downloads of the user or of other extensions meanwhile, a tab that turns into a download, a
// web page instead of a document, stopping, and a page that goes elsewhere.
// FETCHER_SRC may point at another copy of fetcher.js (for red proofs).
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const event = () => { const ls = new Set(); return { addListener: (f) => ls.add(f), removeListener: (f) => ls.delete(f), fire: (...a) => [...ls].forEach((f) => f(...a)), get size() { return ls.size; } }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORTAL = "https://portal.example/invoices";
let world;
function reset() {
  world = { downloads: new Map(), next: 1, placed: {}, removed: [], tabs: new Map([[1, { id: 1, url: PORTAL }]]), closed: [], requested: [] };
}
const dl = { onCreated: event(), onDeterminingFilename: event(),
  async download(opts) {
    world.requested.push(opts.url);
    return start({ url: opts.url, byExtensionId: "ours", referrer: "", mime: opts.url.endsWith(".html") ? "text/html" : "application/pdf" });
  },
  async search({ id }) { const d = world.downloads.get(id); return d ? [{ ...d }] : []; },
  async removeFile(id) { world.removed.push(id); }, async erase() {},
};
/** A download as the browser starts it: created, its name decided, complete a moment later. */
function start(d) {
  const id = world.next++;
  const item = { id, state: "in_progress", filename: d.url.split("/").pop(), finalUrl: d.url, ...d };
  world.downloads.set(id, item);
  // late: the name is decided only when the server's headers come, after the click's wait ended.
  const late = d.late || 0;
  setTimeout(() => {
    dl.onCreated.fire({ ...item });
    setTimeout(() => {
      dl.onDeterminingFilename.fire({ ...item }, (s) => { world.placed[id] = s ? s.filename : null; });
      setTimeout(() => { item.state = "complete"; item.filename = `/home/u/Downloads/${world.placed[id] || item.filename}`; }, 20);
    }, late);
  }, 5);
  return id;
}
const tabs = { onCreated: event(), onUpdated: event(),
  async get(id) { const t = world.tabs.get(id); if (!t) throw new Error("no tab"); return { ...t }; },
  async remove(id) { world.tabs.delete(id); world.closed.push(id); },
};
globalThis.chrome = { runtime: { id: "ours" }, downloads: dl, tabs, storage: { local: { async get() { return {}; }, async set() {} } } };
const src = process.env.FETCHER_SRC ? pathToFileURL(process.env.FETCHER_SRC).href : "../src/fetcher.js";
const { runQueue } = await import(src);

const run = (items, click, extra = {}) => {
  const steps = {};
  return runQueue({ items, tabId: 1, pageUrl: PORTAL, folder: "Portal-Download/Strom", click, alive: extra.alive || null, onStep: (n, s) => { if (typeof s === "object") steps[n] = s; }, stop: extra.stop || (() => false), pause: 0, wait: 400, grace: 100, poll: 10 }).then(() => steps);
};
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("a link is downloaded into the job's folder", async () => {
  const s = await run([{ n: 1, url: "https://portal.example/doc/a.pdf" }]);
  assert.equal(s[1].ok, true);
  assert.equal(world.placed[1], "Portal-Download/Strom/a.pdf");
});

test("a button takes the portal's download, not one of another extension or site meanwhile", async () => {
  const s = await run([{ n: 1, label: "Download" }], async () => {
    start({ url: "https://elsewhere.example/x.zip", referrer: "https://elsewhere.example/", byExtensionId: "other" });
    start({ url: "https://news.example/paper.pdf", referrer: "https://news.example/" });
    await sleep(15);
    start({ url: "https://cdn.example/r/7", referrer: PORTAL, mime: "application/pdf" });
  });
  assert.equal(s[1].ok, true);
  assert.match(s[1].file, /Portal-Download\/Strom\/7\.pdf$/);
  assert.equal(world.placed[1], null);
  assert.equal(world.placed[2], null);
});

test("a document whose name is decided late still goes into the job's folder", async () => {
  const s = await run([{ n: 1, label: "Download" }], async () => { start({ url: "https://portal.example/slow/5", referrer: PORTAL, mime: "application/pdf", late: 80 }); });
  assert.equal(s[1].ok, true);
  assert.equal(world.placed[1], "Portal-Download/Strom/5.pdf");
});

test("a download of the user during the wait is neither taken nor moved", async () => {
  const s = await run([{ n: 1, label: "Download" }], async () => { start({ url: "https://news.example/paper.pdf", referrer: "https://news.example/" }); });
  assert.equal(s[1].error, "nothing");
  assert.equal(world.placed[1], null);
});

test("a download without any origin after the click is taken when nothing else came", async () => {
  const s = await run([{ n: 1, label: "Download" }], async () => { start({ url: "https://files.example/x/1", referrer: "", mime: "application/pdf" }); });
  assert.equal(s[1].ok, true);
  assert.equal(world.placed[1], "Portal-Download/Strom/1.pdf");
});

test("a button on another page of the same address is another document", async () => {
  const { docKey } = await import(src);
  assert.notEqual(docKey({ label: "Download", page: "https://p.example/detail.aspx?id=1" }), docKey({ label: "Download", page: "https://p.example/detail.aspx?id=2" }));
  assert.notEqual(docKey({ label: "Download", page: "https://p.example/#/invoice/1" }), docKey({ label: "Download", page: "https://p.example/#/invoice/2" }));
  assert.equal(docKey({ label: "Download", page: "https://p.example/d?id=1&sid=a" }), docKey({ label: "Download", page: "https://p.example/d?sid=b&id=1" }));
});

test("a page that loads anew stops the rest", async () => {
  const s = await run([{ n: 1, label: "Weiter" }, { n: 2, url: "https://portal.example/b.pdf" }], async () => { tabs.onUpdated.fire(1, { status: "loading" }); }, { alive: async () => false });
  assert.equal(s[1].error, "navigated");
  assert.equal(s[2], undefined);
});

test("a change of the \"#…\" part only does not stop the rest", async () => {
  const s = await run([{ n: 1, label: "[download]" }, { n: 2, url: "https://portal.example/b.pdf" }], async () => { tabs.onUpdated.fire(1, { status: "loading" }); }, { alive: async () => true });
  assert.equal(s[1].error, "nothing");
  assert.equal(s[2].ok, true);
});

test("a frame gone affects only its own items", async () => {
  const s = await run([{ n: 1, label: "Download", frameId: 3 }, { n: 2, url: "https://portal.example/b.pdf" }], async () => {}, { alive: async (it) => !it.frameId });
  assert.equal(s[1].error, "gone");
  assert.equal(s[2].ok, true);
});

test("a single-page portal that changed its address but kept its elements goes on", async () => {
  world.tabs.get(1).url = "https://portal.example/invoices/page/2";
  const s = await run([{ n: 1, label: "Download" }], async () => { start({ url: "https://portal.example/d/1", referrer: PORTAL, mime: "application/pdf" }); }, { alive: async () => true });
  assert.equal(s[1].ok, true);
});

test("a tab without an address and one download without origin: that download", async () => {
  const s = await run([{ n: 1, label: "Open" }], async () => {
    world.tabs.set(2, { id: 2, url: "about:blank", openerTabId: 1 });
    tabs.onCreated.fire({ id: 2, openerTabId: 1 });
    await sleep(20);
    start({ url: "data:application/pdf;base64,JVBERi0=", referrer: "", mime: "application/pdf" });
  });
  assert.equal(s[1].ok, true);
  assert.deepEqual(world.closed, [2]);
});

test("an element gone from the page is said so", async () => {
  const s = await run([{ n: 1, label: "Download" }], async () => ({ gone: true }));
  assert.equal(s[1].error, "gone");
});

test("a web page instead of a document is a failure and deleted", async () => {
  const s = await run([{ n: 1, url: "https://portal.example/login.html" }]);
  assert.equal(s[1].error, "html");
  assert.deepEqual(world.removed, [1]);
});

test("a tab that turns into a download is that download, not a second one", async () => {
  const s = await run([{ n: 1, label: "Open" }], async () => {
    world.tabs.set(2, { id: 2, url: "about:blank", openerTabId: 1 });
    tabs.onCreated.fire({ id: 2, openerTabId: 1 });
    await sleep(30);
    world.tabs.get(2).url = "https://files.example/get/9";
    await sleep(30);
    start({ url: "https://files.example/get/9", referrer: "" , finalUrl: "https://files.example/get/9" });
  });
  assert.equal(s[1].ok, true);
  assert.deepEqual(world.requested, []);
  assert.deepEqual(world.closed, [2]);
});

test("a tab with a document and no download of its own: its address is downloaded, the tab closed", async () => {
  const s = await run([{ n: 1, label: "Open" }], async () => {
    world.tabs.set(2, { id: 2, url: "https://portal.example/view/3.pdf", openerTabId: 1 });
    tabs.onCreated.fire({ id: 2, openerTabId: 1 });
  });
  assert.equal(s[1].ok, true);
  assert.deepEqual(world.requested, ["https://portal.example/view/3.pdf"]);
  assert.deepEqual(world.closed, [2]);
});

test("stop ends the wait for a button", async () => {
  let stopped = false;
  setTimeout(() => { stopped = true; }, 50);
  const t0 = Date.now();
  const s = await run([{ n: 1, label: "Download" }, { n: 2, url: "https://portal.example/b.pdf" }], async () => {}, { stop: () => stopped });
  assert.equal(s[1].error, "stopped");
  assert.equal(s[2], undefined);
  assert.ok(Date.now() - t0 < 300);
});

test("a page that goes elsewhere stops the rest", async () => {
  const s = await run([{ n: 1, label: "Weiter" }, { n: 2, url: "https://portal.example/b.pdf" }], async () => {
    tabs.onUpdated.fire(1, { status: "loading" });
    world.tabs.get(1).url = "https://portal.example/other";
  });
  assert.equal(s[1].error, "navigated");
  assert.equal(s[1].stop, true);
  assert.equal(s[2], undefined);
});

test("every listener is removed afterwards", async () => {
  await run([{ n: 1, label: "Download" }], async () => {});
  assert.equal(dl.onCreated.size + dl.onDeterminingFilename.size + tabs.onCreated.size + tabs.onUpdated.size, 0);
});

let failed = 0;
for (const [name, fn] of tests) {
  reset();
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); }
  await sleep(60);
}
if (failed) { console.log(`${failed} of ${tests.length} failed`); process.exit(1); }
console.log(`all ${tests.length} passed`);
