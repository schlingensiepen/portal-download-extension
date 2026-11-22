// Watching the user download a document, for a feedback on a portal. The functions below run
// inside the page (scripting.executeScript), one call per frame, each self-contained. scan() of
// finder.js runs first in the same frame and leaves what it made of the elements behind.
//
// observe() notes, for every click of the user, only what kind of element it was, the words on
// it, a few yes/no marks and what the search made of it, and sends that to the panel at once, so
// that a click that leaves the page is not lost. No address, id, class or script is noted, and
// never what was typed: no value of a field, no text of a large area.

/** Runs in the page: notes the clicks of this frame for the panel that sent the token. */
export function observe(token) {
  globalThis.__portalDownloadObserve?.off();
  const api = globalThis.browser ?? globalThis.chrome;
  const CLICKABLE = "a, button, input[type=button], input[type=submit], input[type=reset], input[type=image], [role=button], [role=link], [role=menuitem], [onclick]";
  // Anything one types into or chooses from: its words are never read.
  const FIELD = "input:not([type=button]):not([type=submit]):not([type=reset]):not([type=image]), textarea, select, option, optgroup, datalist, [contenteditable]:not([contenteditable=false]), [role=textbox], [role=listbox], [role=option], [role=combobox], [role=searchbox]";
  // getAttribute, not properties: a form with a field named "action" or "id" hides the property.
  const attr = (el, n) => { try { const v = el.getAttribute(n); return typeof v === "string" ? v : ""; } catch { return ""; } };
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
  // The words a person reads on it: of a link or button its text; of another clickable element
  // (a row, a card) only a short text; of a plain element only a short text of its own. Without
  // text, its label (aria-label, title, alt). Nothing of a field, of what holds one, or of the page.
  const words = (el, clickable, target) => {
    if (el.matches("input[type=button], input[type=submit], input[type=reset]")) return attr(el, "value");
    if ((target && target.closest(FIELD)) || el.closest(FIELD) || el.querySelector(FIELD) || el === document.body || el === document.documentElement) return "";
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    const own = clickable && el.matches("a, button") ? t.slice(0, 200) : clickable ? (t.length <= 60 ? t : "") : (el.children.length === 0 && t.length <= 40 ? t : "");
    return own || attr(el, "aria-label") || attr(el, "title") || attr(el, "alt") || "";
  };
  const describe = (path) => {
    const els = path.filter((x) => x && x.nodeType === 1);
    const hit = els.find((x) => x.matches(CLICKABLE));
    const el = hit || els[0];
    const tag = tagOf(el);
    const href = tag === "a" ? attr(el, "href").trim() : "";
    const form = el.closest("form");
    return {
      at: Date.now(), tag, role: attr(el, "role"), type: attr(el, "type"),
      words: words(el, !!hit, els[0]),
      // Yes/no marks only: none of them carries what the page wrote.
      link: !href ? "" : href.startsWith("#") || /^javascript:/i.test(href) ? "script" : "address",
      download: el.hasAttribute("download"),
      newTab: attr(el, "target").toLowerCase() === "_blank",
      onclick: el.hasAttribute("onclick"),
      submits: el.matches("input[type=submit], input[type=image], button[type=submit]") || (tag === "button" && !attr(el, "type") && !!form),
      icon: !!el.querySelector("i, svg, img"),
      pointer: getComputedStyle(el).cursor === "pointer",
      frame: window !== top, shadow: el.getRootNode() !== document,
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
    } catch { off(); /* never in the way of the page; an extension reloaded meanwhile cannot be reached */ }
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
