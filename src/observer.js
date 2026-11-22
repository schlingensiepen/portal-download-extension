// Watching the user download a document, for a feedback on a portal. The functions below run
// inside the page (scripting.executeScript), one call per frame, each self-contained. scan() of
// finder.js runs first in the same frame and leaves what it made of the elements behind.
//
// observe() notes every click as plain data and sends it to the panel at once, so that a click
// that leaves the page is not lost. Nothing is sent anywhere else; the panel blacks out numbers
// and the like before it shows the text (report.js).

/** Runs in the page: notes the clicks of this frame for the panel that sent the token. */
export function observe(token) {
  globalThis.__portalDownloadObserve?.off();
  const api = globalThis.browser ?? globalThis.chrome;
  const CLICKABLE = "a, button, input[type=button], input[type=submit], input[type=image], [role=button], [role=link], [role=menuitem], [onclick]";
  const attr = (el, n) => (el.getAttribute && el.getAttribute(n)) || "";
  const cls = (el) => (typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(" ") : "");
  // What the search made of it: a candidate, one left out, or nothing.
  const verdict = (el) => {
    // Searched again at the click: the page may have changed since.
    try { globalThis.__portalDownloadRescan?.(); } catch { /* the last search stays */ }
    const found = globalThis.__portalDownloadFound || [], info = globalThis.__portalDownloadInfo || [], skipped = globalThis.__portalDownloadSkipped || [];
    const near = (x) => x === el || x.contains(el) || el.contains(x);
    const i = found.findIndex(near);
    if (i >= 0) return { finder: "found", ...info[i] };
    const s = skipped.find((x) => near(x.el));
    if (s) return { finder: "hidden", why: s.why };
    return { finder: "none", clickable: el.matches(CLICKABLE) };
  };
  const describe = (path) => {
    const els = path.filter((x) => x && x.nodeType === 1);
    const el = els.find((x) => x.matches(CLICKABLE)) || els[0];
    const icons = [];
    for (const c of [...el.querySelectorAll("i, svg, img, span, use")].slice(0, 6)) {
      const d = [attr(c, "class"), attr(c, "title"), attr(c, "aria-label"), attr(c, "alt"), attr(c, "href") || attr(c, "xlink:href"), attr(c, "src")].filter(Boolean).join(" ");
      if (d) icons.push(d);
    }
    const chain = [];
    for (let p = el.parentElement, k = 0; p && k < 3; p = p.parentElement, k++) chain.unshift(p.tagName.toLowerCase() + (cls(p) ? `.${cls(p).split(" ").slice(0, 2).join(".")}` : ""));
    const raw = el.tagName === "A" ? attr(el, "href").trim() : "";
    const form = el.form || el.closest("form");
    const submits = el.matches("input[type=submit], input[type=image], button[type=submit]") || (el.tagName === "BUTTON" && !attr(el, "type") && !!form);
    return {
      at: Date.now(), tag: el.tagName.toLowerCase(), type: attr(el, "type"), role: attr(el, "role"), id: el.id || "", cls: cls(el),
      text: (el.innerText || el.value || "").replace(/\s+/g, " ").trim().slice(0, 200),
      title: attr(el, "title"), aria: attr(el, "aria-label"), alt: attr(el, "alt"),
      download: el.hasAttribute("download") ? attr(el, "download") || "(empty)" : null,
      // "#…" and "javascript:" as written; a real address absolute.
      href: !raw ? "" : raw.startsWith("#") || /^javascript:/i.test(raw) ? raw : el.href,
      target: attr(el, "target"), onclick: attr(el, "onclick"),
      form: submits && form ? { action: form.action || "", method: (form.method || "get").toLowerCase() } : null,
      pointer: getComputedStyle(el).cursor === "pointer", icons, chain,
      shadow: el.getRootNode() !== document, frame: window === top ? "" : location.href, page: location.href,
      verdict: verdict(el),
    };
  };
  const off = () => { removeEventListener("click", on, true); removeEventListener("auxclick", on, true); if (globalThis.__portalDownloadObserve === me) globalThis.__portalDownloadObserve = null; };
  function on(e) {
    try {
      const click = describe(e.composedPath());
      // No panel listening (closed, or a newer watch): stop noting.
      Promise.resolve(api.runtime.sendMessage({ portalDownloadClick: token, click })).catch(off);
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
