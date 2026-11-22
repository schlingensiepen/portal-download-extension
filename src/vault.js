// Where the extension keeps what it needs: the list of services with their tokens, and the
// jobs of the local backend.
//
// Without a local backend the list of services lies in storage.local as it is. Once a local
// backend exists, everything lies encrypted under the passphrase (AES-GCM with a key from
// PBKDF2-SHA256, 600 000 iterations); the unlocked key lives in storage.session only, which
// the browser forgets when it closes.

import { emptyData } from "./local.js";

const api = globalThis.browser ?? globalThis.chrome;
const ITERATIONS = 600000;
const te = new TextEncoder(), td = new TextDecoder();
const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
async function seal(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(value))));
  return { iv: b64(iv), data: b64(data) };
}
async function open(key, sealed) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, key, unb64(sealed.data));
  return JSON.parse(td.decode(plain));
}
async function sessionKey() {
  const { vaultKey } = await api.storage.session.get("vaultKey");
  if (!vaultKey) return null;
  return crypto.subtle.importKey("raw", unb64(vaultKey), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}
async function remember(key) {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  await api.storage.session.set({ vaultKey: b64(raw) });
}

/** One change of the stored content at a time, across every panel of this browser. */
const VAULT_LOCK = "portal-download-vault";
export const withVaultLock = (fn) => (globalThis.navigator?.locks ? navigator.locks.request(VAULT_LOCK, fn) : fn());

export class Vault {
  /** "plain" (no local backend), "locked" or "open". */
  async state() {
    const { vault } = await api.storage.local.get("vault");
    if (!vault) return "plain";
    return (await sessionKey()) ? "open" : "locked";
  }

  /** Everything kept: { services: [...], local: data or null }. */
  async read() {
    const { vault, services } = await api.storage.local.get(["vault", "services"]);
    if (!vault) return { services: services || [], local: null };
    const key = await sessionKey();
    if (!key) throw Object.assign(new Error("locked"), { kind: "locked" });
    // A key that does not open the store (a change of passphrase cut short) counts as locked:
    // the passphrase then opens it again.
    try { return await open(key, vault.sealed); }
    catch {
      // Either a change is under way (a passphrase change between its two writes), or the key no
      // longer fits (such a change was cut short). Only under the lock, where no change runs, is
      // that decided: read both anew; if they still do not fit, the store counts as locked.
      const busy = () => Object.assign(new Error("busy"), { kind: "busy" });
      if (!globalThis.navigator?.locks) throw busy();
      return navigator.locks.request(VAULT_LOCK, { ifAvailable: true }, async (held) => {
        if (!held) throw busy();
        const { vault: now } = await api.storage.local.get("vault");
        const k = await sessionKey();
        if (!now || !k) throw Object.assign(new Error("locked"), { kind: "locked" });
        try { return await open(k, now.sealed); } catch { /* still does not fit */ }
        await api.storage.session.remove("vaultKey");
        throw Object.assign(new Error("locked"), { kind: "locked" });
      });
    }
  }

  async write(content) {
    const { vault } = await api.storage.local.get("vault");
    if (!vault) { await api.storage.local.set({ services: content.services }); return; }
    const key = await sessionKey();
    if (!key) throw Object.assign(new Error("locked"), { kind: "locked" });
    await api.storage.local.set({ vault: { ...vault, sealed: await seal(key, content) } });
  }

  async unlock(passphrase) {
    const { vault } = await api.storage.local.get("vault");
    if (!vault) return true;
    const key = await deriveKey(passphrase, unb64(vault.salt), vault.iterations || ITERATIONS);
    // Kept only if it still opens the store under the lock: a passphrase change may have come between.
    return withVaultLock(async () => {
      const { vault: now } = await api.storage.local.get("vault");
      if (!now || now.salt !== vault.salt) return false;
      try { await open(key, now.sealed); } catch { return false; }
      await remember(key);
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
  async createLocal(passphrase) { return withVaultLock(() => this.#createLocal(passphrase)); }
  async #createLocal(passphrase) {
    const { services, vault } = await api.storage.local.get(["services", "vault"]);
    // Another panel may have created it meanwhile; never write over a store.
    if (vault) throw Object.assign(new Error("exists"), { kind: "vault_exists" });
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const content = { services: services || [], local: emptyData() };
    await api.storage.local.set({ vault: { salt: b64(salt), iterations: ITERATIONS, sealed: await seal(key, content) } });
    await api.storage.local.remove("services");
    await remember(key);
  }

  async changePassphrase(passphrase) { return withVaultLock(() => this.#changePassphrase(passphrase)); }
  async #changePassphrase(passphrase) {
    const content = await this.read();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const sealed = await seal(key, content);
    // The key first: another panel reading between the two writes then fails once instead of with the old key.
    const { vaultKey: oldKey } = await api.storage.session.get("vaultKey");
    if (!oldKey) throw Object.assign(new Error("locked"), { kind: "locked" });
    await remember(key);
    try { await api.storage.local.set({ vault: { salt: b64(salt), iterations: ITERATIONS, sealed } }); }
    catch (e) { await api.storage.session.set({ vaultKey: oldKey }); throw e; }
  }

  /** For a forgotten passphrase: deletes the local store and every service kept with it. */
  async forget() {
    // Store, services and key in one step, so that nothing can come between.
    await withVaultLock(async () => { await api.storage.local.remove(["vault", "services"]); await api.storage.session.remove("vaultKey"); });
  }

  /** Removes the local backend and its jobs; the services stay, without the passphrase. */
  async removeLocal() { return withVaultLock(() => this.#removeLocal()); }
  async #removeLocal() {
    const content = await this.read();
    await api.storage.local.set({ services: content.services });
    await api.storage.local.remove("vault");
    // Already under the lock: remove the key directly.
    await api.storage.session.remove("vaultKey");
  }
}
