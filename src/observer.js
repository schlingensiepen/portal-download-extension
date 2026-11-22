// Watching the user download a document, for a feedback on a portal. The functions below run
// inside the page (scripting.executeScript), one call per frame, each self-contained. scan() of
// finder.js runs first in the same frame and leaves what it made of the elements behind.
//
// observe() notes every click of the user as plain data and sends it to the panel at once, so
// that a click that leaves the page is not lost. It never reads what was typed: no value of a
// field, no text of a large area. Nothing is sent anywhere but to the panel; the panel blacks out
// numbers and the like before it shows the text (report.js).

/** Runs in the page: notes the clicks of this frame for the panel that sent the token. */
export function observe(token) {
  globalThis.__portalDownloadObserve?.off();
  const api = globalThis.browser ?? globalThis.chrome;
  const CLICKABLE = "a, button, input[type=button], input[type=submit], input[type=reset], input[type=image], [role=button], [role=link], [role=menuitem], [onclick]";
  // getAttribute, not properties: a form with a field named "action" or "id" hides the property.
  const attr = (el, n) => { try { const v = el.getAttribute(n); return typeof v === "string" ? v : ""; } catch { return ""; } };
  const cls = (el) => attr(el, "class").trim().split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  const tagOf = (el) => String(el.tagName || "").toLowerCase();
  // What the search made of it: a candidate (the element or one around it), one left out, or nothing.
  const verdict = (el) => {
    // Searched again at the click when the last search is older than a second: the page may have changed.
    if (Date.now() - (globalThis.__portalDownloadScanAt || 0) > 1000) {
      try { globalThis.__portalDownloadRescan?.(); } catch { /* the last search stays */ }
      globalThis.__portalDownloadScanAt = Date.now();
    }
    const found = globalThis.__portalDownloadFound || [], info = globalThis.__portalDownloadInfo || [], skipped = globalThis.__portalDownloadSkipped || [];
    const around = (x) => x === el || x.contains(el);
    const i = found.findIndex(around);
    if (i >= 0) return { finder: "found", ...info[i] };
    const s = skipped.find((x) => around(x.el));
    if (s) return { finder: "hidden", why: s.why };
    return { finder: "none", clickable: el.matches(CLICKABLE) };
  };
  // The words a person reads on it, never what was typed: buttons and links only; a plain element
  // only when it holds nothing but a short text of its own (not a whole row or panel).
  const words = (el, clickable) => {
    if (el.matches("input, textarea, select, [contenteditable], [contenteditable] *")) {
      return el.matches("input[type=button], input[type=submit], input[type=reset]") ? attr(el, "value") : "";
    }
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (clickable) return t.slice(0, 200);
    return el.children.length === 0 && t.length <= 40 ? t : "";
  };
  const describe = (path) => {
    const els = path.filter((x) => x && x.nodeType === 1);
    const hit = els.find((x) => x.matches(CLICKABLE));
    const el = hit || els[0];
    const icons = [];
    for (const c of [...el.querySelectorAll("i, svg, img, span, use")].slice(0, 6)) {
      const d = { cls: cls(c), title: attr(c, "title"), aria: attr(c, "aria-label"), alt: attr(c, "alt"), url: attr(c, "href") || attr(c, "xlink:href") || attr(c, "src") };
      if (d.cls || d.title || d.aria || d.alt || d.url) icons.push(d);
    }
    const chain = [];
    for (let p = el.parentElement, k = 0; p && k < 3; p = p.parentElement, k++) chain.push({ tag: tagOf(p), cls: cls(p).split(" ").slice(0, 2).join(" ") });
    chain.reverse();
    const raw = tagOf(el) === "a" ? attr(el, "href").trim() : "";
    let href = raw;
    if (raw && !raw.startsWith("#") && !/^javascript:/i.test(raw)) { try { href = new URL(raw, document.baseURI).href; } catch { /* as written */ } }
    const form = el.closest("form");
    const submits = el.matches("input[type=submit], input[type=image], button[type=submit]") || (tagOf(el) === "button" && !attr(el, "type") && !!form);
    let action = "";
    if (submits && form) { try { action = new URL(attr(form, "action") || "", document.baseURI).href; } catch { action = attr(form, "action"); } }
    return {
      at: Date.now(), tag: tagOf(el), type: attr(el, "type"), role: attr(el, "role"), id: attr(el, "id"), cls: cls(el),
      text: words(el, !!hit), title: attr(el, "title"), aria: attr(el, "aria-label"), alt: attr(el, "alt"),
      download: el.hasAttribute("download") ? attr(el, "download") || "(empty)" : null,
      href, target: attr(el, "target"), onclick: attr(el, "onclick"),
      form: submits && form ? { action, method: (attr(form, "method") || "get").toLowerCase() } : null,
      pointer: getComputedStyle(el).cursor === "pointer", icons, chain,
      shadow: el.getRootNode() !== document, frame: window === top ? "" : location.href,
      verdict: verdict(el),
    };
  };
  const off = () => { removeEventListener("click", on, true); removeEventListener("auxclick", on, true); if (globalThis.__portalDownloadObserve === me) globalThis.__portalDownloadObserve = null; };
  function on(e) {
    // Only the user's own clicks: a page that clicks a link of its own in a script is not the user.
    if (!e.isTrusted) return;
    try {
      const click = describe(e.composedPath());
      // Only the watching panel answers true; anything else (closed, ended, a newer watch) stops the noting.
      Promise.resolve(api.runtime.sendMessage({ portalDownloadClick: token, click })).then((r) => { if (r !== true) off(); }, off);
    } catch { /* never in the way of the page */ }
  }
  const me = { off };
  globalThis.__portalDownloadObserve = me;
  addEventListener("click", on, true);
  addEventListener("auxclick", on, true);
  return true;
}

/** Runs in the page: stops noting clicks in this frame. */
export function unobserve() {
  globalThis.__portalDownloadObserve?.off();
}
