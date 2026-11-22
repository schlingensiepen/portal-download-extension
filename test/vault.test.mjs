// The store under the passphrase: create, lock, unlock, change of passphrase, stale writes,
// another store's key, and the move of a store of version 0.8. Runs in Node with storage and
// Web Locks stood in for. VAULT_SRC may point at another copy of vault.js (for red proofs).
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

function area() {
  const m = new Map();
  const pick = (keys) => (typeof keys === "string" ? [keys] : keys);
  return {
    m,
    async get(keys) { const o = {}; for (const k of pick(keys)) if (m.has(k)) o[k] = structuredClone(m.get(k)); return o; },
    async set(o) { for (const [k, v] of Object.entries(o)) m.set(k, structuredClone(v)); },
    async remove(keys) { for (const k of pick(keys)) m.delete(k); },
  };
}
const local = area(), session = area();
globalThis.chrome = { storage: { local, session } };
// One lock for every name, enough here; ifAvailable gets null while it is held.
let tail = Promise.resolve(), held = false, waiting = 0;
Object.defineProperty(globalThis.navigator, "locks", { value: { request(_name, opts, fn) {
  if (typeof opts === "function") { fn = opts; opts = {}; }
  if (opts.ifAvailable && held) return Promise.resolve(fn(null));
  if (opts.ifAvailable) { held = true; return Promise.resolve().then(() => fn({})).finally(() => { held = false; }); }
  waiting++;
  const run = tail.then(async () => { waiting--; held = true; try { return await fn({}); } finally { held = false; } });
  tail = run.catch(() => {}); return run;
} } });

const here = dirname(fileURLToPath(import.meta.url));
const src = process.env.VAULT_SRC ? resolve(process.env.VAULT_SRC) : join(here, "..", "src", "vault.js");
const { Vault } = await import(pathToFileURL(src).href);

const reset = () => { local.m.clear(); session.m.clear(); };
const kind = async (p) => { try { await p; return "ok"; } catch (e) { return e.kind || e.name; } };
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("plain services, then a local store under the passphrase", async () => {
  const v = new Vault();
  assert.equal(await v.state(), "plain");
  await v.update((c) => { c.services.push({ id: "s1", token: "t" }); });
  await v.createLocal("correct horse battery");
  assert.equal(await v.state(), "open");
  assert.equal(local.m.has("services"), false);
  const rec = local.m.get("vault");
  assert.equal(rec.v, 2);
  assert.ok(!JSON.stringify(rec).includes("\"t\""));
  assert.deepEqual((await v.read()).services, [{ id: "s1", token: "t" }]);
});

test("lock and unlock", async () => {
  const v = new Vault();
  await v.createLocal("correct horse battery");
  await v.update((c) => { c.services.push({ id: "s1" }); });
  await v.lock();
  assert.equal(await v.state(), "locked");
  assert.equal(await kind(v.read()), "locked");
  assert.equal(await v.unlock("wrong passphrase"), false);
  assert.equal(await v.unlock("correct horse battery"), true);
  assert.equal((await v.read()).services[0].id, "s1");
});

test("a change of passphrase keeps the unlocked key: another window reads on throughout", async () => {
  const a = new Vault(), b = new Vault();
  await a.createLocal("correct horse battery");
  const keyBefore = JSON.stringify(session.m.get("vaultKey"));
  const sealedBefore = JSON.stringify(local.m.get("vault").sealed);
  let stop = false, failures = 0, reads = 0;
  const reader = (async () => { while (!stop) { try { await b.read(); reads++; } catch { failures++; } await new Promise((r) => setTimeout(r, 0)); } })();
  await a.changePassphrase("a new passphrase here");
  await a.changePassphrase("and yet another one");
  stop = true; await reader;
  assert.equal(failures, 0);
  assert.ok(reads > 0);
  assert.equal(JSON.stringify(session.m.get("vaultKey")), keyBefore);
  assert.equal(JSON.stringify(local.m.get("vault").sealed), sealedBefore);
  await a.lock();
  assert.equal(await a.unlock("correct horse battery"), false);
  assert.equal(await a.unlock("and yet another one"), true);
});

test("a write of content read before another change is refused", async () => {
  const a = new Vault(), b = new Vault();
  await a.createLocal("correct horse battery");
  const old = await a.read();
  await b.update((c) => { c.services.push({ id: "from-b" }); });
  old.services.push({ id: "from-a" });
  assert.equal(await kind(a.write(old)), "busy");
  assert.deepEqual((await a.read()).services.map((s) => s.id), ["from-b"]);
});

test("plain content is not written over a store made meanwhile", async () => {
  const a = new Vault(), b = new Vault();
  const old = await a.read();
  await b.createLocal("correct horse battery");
  old.services.push({ id: "x", token: "plain" });
  assert.equal(await kind(a.write(old)), "busy");
  assert.equal(local.m.has("services"), false);
});

test("the key of a store deleted and made anew does not count", async () => {
  const v = new Vault();
  await v.createLocal("correct horse battery");
  const oldKey = session.m.get("vaultKey");
  await v.forget();
  await v.createLocal("another passphrase!");
  await session.set({ vaultKey: oldKey });
  assert.equal(await v.state(), "locked");
  assert.equal(await kind(v.read()), "locked");
});

