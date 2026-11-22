// Where the extension keeps what it needs: the list of services with their tokens, and the
// jobs of the local backend.
//
// Without a local backend the list of services lies in storage.local as it is. Once a local
// backend exists, everything lies encrypted in one object, as password managers do it: a random
// data key encrypts the content (AES-GCM), and the passphrase only wraps that data key (AES-GCM
// with a key from PBKDF2-SHA256, 600 000 iterations). The unlocked data key lives in
// storage.session only, which the browser forgets when it closes.
//
// A change of passphrase therefore wraps the same data key anew in a single write; the content
// and the unlocked key stay as they are, so no other window can see a key that does not fit.

import { emptyData } from "./local.js";

const api = globalThis.browser ?? globalThis.chrome;
const ITERATIONS = 600000;
const te = new TextEncoder(), td = new TextDecoder();
const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const failure = (kind) => Object.assign(new Error(kind), { kind });

async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const importDataKey = (raw) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
async function encrypt(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), data: b64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes))) };
}
const decrypt = async (key, box) => new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.data)));
const seal = (key, value) => encrypt(key, te.encode(JSON.stringify(value)));
const open = async (key, sealed) => JSON.parse(td.decode(await decrypt(key, sealed)));

/** The unlocked data key, if it belongs to this store (same kid); else null. */
async function sessionKey(vault) {
  const { vaultKey } = await api.storage.session.get("vaultKey");
  if (!vaultKey || typeof vaultKey !== "object" || vaultKey.kid !== vault.kid) return null;
  return importDataKey(unb64(vaultKey.key));
}
const remember = (kid, raw) => api.storage.session.set({ vaultKey: { kid, key: b64(raw) } });

/** Unwraps the data key with the passphrase key; null if the passphrase does not fit. */
async function unwrap(kek, vault) {
  try { return await decrypt(kek, vault.wrapped); } catch { return null; }
}

/** A new store record for this content, under the passphrase key kek of this salt. */
async function newRecord(kek, salt, iterations, content) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const kid = b64(crypto.getRandomValues(new Uint8Array(12)));
  const record = { v: 2, kid, rev: 1, salt, iterations, wrapped: await encrypt(kek, raw), sealed: await seal(await importDataKey(raw), content) };
  return { record, raw };
}

/** One change of the stored content at a time, across every panel of this browser. */
const VAULT_LOCK = "portal-download-vault";
export const withVaultLock = (fn) => (globalThis.navigator?.locks ? navigator.locks.request(VAULT_LOCK, fn) : fn());

export class Vault {
  // The revision each content object was read at; a write of an older one is refused.
  #revs = new WeakMap();

  /** "plain" (no local backend), "locked" or "open". */
  async state() {
    const { vault } = await api.storage.local.get("vault");
    if (!vault) return "plain";
    return vault.v === 2 && (await sessionKey(vault)) ? "open" : "locked";
  }

  /** Everything kept: { services: [...], local: data or null }. */
  async read() {
    const { vault, services } = await api.storage.local.get(["vault", "services"]);
    if (!vault) { const c = { services: services || [], local: null }; this.#revs.set(c, 0); return c; }
    // A store of an older version, or a key of another store (one deleted and made anew in
    // another window), counts as locked: the passphrase opens it.
    const key = vault.v === 2 ? await sessionKey(vault) : null;
    if (!key) throw failure("locked");
    const c = await open(key, vault.sealed);
    this.#revs.set(c, vault.rev);
    return c;
  }

  /** Writes content got from read(); refused if the store changed since that read. */
  async write(content) {
    const { vault } = await api.storage.local.get("vault");
    const rev = this.#revs.get(content);
    if (rev !== (vault ? vault.rev : 0)) throw failure("busy");
    if (!vault) { await api.storage.local.set({ services: content.services }); return; }
    const key = await sessionKey(vault);
    if (!key) throw failure("locked");
    await api.storage.local.set({ vault: { ...vault, rev: vault.rev + 1, sealed: await seal(key, content) } });
    this.#revs.set(content, vault.rev + 1);
  }

  async unlock(passphrase) {
    const { vault } = await api.storage.local.get("vault");
    if (!vault) return true;
    // The slow derivation outside the lock; what it opens is checked under the lock.
    const kek = await deriveKey(passphrase, unb64(vault.salt), vault.iterations || ITERATIONS);
    return withVaultLock(async () => {
      const { vault: now } = await api.storage.local.get("vault");
      if (!now || now.salt !== vault.salt) return false;
      if (now.v === 2) {
        const raw = await unwrap(kek, now);
        if (!raw) return false;
        await remember(now.kid, raw);
        return true;
      }
      // A store of version 0.8, sealed with the passphrase key itself: brought into the form
      // with a data key once, under the same passphrase.
      let content;
      try { content = await open(kek, now.sealed); } catch { return false; }
      const { record, raw } = await newRecord(kek, now.salt, now.iterations || ITERATIONS, content);
      await api.storage.local.set({ vault: record });
      await remember(record.kid, raw);
      return true;
    });
  }

  /** Locks; waits for a change under way, so that it cannot reopen the store afterwards. */
  async lock() { await withVaultLock(() => api.storage.session.remove("vaultKey")); }

  /** Reads, changes and writes the content under the lock; fn changes the content in place. */
  update(fn) {
    return withVaultLock(async () => { const c = await this.read(); const r = await fn(c); await this.write(c); return r; });
  }

  /** Creates the local backend: from now on everything lies under the passphrase. */
  async createLocal(passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await deriveKey(passphrase, salt);
    return withVaultLock(async () => {
      const { services, vault } = await api.storage.local.get(["services", "vault"]);
      // Another panel may have created it meanwhile; never write over a store.
      if (vault) throw failure("vault_exists");
      const { record, raw } = await newRecord(kek, b64(salt), ITERATIONS, { services: services || [], local: emptyData() });
      await api.storage.local.set({ vault: record });
      await api.storage.local.remove("services");
      await remember(record.kid, raw);
    });
  }

  /** Wraps the data key under a new passphrase: one write; content and unlocked key stay. */
  async changePassphrase(passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await deriveKey(passphrase, salt);
    return withVaultLock(async () => {
      const { vault } = await api.storage.local.get("vault");
      if (!vault || vault.v !== 2) throw failure("locked");
      const { vaultKey } = await api.storage.session.get("vaultKey");
      if (!(await sessionKey(vault))) throw failure("locked");
      const wrapped = await encrypt(kek, unb64(vaultKey.key));
      await api.storage.local.set({ vault: { ...vault, rev: vault.rev + 1, salt: b64(salt), iterations: ITERATIONS, wrapped } });
    });
  }

  /** For a forgotten passphrase: deletes the local store and every service kept with it. */
  async forget() {
    // Store, services and key in one step, so that nothing can come between.
    await withVaultLock(async () => { await api.storage.local.remove(["vault", "services"]); await api.storage.session.remove("vaultKey"); });
  }

  /** Removes the local backend and its jobs; the services stay, without the passphrase. */
  async removeLocal() {
    return withVaultLock(async () => {
      const content = await this.read();
      await api.storage.local.set({ services: content.services });
      await api.storage.local.remove("vault");
      await api.storage.session.remove("vaultKey");
    });
  }
}
