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
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
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
    return open(key, vault.sealed);
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
    const key = await deriveKey(passphrase, unb64(vault.salt));
    try { await open(key, vault.sealed); } catch { return false; }
    await remember(key);
    return true;
  }

  async lock() { await api.storage.session.remove("vaultKey"); }

  /** Creates the local backend: from now on everything lies under the passphrase. */
  async createLocal(passphrase) {
    const { services } = await api.storage.local.get("services");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    const content = { services: services || [], local: emptyData() };
    await api.storage.local.set({ vault: { salt: b64(salt), sealed: await seal(key, content) } });
    await api.storage.local.remove("services");
    await remember(key);
  }

  async changePassphrase(passphrase) {
    const content = await this.read();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt);
    await api.storage.local.set({ vault: { salt: b64(salt), sealed: await seal(key, content) } });
    await remember(key);
  }

  /** Removes the local backend and its jobs; the services stay, without the passphrase. */
  async removeLocal() {
    const content = await this.read();
    await api.storage.local.set({ services: content.services });
    await api.storage.local.remove("vault");
    await this.lock();
  }
}