test("a store of version 0.8 is moved to a data key on the first unlock", async () => {
  // Made as 0.8 made it: the content sealed with the passphrase key itself.
  const te = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey("raw", te.encode("old passphrase 08"), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 1000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify({ services: [{ id: "s08" }], local: null }))));
  const b64 = (u) => Buffer.from(u).toString("base64");
  const old = { salt: b64(salt), iterations: 1000, sealed: { iv: b64(iv), data: b64(data) } };
  await local.set({ vault: old });
  // A key of 0.8 left in the session (a raw string) does not open it.
  await session.set({ vaultKey: b64(new Uint8Array(await crypto.subtle.exportKey("raw", key))) });
  const v = new Vault();
  assert.equal(await v.state(), "locked");
  assert.equal(await v.unlock("wrong passphrase"), false);
  assert.deepEqual(local.m.get("vault"), old);
  assert.equal(await v.unlock("old passphrase 08"), true);
  const rec = local.m.get("vault");
  assert.equal(rec.v, 2);
  assert.equal(rec.salt, old.salt);
  assert.deepEqual((await v.read()).services, [{ id: "s08" }]);
  await v.lock();
  assert.equal(await v.unlock("old passphrase 08"), true);
});

test("removing the local store gives the services back in plain", async () => {
  const v = new Vault();
  await v.createLocal("correct horse battery");
  await v.update((c) => { c.services.push({ id: "s1" }); });
  await v.removeLocal();
  assert.equal(await v.state(), "plain");
  assert.equal(session.m.has("vaultKey"), false);
  assert.deepEqual((await v.read()).services, [{ id: "s1" }]);
});

test("content read from a store deleted and made anew is not written into the new one", async () => {
  const a = new Vault(), b = new Vault();
  await a.createLocal("correct horse battery");
  const old = await a.read();
  await b.forget();
  await b.createLocal("another passphrase!");
  old.services.push({ id: "stale" });
  assert.equal(await kind(a.write(old)), "busy");
  assert.deepEqual((await b.read()).services, []);
});

test("a leftover services list is removed on unlock too", async () => {
  const v = new Vault();
  await v.createLocal("correct horse battery");
  await v.lock();
  await local.set({ services: [{ id: "s1", token: "secret" }] });
  assert.equal(await v.unlock("correct horse battery"), true);
  assert.equal(local.m.has("services"), false);
});

test("a creation cut short leaves no services in plain", async () => {
  const v = new Vault();
  await v.update((c) => { c.services.push({ id: "s1", token: "secret" }); });
  await v.createLocal("correct horse battery");
  await local.set({ services: [{ id: "s1", token: "secret" }] });
  assert.deepEqual((await v.read()).services, [{ id: "s1", token: "secret" }]);
  assert.equal(local.m.has("services"), false);
});

test("a second store is not created over the first; forget deletes all", async () => {
  const a = new Vault(), b = new Vault();
  await a.createLocal("correct horse battery");
  assert.equal(await kind(b.createLocal("another passphrase!")), "vault_exists");
  await a.forget();
  assert.equal(await a.state(), "plain");
  assert.equal(session.m.has("vaultKey"), false);
  assert.deepEqual((await a.read()).services, []);
});

test("unlock while another window changes the passphrase uses the new salt", async () => {
  const a = new Vault(), b = new Vault();
  await a.createLocal("correct horse battery");
  // The test holds the lock, so that the order is fixed: the change waits first, then the unlock
  // (which read the old salt before the change was written).
  let release; const held = navigator.locks.request("x", () => new Promise((r) => { release = r; }));
  // Counts only after the test holds the lock itself, so that the change is surely queued first.
  const queued = async (n) => { while (waiting < n) await new Promise((r) => setTimeout(r, 10)); };
  while (!release) await new Promise((r) => setTimeout(r, 0));
  const change = a.changePassphrase("a new passphrase here");
  await queued(1);
  const pending = b.unlock("a new passphrase here");
  await queued(2);
  release(); await held; await change;
  assert.equal(await pending, true);
});

test("a damaged store counts as locked, and unlock names it", async () => {
  const v = new Vault();
  await v.createLocal("correct horse battery");
  const rec = local.m.get("vault");
  rec.sealed.data = Buffer.from("broken content here").toString("base64");
  assert.equal(await kind(v.read()), "locked");
  await v.lock();
  assert.equal(await v.unlock("correct horse battery"), "damaged");
  assert.equal(await v.state(), "locked");
});

test("a read while the store is being removed leaves the services written for it", async () => {
  const a = new Vault(), b = new Vault();
  await a.createLocal("correct horse battery");
  await a.update((c) => { c.services.push({ id: "s1", token: "t" }); });
  // As removeLocal stands between its two writes, under the lock.
  let release; const removing = navigator.locks.request("x", () => new Promise((r) => { release = r; }));
  await new Promise((r) => setTimeout(r, 0));
  await local.set({ services: [{ id: "s1", token: "t" }] });
  await b.read();
  assert.equal(local.m.has("services"), true);
  release(); await removing;
});

let failed = 0;
for (const [name, fn] of tests) {
  reset();
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); }
}
if (failed) { console.log(`${failed} of ${tests.length} failed`); process.exit(1); }
console.log(`all ${tests.length} passed`);
