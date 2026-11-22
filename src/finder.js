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
  // Words that say "download"; words that only hint at a document.
  const DOWNLOAD = /download(?!s(?![a-z]))|herunterladen|runterladen|télécharger|descargar|baixar|下载|下載/i;
  const HINT = /\bpdf\b|\bdocx?\b|\bxlsx?\b|\bzip\b|exportieren|\bexport\b|abrufen/i;
  // Verbs of actions that change something, as whole words in what a person reads (text, title,
  // label), in the languages of the panel. Many are nouns of documents too (order, pay slip, save
  // as PDF), so they only take the tick away; destroying ones (DESTROY) hide the element.
  const W = (words) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, "iu");
  const ACTION = W("löschen|entfernen|hochladen|absenden|senden|abmelden|kündigen|stornieren|bestellen|bezahlen|speichern|ändern|bearbeiten|papierkorb|archivieren|freigeben|genehmigen|unterschreiben|signieren|teilen|ablehnen|widerrufen|versenden|delete|remove|upload|send|submit|log ?out|sign ?out|cancel|order|pay|save|edit|trash|archive|approve|sign|share|reject|revoke|supprimer|retirer|téléverser|envoyer|soumettre|déconnexion|annuler|commander|payer|enregistrer|modifier|archiver|approuver|signer|partager|rejeter|révoquer|eliminar|borrar|quitar|subir|enviar|cancelar|pagar|guardar|editar|archivar|aprobar|firmar|compartir|rechazar|revocar|excluir|apagar|remover|salvar|encomendar|cargar|carregar|arquivar|aprovar|assinar|compartilhar|partilhar|rejeitar|revogar");
  // Actions that destroy or end something: never offered, whatever else the element says.
  const DESTROY = W("löschen|entfernen|papierkorb|abmelden|ausloggen|kündigen|widerrufen|abbrechen|abbestellen|deaktivieren|delete|remove|trash|discard|erase|cancel|log ?out|sign ?out|revoke|unsubscribe|deactivate|supprimer|effacer|annuler|déconnexion|déconnecter|résilier|révoquer|eliminar|borrar|cancelar|cerrar sesión|revocar|darse de baja|excluir|apagar|remover|sair|encerrar sessão|revogar");
  const DESTROY_ZH = /删除|刪除|移除|退出|登出|撤销|撤銷/;
  const ACTION_ZH = /删除|刪除|移除|上传|上傳|提交|发送|發送|退出|登出|取消|订购|訂購|支付|付款|保存|儲存|编辑|編輯|归档|歸檔|批准|签署|簽署|分享|拒绝|拒絕|撤销|撤銷/;
  // Icons and class names of such actions only make an element doubtful.
  const ACTION_ICON = /(?:^|[\s_\-\/.])(trash|delete|remove|times|close|edit|pencil|upload|save|floppy|share)(?:$|[\s_\-\/.])/i;
  // Words in the path of an address (not its parameters): those that clearly change something
  // are never fetched; those that may also name a place of documents (archive, share) only take
  // the tick away. Words that name documents (storno, order) are in neither.
  const PATH_DESTROY = /^(delete|remove|destroy|drop|cancel|logout|signout|upload|submit|revoke|reject|approve|unsubscribe|deactivate|markread)$/i;
  const PATH_DOUBT = /^(archive|share|send|pay|sign)$/i;
  // camelCase is split too: "deleteFile" names "delete".
  const tokens = (u) => new URL(u).pathname.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/mark-read/g, "markread").split(/[\/_\-.]+/).filter(Boolean);
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
  // What a person reads on the element and its icons: text, title, label, alternative text.
  const human = (el) => {
    const parts = [text(el), el.getAttribute("title"), el.getAttribute("aria-label"), el.getAttribute("alt")];
    for (const c of el.querySelectorAll("i, svg, img, span, title")) parts.push(c.getAttribute("title"), c.getAttribute("aria-label"), c.getAttribute("alt"), c.tagName === "title" ? c.textContent : "");
    return parts.filter(Boolean).join(" ");
  };
  // What only the markup says: class names and icon references of the element and its children.
  const markup = (el) => {
    const parts = [el.getAttribute("download"), typeof el.className === "string" ? el.className : ""];
    for (const c of el.querySelectorAll("i, svg, img, span, use")) parts.push(c.getAttribute("class"), c.getAttribute("href"), c.getAttribute("xlink:href"), c.getAttribute("src"));
    return parts.filter(Boolean).join(" ");
  };
  const fileName = (url) => { try { const p = new URL(url).pathname; return decodeURIComponent(p.slice(p.lastIndexOf("/") + 1)); } catch { return ""; } };

  const found = [];
  let hidden = 0;
  for (const el of all) {
    // One element that cannot be read (an address such as "http://") is skipped, not the whole frame.
    try { consider(el); } catch { /* skipped */ }
  }
  function consider(el) {
    if (!el.matches(CLICKABLE) || !visible(el)) return;
    // Only an address of its own counts as a link: "#…" and "javascript:" are buttons.
    const raw = el.tagName === "A" ? (el.getAttribute("href") || "").trim() : "";
    const href = raw && !raw.startsWith("#") && !/^javascript:/i.test(raw) ? el.href : "";
    // Only http(s) addresses are downloaded as links; blob: and data: belong to the page and are clicked.
    const real = /^https?:/i.test(href);
    const reads = human(el), marks = markup(el);
    const words = `${reads} ${marks}`;
    const said = words.match(DOWNLOAD) || words.match(HINT);
    const label = (text(el) || el.getAttribute("aria-label") || el.getAttribute("title") || fileName(href) || (said ? `[${said[0]}]` : "")).slice(0, 100);
    // A submit button sends its form; one that only hints at a document may do something else.
    const submits = el.matches("input[type=submit], input[type=image], button[type=submit]") || (el.tagName === "BUTTON" && !el.getAttribute("type") && !!el.closest("form"));
    let kind = null, reason = "", sure = true;
    if (real && el.hasAttribute("download")) { kind = "file"; reason = "attr"; }
    else if (real && FILE.test(new URL(href, location.href).pathname)) { kind = "file"; reason = "name"; }
    else if (real && el.getAttribute("type") && /pdf|msword|officedocument|octet-stream|zip/i.test(el.getAttribute("type"))) { kind = "file"; reason = "type"; }
    // A link to a downloads area itself (".../downloads") is a menu, not a document.
    // The path and query, not the host: on "download.example.com" not every link is a document.
    else if (real && MAYBE_URL.test(new URL(href).pathname + new URL(href).search) && !/\/downloads\/?$/i.test(new URL(href).pathname)) { kind = "link"; reason = "address"; }
    else if (DOWNLOAD.test(words) || HINT.test(words)) { kind = real ? "link" : "button"; reason = "words"; sure = DOWNLOAD.test(words) && !submits; }
    if (!kind) return;
    // A link that names a file only downloads it. Anything else that names an action is left
    // out, or offered unticked when it says "download" too; an action icon makes it doubtful.
    if (kind !== "file") {
      if (real && tokens(href).some((w) => PATH_DESTROY.test(w))) { hidden++; return; }
      if (DESTROY.test(reads) || DESTROY_ZH.test(reads)) { hidden++; return; }
      // Every candidate here shows a sign of a document (its address, or a download or document
      // word), so an action word only takes the tick away.
      if (ACTION.test(reads) || ACTION_ZH.test(reads)) sure = false;
      if (real && tokens(href).some((w) => PATH_DOUBT.test(w))) sure = false;
      if (ACTION_ICON.test(marks)) sure = false;
    }
    // The row it stands in (a table row, a list item) tells documents with the same button apart.
    const row = el.parentElement && el.parentElement.closest("tr, li, [role=row], [role=listitem], article");
    const context = row ? (row.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160) : "";
    found.push({ el, kind, reason, label, url: real ? href : "", context, sure });
  }
  // Candidates inside one another count once, as the innermost: a clickable table row keeps
  // the PDF links in it, a download button the link it wraps.
  const kept = found.filter((f) => !found.some((g) => g !== f && f.el.contains(g.el)));
  // Kept in this frame's isolated world for mark(), unmark() and show().
  globalThis.__portalDownloadUnmark?.();
  globalThis.__portalDownloadFound = kept.map((f) => f.el);
  // Buttons with the same words in the same row are told apart by their order.
  const seen = {};
  return { url: location.href, hidden, items: kept.map(({ kind, reason, label, url, context, sure }, i) => {
    const k = `${context}|${label}`;
    return { i, kind, reason, label, url, context, sure, nth: url ? 0 : (seen[k] = (seen[k] ?? -1) + 1) };
  }) };
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
  // Only the three properties it set are put back, so that the page's own style changes stay.
  const PROPS = ["outline", "outline-offset", "background-color"];
  const was = globalThis.__portalDownloadWas || (globalThis.__portalDownloadWas = new Map());
  const restore = () => {
    for (const [el, before] of was) {
      el.removeAttribute(MARK);
      for (const [p, v, prio] of before) { if (v) el.style.setProperty(p, v, prio); else el.style.removeProperty(p); }
      if (el.getAttribute("style") === "") el.removeAttribute("style");
    }
    was.clear();
  };
  globalThis.__portalDownloadUnmark = () => { restore(); document.getElementById("portal-download-badges")?.remove(); document.getElementById("portal-download-style")?.remove(); };
  restore();
  const badges = [];
  for (const [i, n] of pairs) {
    const el = els[i];
    if (!el || !el.isConnected) continue;
    was.set(el, PROPS.map((p) => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]));
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

/** Runs in the page: clicks one candidate of this frame, as a person would. */
export function press(i) {
  const el = (globalThis.__portalDownloadFound || [])[i];
  // Said, not thrown: a thrown error does not reach the panel the same way in every browser.
  if (!el || !el.isConnected) return { gone: true };
  el.scrollIntoView({ block: "center" });
  el.click();
  return { gone: false };
}

/** Runs in the page: whether this is still the page that was searched (a page loaded anew forgets what was found). */
export function alive() {
  return Array.isArray(globalThis.__portalDownloadFound);
}
