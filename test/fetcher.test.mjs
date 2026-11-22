// The rules for downloading: folder names, what identifies a document across visits, and that
// the remembered downloads name no address. Runs in Node with storage stood in for.
import assert from "node:assert/strict";

const m = new Map();
globalThis.chrome = { storage: { local: {
  async get(k) { return m.has(k) ? { [k]: structuredClone(m.get(k)) } : {}; },
  async set(o) { for (const [k, v] of Object.entries(o)) m.set(k, structuredClone(v)); },
} } };
// FETCHER_SRC may point at another copy of fetcher.js (for red proofs).
const { pathToFileURL } = await import("node:url");
const src = process.env.FETCHER_SRC ? pathToFileURL(process.env.FETCHER_SRC).href : "../src/fetcher.js";
const { safeName, folderFor, docKey, remembered, withEnding } = await import(src);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("folder names hold no separators or reserved characters", () => {
  assert.equal(safeName('Strom: Stadtwerke / "Musterstadt"'), "Strom Stadtwerke Musterstadt");
  assert.equal(safeName("..\\..\\etc"), "etc");
  assert.equal(safeName("CON"), "Portal");
  assert.equal(safeName("   "), "Portal");
  assert.equal([...safeName("x".repeat(100))].length, 60);
  assert.equal(safeName("a\u0000b\tc"), "a b c");
});

test("a name without ending gets one from the file type", () => {
  assert.equal(withEnding("getDocument", "application/pdf"), "getDocument.pdf");
  assert.equal(withEnding("Rechnung.pdf", "application/pdf"), "Rechnung.pdf");
  assert.equal(withEnding("export", "text/csv; charset=utf-8"), "export.csv");
  assert.equal(withEnding("blob", "application/octet-stream"), "blob");
});

test("one folder per job, else per site", () => {
  assert.equal(folderFor({ title: "Energie/Strom" }, "https://x.example/"), "Portal-Download/Energie Strom");
  assert.equal(folderFor(null, "https://kunden.stadtwerke.example/rechnungen?x=1"), "Portal-Download/kunden.stadtwerke.example");
});

test("a document is known again although its session parameters changed", () => {
  const a = docKey({ url: "https://p.example/doc/get?id=7&sid=abc&ts=1" });
  const b = docKey({ url: "https://p.example/doc/get?ts=2&id=7&sid=xyz" });
  const c = docKey({ url: "https://p.example/doc/get?id=8&sid=abc" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(docKey({ url: "https://p.example/a.pdf#page=2" }), docKey({ url: "https://p.example/a.pdf" }));
});

test("buttons with the same words are told apart by their order", () => {
  assert.notEqual(docKey({ label: "Download", nth: 0 }), docKey({ label: "Download", nth: 1 }));
  assert.equal(docKey({ label: "PDF herunterladen", nth: 0 }), docKey({ label: "pdf herunterladen", nth: 0 }));
});

test("remembered downloads are kept per job, as digests only", async () => {
  const k = await remembered.keyOf({ url: "https://p.example/rechnung-januar.pdf" });
  await remembered.add("job:local:3", [k]);
  assert.ok((await remembered.get("job:local:3"))[k]);
  assert.deepEqual(await remembered.get("job:local:4"), {});
  const stored = JSON.stringify(m.get("downloaded"));
  assert.ok(!stored.includes("p.example") && !stored.includes("rechnung") && !stored.includes("job:"));
  await remembered.forget("job:local:3");
  assert.deepEqual(await remembered.get("job:local:3"), {});
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); }
}
if (failed) { console.log(`${failed} of ${tests.length} failed`); process.exit(1); }
console.log(`all ${tests.length} passed`);
