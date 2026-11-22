// The backends the extension works with: services over their API, and the local store.
// Every backend answers call(method, params, headers) with the result, or throws an error
// with code, kind and message, as the service's API does.

import { LocalBackend, OpError, CONTRACT } from "./local.js";
import { withVaultLock } from "./vault.js";

export { CONTRACT };

/** A service, reached at its base address with the extension's own device token. */
export class ServiceBackend {
  constructor(service) { this.service = service; this.id = service.id; this.name = service.name; }
  async call(method, params = {}, headers = {}) {
    let res;
    try {
      res = await fetch(new URL("api/", this.service.base), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.service.token ? { Authorization: `Bearer ${this.service.token}` } : {}), ...headers },
        // A redirect would carry the token elsewhere.
        redirect: "error",
        // A bearer token only, never a cookie of the service.
        credentials: "omit",
        // An unreachable service must not hold up the list of the others.
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    } catch {
      throw new OpError(0, "unreachable", "");
    }
    let body;
    try { body = await res.json(); } catch { throw new OpError(res.status, "unreadable", ""); }
    if (body.error) throw new OpError(body.error.code, (body.error.data && body.error.data.type) || "error", body.error.message);
    return body.result;
  }
}

/** The local store; reads and writes the encrypted content of the vault. */
export function localBackend(vault) {
  const b = new LocalBackend({
    load: async () => (await vault.read()).local,
    save: async (data) => { const c = await vault.read(); c.local = data; await vault.write(c); },
    byName: "Extension",
  });
  b.id = "local";
  // One change of the store at a time, across every panel of this browser: each call reads,
  // changes and writes the whole store.
  const call = b.call.bind(b);
  b.call = (...args) => withVaultLock(() => call(...args));
  return b;
}

/** Splits an invitation link into the service's base address and the token. */
export function parseInvitation(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) return null;
  const m = /(?:^#|&)invite=([^&]+)/.exec(u.hash);
  if (!m) return null;
  let token;
  try { token = decodeURIComponent(m[1]); } catch { return null; }
  if (!/^pdi_[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const base = `${u.origin}${u.pathname.replace(/[^/]*$/, "")}`;
  return { base, origin: u.origin, token };
}
