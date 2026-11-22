// The text of a feedback on a portal, from what the observer noted (observer.js). What may name a
// person or open an account goes out before the user sees it: digits, e-mail addresses, the
// values of address parameters, "#…" parts and ";…" parameters, long keys and tokens, quoted
// strings in scripts. Plain words stay, also in an address path ("/customer/max-muster/"): the
// user reads the text, may change it, and decides whether to copy it; nothing is sent from here.
//
// Everything a page wrote stands in code spans, so that it cannot become a link, an image or a
// mention in the issue. The text is in English, like the issue form it is meant for.

const cut = (s, max) => { const c = [...s]; return c.length > max ? `${c.slice(0, max).join("")}…` : s; };

/** Words a person reads: no e-mail addresses, no digits, short. */
export function redactText(s, max = 80) {
  let r = String(s ?? "").replace(/\s+/g, " ").trim();
  r = r.replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, "[e-mail]");
  r = r.replace(/\p{N}+/gu, "#");
  // A code span in the report must not end early.
  r = r.replace(/`/g, "'");
  return cut(r, max);
}

/** Script in an attribute: function names stay, what is quoted (also in backticks) goes. */
export function redactCode(s, max = 120) {
  const r = String(s ?? "").replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, "$1…$1");
  return redactText(r, max);
}

// A key or token: 16 characters or more that are not plain words. A plain word is all digits, or
// all letters with few changes from small to capital (camelCase has some, random keys many).
const plain = (p) => /^\p{N}+$/u.test(p) || (/^\p{L}+$/u.test(p) && [...p].length <= 30 && (p.match(/\p{Ll}\p{Lu}/gu) || []).length <= Math.floor([...p].length / 6));
export const opaque = (s) => [...String(s)].length >= 16 && !String(s).split(/[-_.~+=%\s]+/).filter(Boolean).every(plain);
/** A name such as an id or class list: each key or token in it left out, the rest as words. */
export function redactName(s, max = 60) {
  return redactText(String(s ?? "").split(/\s+/).filter(Boolean).map((w) => (opaque(w) ? "…" : w)).join(" "), max);
}
// One segment of a path: ";…" parameters cut off, an e-mail address or token left out (its file ending kept).
const segment = (raw) => {
  const [d, ...matrix] = raw.split(";");
  const tail = matrix.length ? ";…" : "";
  if (d.includes("@")) return `…${tail}`;
  const m = /^(.*?)(\.[A-Za-z0-9]{1,8})$/.exec(d);
  const [stem, ending] = m ? [m[1], m[2]] : [d, ""];
  return `${opaque(stem) ? `…${ending}` : redactText(d, 40)}${tail}`;
};

/**
 * An address in its form only: the portal's own as its path, another site by its name (or not at
 * all, when the portal is not named), parameter names without values, no "#…" part.
 */
export function redactUrl(u, portalOrigin, namePortal = true) {
  u = String(u ?? "");
  if (!u) return "";
  if (/^javascript:/i.test(u)) return redactCode(u);
  if (u.startsWith("#")) return "#…";
  let x;
  try { x = new URL(u); } catch { return redactCode(u, 60); }
  if (x.protocol === "data:") return `data:${redactText(x.pathname.split(/[;,]/)[0], 40)}`;
  if (x.protocol === "blob:") return "blob: (made in the page)";
  const site = x.origin === portalOrigin ? "" : namePortal ? `${x.protocol}//${redactText(x.host, 60)}` : "[another site]";
  const path = x.pathname.split("/").map((seg) => {
    let d = seg;
    try { d = decodeURIComponent(seg); } catch { /* as it is */ }
    return segment(d);
  }).join("/");
  const names = [...new Set(x.searchParams.keys())].slice(0, 12).map((k) => `${opaque(k) ? "…" : redactText(k, 30)}=…`);
  return `${site}${path}${names.length ? `?${names.join("&")}` : ""}${x.hash ? "#…" : ""}`;
}

const code = (s) => (s ? `\`${s}\`` : "");
const WHY = { attr: "download attribute", name: "file name in its address", type: "file type attribute", address: "its address looks like a download", words: "its words" };

/** What the search made of a clicked element, in words. */
export function verdictText(v, tag = "") {
  if (!v) return "unknown";
  if (v.finder === "none" && /^(input|textarea|select)$/.test(String(tag))) return "not found: a form field";
  if (v.finder === "found") return `found as a ${v.kind} (${WHY[v.reason] || v.reason}), ${v.sure === false ? "offered unticked" : "ticked"}`;
  if (v.finder === "hidden") return v.why === "path" ? "left out: a word in its address path names an action" : "left out: its words name a destroying action";
  return v.clickable ? "not found: no file, download or document word in it" : "not found: no link or button in the markup (a script listens to it)";
}

