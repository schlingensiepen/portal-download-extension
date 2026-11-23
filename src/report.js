// The text of a feedback on a portal, from what the observer noted (observer.js): per click the
// kind of element, its words, a few yes/no marks and what the search made of it; then whether a
// page loaded, the page's script changed its address or a tab opened, and the download as kind
// and size. No address, id, class or script is in it. In the words, digits become "#" and e-mail addresses "[e-mail]"; a name cannot be
// recognised, so the user reads the text, may change it, and decides whether to copy it.
//
// The words stand in code spans, so that they cannot become a link, an image or a mention in the
// issue. The text is in English, like the issue form it is meant for.

const cut = (s, max) => { const c = [...s]; return c.length > max ? `${c.slice(0, max).join("")}…` : s; };

/** Words a person reads: no e-mail addresses, no digits, no invisible format characters, short. */
export function redactText(s, max = 80) {
  // Cut first: the rules below must not take long on a page's endless label.
  let r = [...String(s ?? "")].slice(0, 400).join("").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim();
  r = r.replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, "[e-mail]");
  // An address written as the words of a link goes whole: it may hold a key or a name.
  // Also without a scheme: a host with a path, "//host/…", a path of two parts or more, a Windows
  // or network path (to the end, it may hold spaces), and anything with "?…=". Each \S run is
  // matched once.
  r = r.replace(/(?<![\p{L}\p{N}])(?:[a-z]:[\\/]|\\\\).*$/giu, "[address]");
  r = r.replace(/\S+/gu, (w) => (/^[a-z][a-z0-9+.-]*:\/\/|^www\.|^\/\/|^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}\/|^\/[^/\s]+\/[^/\s]|\?[^=]*=/iu.test(w) ? "[address]" : w));
  // A long run of letters and digits mixed (a key or code in a link's text) goes whole.
  r = r.replace(/\S{20,}/gu, (w) => (/\p{L}/u.test(w) && /\p{N}/u.test(w) ? "[long]" : w));
  r = r.replace(/\p{N}+/gu, "#");
  // A code span in the report must not end early.
  r = r.replace(/`/g, "'");
  return cut(r, max);
}

const code = (s) => `\`${s}\``;
const WHY = { attr: "download attribute", name: "file name in its address", type: "file type attribute", address: "its address looks like a download", words: "its words" };
const KINDS = { file: "file", link: "link", button: "button" };

/** What the search made of a clicked element, in words. */
export function verdictText(v, tag = "") {
  if (!v) return "unknown";
  if (v.finder === "none" && /^(input|textarea|select|option)$/.test(String(tag))) return "not found: a form field";
  if (v.finder === "found") return `found as a ${KINDS[v.kind] || "candidate"} (${WHY[v.reason] || "other reason"}), ${v.sure === false ? "offered unticked" : "ticked"}`;
  if (v.finder === "hidden") return v.why === "path" ? "left out: a word in its address path names an action" : "left out: its words name a destroying action";
  return v.clickable ? "not found: no file, download or document word in it" : "not found: no link or button in the markup (a script listens to it)";
}

const SAFE = /^[a-z][a-z0-9-]{0,19}$/;
/** The kind of element, in words, from its tag, role and type (only plain names pass). */
function kindText(c) {
  // Plain names only, without digits, in code marks (GitHub would take a bare <details> as HTML).
  const tag = SAFE.test(String(c.tag)) ? String(c.tag).replace(/\d+/g, "#") : "element";
  const role = SAFE.test(String(c.role)) ? String(c.role).replace(/\d+/g, "#") : "";
  if (tag === "a") return c.link === "address" ? "a link with an address" : c.link === "script" ? "a link that runs a script" : "a link without an address";
  if (tag === "button" || (tag === "input" && /^(button|submit|reset|image)$/.test(String(c.type)))) return c.submits ? "a submit button" : "a button";
  return `an element ${code(`<${tag}>`)}${role ? ` with role ${code(role)}` : ""}`;
}

/** One clicked element, as lines of the report. */
function clickLines(n, c) {
  const words = redactText(c.words);
  const marks = [
    c.download && "download attribute", c.newTab && "opens a new tab", c.onclick && "script in its markup",
    c.icon && "has an icon", c.pointer && c.verdict && c.verdict.finder === "none" && !c.verdict.clickable && "pointer cursor",
    c.frame && "in a frame", c.shadow && "in shadow DOM",
  ].filter(Boolean);
  return [
    `${n}. ${kindText(c)}${words ? ` ${code(`"${words}"`)}` : " without words"}${marks.length ? ` · ${marks.join(" · ")}` : ""}`,
    `   search: ${verdictText(c.verdict, c.tag)}`,
  ];
}

const KIND = { "application/pdf": "a PDF", "application/zip": "a ZIP file", "text/csv": "a CSV file", "application/xml": "an XML file", "text/xml": "an XML file", "image/tiff": "a TIFF image", "image/jpeg": "a JPEG image", "image/png": "a PNG image", "text/html": "a web page" };
/** The kind of file, from its type, else from a short ending of letters. */
function kindOf(d) {
  const mime = String(d.mime || "").split(";")[0].trim().toLowerCase();
  if (KIND[mime]) return KIND[mime];
  if (/officedocument\.wordprocessingml|msword/.test(mime)) return "a Word document";
  if (/officedocument\.spreadsheetml|ms-excel/.test(mime)) return "an Excel file";
  // Else only a known ending: another one may be part of a name ("J.Smith").
  const m = /\.([A-Za-z]{1,5})$/.exec(String(d.filename || "").split(/[\\/]/).pop());
  const known = ["pdf", "zip", "csv", "xml", "xls", "xlsx", "doc", "docx", "odt", "ods", "rtf", "txt", "tif", "tiff", "jpg", "jpeg", "png", "eml", "msg", "p7m"];
  return m && known.includes(m[1].toLowerCase()) ? `a ${m[1].toUpperCase()} file` : "a file";
}
/** The size, rounded, from the browser (not from the page). */
function sizeOf(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return " (size unknown)";
  return b < 1024 ? ` of ${Math.round(b)} bytes` : b < 1024 * 1024 ? ` of ${Math.round(b / 1024)} KB` : ` of ${(b / 1024 / 1024).toFixed(1)} MB`;
}

const ENDED = { download: "a download started", timeout: "no download within two minutes", stopped: "stopped by the user", gone: "the tab was closed" };

/**
 * The whole text. w: { url, clicks, events, download, ended }; events are pages loaded and tabs
 * opened ({ at, kind: "page" | "address" | "tab" }; "address": the same document, its address changed by script); only the last five clicks and what followed them are told.
 */
export function buildReport(w, { version = "", browser = "", namePortal = true } = {}) {
  const host = (() => { try { return new URL(w.url).host; } catch { return ""; } })();
  const clicks = (w.clicks || []).slice(-5);
  const out = [
    // Version and browser name nobody; they stay as they are.
    `**Observed with Portal-Download ${String(version).replace(/[^\w.]/g, "")}${browser ? `, ${String(browser).replace(/[^\w .]/g, "").slice(0, 40)}` : ""}**`,
    "",
    `- Portal: ${namePortal && host ? code(host.replace(/[`\p{Cf}]/gu, "")) : "(not named)"}`,
    `- Ended: ${ENDED[w.ended] || "?"}`,
    "",
  ];
  if (!clicks.length) out.push("No click was noted in the page.");
  else {
    out.push(clicks.length < (w.clicks || []).length ? "**Clicks** (the last five, oldest first)" : "**Clicks** (oldest first)", "");
    const events = w.events || [];
    clicks.forEach((c, k) => {
      out.push(...clickLines(k + 1, c));
      // What happened after it and before the next.
      const next = clicks[k + 1] ? clicks[k + 1].at : Infinity;
      for (const e of events.filter((x) => x.at >= c.at && x.at < next)) out.push(e.kind === "tab" ? "   then a new tab opened" : e.kind === "address" ? "   then the page's script changed the address, without loading a new page" : "   then a new page loaded");
    });
  }
  // Of the download only what kind of file and how large: its name and address are not needed.
  if (w.download) out.push("", `**Download:** ${kindOf(w.download)}${sizeOf(w.download.bytes)} was downloaded.`);
  return out.join("\n");
}
