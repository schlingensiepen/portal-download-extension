// Finding documents in a portal page: links to files, and buttons that look as if they start a
// download. The functions below run inside the page (scripting.executeScript), one call per
// frame, so each is self-contained: no names from outside, only its arguments.
//
// scan() collects the candidates of one frame and keeps them in the frame's isolated world;
// mark() numbers and highlights them, unmark() takes the highlight off one or all, show()
// scrolls one into view.

/** Runs in the page: the candidates of this frame, as plain data. */
export function scan() {
  const FILE = /\.(pdf|docx?|xlsx?|odt|ods|rtf|csv|txt|xml|zip|tiff?|jpe?g|png|eml|msg|p7m|xps)(?:$|[?#;])/i;
  const MAYBE_URL = /download|attachment|getdoc|getfile|showdoc|viewdoc|filename=|format=(pdf|docx?|xlsx?)|mime=|\/files?\/|\/documents?\/[^/]*\d/i;
  const WORDS = /download|herunterladen|runterladen|\bpdf\b|\bdocx?\b|\bxlsx?\b|\bzip\b|speichern|\bsave\b|exportieren|\bexport\b|abrufen|télécharger|descargar|baixar|下载|下載/i;
  const CLICKABLE = "a, button, input[type=button], input[type=submit], input[type=image], [role=button], [role=link], [role=menuitem], [onclick]";

  // Every element, also inside open shadow roots.
  const all = [];
  const walk = (root) => { for (const el of root.querySelectorAll("*")) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
  walk(document);

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };
  const text = (el) => (el.innerText || el.value || "").replace(/\s+/g, " ").trim();
  // What the element says about itself, also through its icons: title, aria-label, class names.
  const hints = (el) => {
    const parts = [el.getAttribute("title"), el.getAttribute("aria-label"), el.getAttribute("alt"), el.getAttribute("download"), typeof el.className === "string" ? el.className : ""];
    for (const c of el.querySelectorAll("i, svg, img, span, use")) parts.push(c.getAttribute("class"), c.getAttribute("title"), c.getAttribute("aria-label"), c.getAttribute("alt"), c.getAttribute("href"), c.getAttribute("xlink:href"), c.getAttribute("src"));
    return parts.filter(Boolean).join(" ");
  };
  const fileName = (url) => { try { const p = new URL(url).pathname; return decodeURIComponent(p.slice(p.lastIndexOf("/") + 1)); } catch { return ""; } };

  const found = [];
  for (const el of all) {
    if (!el.matches(CLICKABLE) || !visible(el)) continue;
    // Only an address of its own counts as a link: "#…" and "javascript:" are buttons.
    const raw = el.tagName === "A" ? (el.getAttribute("href") || "").trim() : "";
    const href = raw && !raw.startsWith("#") && !/^javascript:/i.test(raw) ? el.href : "";
    const real = /^https?:|^blob:|^data:/i.test(href);
    const said = hints(el).match(WORDS);
    const label = (text(el) || el.getAttribute("aria-label") || el.getAttribute("title") || fileName(href) || (said ? `[${said[0]}]` : "")).slice(0, 100);
    let kind = null, reason = "";
    if (real && el.hasAttribute("download")) { kind = "file"; reason = "attr"; }
    else if (real && FILE.test(new URL(href, location.href).pathname)) { kind = "file"; reason = "name"; }
    else if (real && el.getAttribute("type") && /pdf|msword|officedocument|octet-stream|zip/i.test(el.getAttribute("type"))) { kind = "file"; reason = "type"; }
    else if (real && MAYBE_URL.test(href)) { kind = "link"; reason = "address"; }
    else if (WORDS.test(`${text(el)} ${hints(el)}`)) { kind = real ? "link" : "button"; reason = "words"; }
    if (!kind) continue;
    found.push({ el, kind, reason, label, url: real ? href : "" });
  }
  // Candidates inside one another count once, as the innermost: a clickable table row keeps
  // the PDF links in it, a download button the link it wraps.
  const kept = found.filter((f) => !found.some((g) => g !== f && f.el.contains(g.el)));
  // Kept in this frame's isolated world for mark(), unmark() and show().
  globalThis.__portalDownloadUnmark?.();
  globalThis.__portalDownloadFound = kept.map((f) => f.el);
  return { url: location.href, items: kept.map(({ kind, reason, label, url }, i) => ({ i, kind, reason, label, url })) };
}

/** Runs in the page: highlights the given candidates of this frame, [[index, number], ...]. */
export function mark(pairs) {
  const MARK = "data-portal-download-n";
  const els = globalThis.__portalDownloadFound || [];
  let style = document.getElementById("portal-download-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "portal-download-style";
    style.textContent = `#portal-download-badges{position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none}
#portal-download-badges span{position:absolute;transform:translate(-60%,-60%);min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#f2c200;color:#1d2b2a;font:bold 12px/18px system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.4)}`;
    document.documentElement.append(style);
  }
  let box = document.getElementById("portal-download-badges");
  if (!box) { box = document.createElement("div"); box.id = "portal-download-badges"; document.documentElement.append(box); }
  box.replaceChildren();
  // The highlight lies on the element itself, so that it shows inside shadow roots too; what
  // the element had in its style attribute comes back with unmark.
  const was = globalThis.__portalDownloadWas || (globalThis.__portalDownloadWas = new Map());
  const restore = () => { for (const [el, style] of was) { el.removeAttribute(MARK); if (style === null) el.removeAttribute("style"); else el.setAttribute("style", style); } was.clear(); };
  globalThis.__portalDownloadUnmark = () => { restore(); document.getElementById("portal-download-badges")?.remove(); document.getElementById("portal-download-style")?.remove(); };
  restore();
  const badges = [];
  for (const [i, n] of pairs) {
    const el = els[i];
    if (!el || !el.isConnected) continue;
    was.set(el, el.getAttribute("style"));
    el.setAttribute(MARK, String(n));
    el.style.setProperty("outline", "3px solid #f2c200", "important");
    el.style.setProperty("outline-offset", "2px", "important");
    el.style.setProperty("background-color", "rgba(255,226,0,.35)", "important");
    const b = document.createElement("span");
    b.textContent = String(n);
    box.append(b);
    badges.push([el, b]);
  }
  // The badges follow their elements when the page scrolls or changes its layout.
  const place = () => { for (const [el, b] of badges) { const r = el.getBoundingClientRect(); b.style.left = `${r.left + scrollX}px`; b.style.top = `${r.top + scrollY}px`; b.style.display = el.isConnected && r.width ? "" : "none"; } };
  place();
  if (globalThis.__portalDownloadPlace) { removeEventListener("scroll", globalThis.__portalDownloadPlace, true); removeEventListener("resize", globalThis.__portalDownloadPlace); }
  globalThis.__portalDownloadPlace = () => requestAnimationFrame(place);
  addEventListener("scroll", globalThis.__portalDownloadPlace, true);
  addEventListener("resize", globalThis.__portalDownloadPlace);
  return badges.length;
}

/** Runs in the page: takes every highlight of this frame off. */
export function unmark() {
  globalThis.__portalDownloadUnmark?.();
  if (globalThis.__portalDownloadPlace) { removeEventListener("scroll", globalThis.__portalDownloadPlace, true); removeEventListener("resize", globalThis.__portalDownloadPlace); globalThis.__portalDownloadPlace = null; }
}

/** Runs in the page: scrolls one candidate of this frame into view. */
export function show(i) {
  const el = (globalThis.__portalDownloadFound || [])[i];
  if (el && el.isConnected) el.scrollIntoView({ block: "center", behavior: "smooth" });
}