/** One clicked element, as lines of the report. */
function clickLines(n, c, origin, namePortal) {
  const S = (v) => (v === null || v === undefined ? "" : String(v));
  const head = [`${n}. ${code(`<${redactText(c.tag, 20)}${c.type ? ` type="${redactText(c.type, 20)}"` : ""}${c.role ? ` role="${redactText(c.role, 20)}"` : ""}${c.cls ? ` class="${redactName(c.cls)}"` : ""}>`)}`];
  if (S(c.text)) head.push(code(`"${redactText(c.text)}"`));
  if (S(c.title)) head.push(`title ${code(`"${redactText(c.title)}"`)}`);
  if (S(c.aria)) head.push(`label ${code(`"${redactText(c.aria)}"`)}`);
  if (S(c.alt)) head.push(`alt ${code(`"${redactText(c.alt)}"`)}`);
  const lines = [head.join(" · ")];
  const more = [];
  if (S(c.id)) more.push(`id ${code(redactName(c.id, 40))}`);
  if (c.href) more.push(`href ${code(redactUrl(c.href, origin, namePortal))}`);
  if (c.download !== null && c.download !== undefined) more.push(`download ${code(redactText(c.download, 40))}`);
  if (c.target) more.push(`target ${code(redactText(c.target, 20))}`);
  if (c.onclick) more.push(`onclick ${code(redactCode(c.onclick))}`);
  if (c.form) more.push(`sends a form: ${code(redactText(c.form.method, 8))} ${code(redactUrl(c.form.action, origin, namePortal))}`);
  if (c.pointer && c.verdict && c.verdict.finder === "none" && !c.verdict.clickable) more.push("pointer cursor");
  if (c.frame) more.push(`in a frame ${code(redactUrl(c.frame, origin, namePortal))}`);
  if (c.shadow) more.push("in shadow DOM");
  if (more.length) lines.push(`   ${more.join(" · ")}`);
  if (Array.isArray(c.chain) && c.chain.length) lines.push(`   inside ${code(c.chain.map((p) => `${redactText(p && p.tag, 12)}${p && p.cls ? `.${redactName(p.cls, 40).split(" ").join(".")}` : ""}`).join(" > "))}`);
  if (Array.isArray(c.icons) && c.icons.length) {
    lines.push(`   icons ${c.icons.map((i) => code([i.cls && redactName(i.cls), i.title && `title "${redactText(i.title, 40)}"`, i.aria && `label "${redactText(i.aria, 40)}"`, i.alt && `alt "${redactText(i.alt, 40)}"`, i.url && redactUrl(i.url, origin, namePortal)].filter(Boolean).join(" "))).join(", ")}`);
  }
  lines.push(`   search: ${verdictText(c.verdict, c.tag)}`);
  return lines;
}

const ENDED = { download: "a download started", timeout: "no download within two minutes", stopped: "stopped by the user", gone: "the tab was closed" };

/**
 * The whole text. w: { url, clicks, events, download, ended }; events are pages loaded and tabs
 * opened ({ at, kind: "page" | "tab", url }); only the last five clicks and what followed the
 * first of them are told.
 */
export function buildReport(w, { version = "", browser = "", namePortal = true } = {}) {
  const origin = (() => { try { return new URL(w.url).origin; } catch { return ""; } })();
  const host = (() => { try { return new URL(w.url).host; } catch { return ""; } })();
  const clicks = (w.clicks || []).slice(-5);
  const since = clicks.length ? clicks[0].at : 0;
  const out = [
    // Version and browser name nobody; they stay as they are.
    `**Observed with Portal-Download ${String(version).replace(/[^\w.]/g, "")}${browser ? `, ${String(browser).replace(/[^\w .]/g, "").slice(0, 40)}` : ""}**`,
    "",
    `- Portal: ${namePortal && host ? host : "(not named)"}`,
    `- Page: ${code(redactUrl(w.url, origin, namePortal))}`,
    `- Ended: ${ENDED[w.ended] || w.ended || "?"}`,
    "",
  ];
  if (!clicks.length) out.push("No click was noted in the page.");
  else {
    out.push(clicks.length < (w.clicks || []).length ? "**Clicks** (the last five, oldest first)" : "**Clicks** (oldest first)", "");
    // Each click, then what happened after it and before the next.
    const events = (w.events || []).filter((e) => e.at >= since);
    clicks.forEach((c, k) => {
      out.push(...clickLines(k + 1, c, origin, namePortal));
      const next = clicks[k + 1] ? clicks[k + 1].at : Infinity;
      for (const e of events.filter((x) => x.at >= c.at && x.at < next && !/^about:/i.test(x.url || "") && (x.url || x.kind === "tab"))) {
        out.push(e.kind === "tab" ? `   then a new tab opened: ${code(redactUrl(e.url, origin, namePortal) || "(no address yet)")}` : `   then the page loaded: ${code(redactUrl(e.url, origin, namePortal))}`);
      }
    });
  }
  const d = w.download;
  if (d) {
    out.push("", "**Download**", "");
    const ending = (() => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(d.filename || "").split(/[\\/]/).pop() || ""); return m ? `.${m[1].toLowerCase()}` : "none"; })();
    out.push(`- type ${code(redactText(d.mime || "unknown", 60))}, file ending ${code(ending)}`);
    out.push(`- address ${code(redactUrl(d.finalUrl || d.url, origin, namePortal))}${d.referrer ? `, started from ${code(redactUrl(d.referrer, origin, namePortal))}` : ", no referrer"}`);
  }
  return out.join("\n");
}
