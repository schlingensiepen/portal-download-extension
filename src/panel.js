// The side panel: one list of the due jobs of every backend, a job with its login and
// instructions, closing a run, adding a service from an invitation in the current tab, the
// local store with its passphrase, and the exchange of jobs as a file.

import { Vault } from "./vault.js";
import { ServiceBackend, localBackend, parseInvitation, CONTRACT } from "./backends.js";
import { checkPassword, fromBase64 } from "./local.js";
import { LANGUAGES, load, tag } from "./i18n.js";
import { scan, mark, unmark, show, press, alive } from "./finder.js";
import { runQueue, remembered, folderFor } from "./fetcher.js";
import { observe, unobserve } from "./observer.js";
import { buildReport } from "./report.js";

const api = globalThis.browser ?? globalThis.chrome;
const vault = new Vault();
const $ = (s) => document.querySelector(s);
// The chosen language is read before anything is drawn.
const { language: chosenLanguage = "auto" } = await api.storage.local.get("language");
const lang = await load(api, chosenLanguage);
const t = lang.t;
const locale = tag(lang.code);

/** An element with attributes, text and children; text goes in as text only. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
function toast(text, err) {
  const d = h("div", { class: err ? "err" : "" }, text);
  $("#toast").append(d);
  setTimeout(() => d.remove(), err ? 9000 : 4000);
}
/** What an error means for the user, in the panel's language where it is the extension's own. */
function explain(e) {
  if (e.kind === "unreachable") return t("err_unreachable");
  if (e.kind === "user_deactivated" && state.view === "add") return t("err_deactivated");
  if (["device_revoked", "credential_unknown", "user_deactivated"].includes(e.kind)) return t("err_access_gone");
  if (e.kind === "unreadable") return t("err_unreadable");
  if (e.kind === "locked") return t("err_locked");
  if (e.kind === "busy") return t("err_busy");
  if (e.kind === "vault_exists") return t("err_vault_exists");
  return e.message || String(e);
}
const fail = (e) => { console.error(e); toast(explain(e), true); };
const fmtDate = (iso) => (iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : "–");
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "–");
function urgency(days) {
  if (days === -1) return h("span", { class: "chip bad" }, t("overdue_one"));
  if (days < 0) return h("span", { class: "chip bad" }, t("overdue", -days));
  if (days === 0) return h("span", { class: "chip warn" }, t("due_today"));
  if (days === 1) return h("span", { class: "chip warn" }, t("due_tomorrow"));
  return h("span", { class: "chip" }, t("due_in", days));
}
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { return toast(t("copy_refused"), true); }
  const old = btn.textContent; btn.textContent = t("copied"); setTimeout(() => (btn.textContent = old), 1500);
}
/** A button that asks once more in place before it acts. */
function confirmButton(label, question, cls, action) {
  const b = h("button", { class: `btn ${cls}`, type: "button" }, label);
  let armed = false;
  b.addEventListener("click", async () => {
    if (!armed) { armed = true; b.textContent = question; setTimeout(() => { armed = false; b.textContent = label; }, 4000); return; }
    armed = false; b.disabled = true;
    try { await action(); } catch (e) { fail(e); } finally { b.disabled = false; b.textContent = label; }
  });
  return b;
}
function saveFile(bytes, name) {
  const a = h("a", { href: URL.createObjectURL(new Blob([bytes], { type: "application/zip" })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
/** The permission pattern of a service: scheme and host, without the port, which Firefox does not take. */
const originPattern = (base) => { const u = new URL(base); return `${u.protocol}//${u.hostname}/*`; };
async function activeTab() { const [tab] = await api.tabs.query({ active: true, currentWindow: true }); return tab; }

// ------------------------------------------------------------------ state
const state = { choice: "all", view: "list", job: null, done: null, backends: [], content: null, vaultState: "plain", problems: {}, mismatch: {}, preview: null, tabUrl: "", tabTitle: "" };
// The address of the active tab, kept up to date, so that a click can ask for a permission
// before anything else waits: Firefox grants permissions only directly in the click.
async function followTab() { try { const tab = await activeTab(); state.tabUrl = (tab && tab.url) || ""; state.tabId = tab ? tab.id : null; state.tabTitle = (tab && tab.title) || ""; } catch { /* no tab */ } }
api.tabs.onActivated.addListener(followTab);
api.tabs.onUpdated.addListener((_, info) => { if (info.url || info.title || info.status === "complete") followTab(); });
followTab();
const current = () => state.backends.find((b) => b.id === state.choice) || null;

// Loads may overlap (a change in storage while the panel itself loads); the last one started wins.
let loads = 0;
async function loadBackends() {
  const mine = ++loads;
  let vaultState = await vault.state();
  const backends = [];
  let content = null;
  if (vaultState !== "locked") {
    try { content = await vault.read(); }
    catch (e) { if (e.kind !== "locked") throw e; return finish(mine, "locked", [], null); }
    // From what was read: another window may have created or removed the store since state().
    vaultState = content.local ? "open" : "plain";
    for (const s of content.services) backends.push(new ServiceBackend(s));
    if (content.local) { const b = localBackend(vault); b.name = t("local_name"); backends.push(b); }
  }
  finish(mine, vaultState, backends, content);
}
function finish(mine, vaultState, backends, content) {
  if (mine !== loads) return;
  Object.assign(state, { vaultState, backends, content });
  if (state.choice !== "all" && !current()) state.choice = "all";
}

function renderTop() {
  const sel = $("#choose");
  sel.replaceChildren(h("option", { value: "all" }, t("all")), ...state.backends.map((b) => h("option", { value: b.id }, b.name)));
  sel.value = state.choice;
  sel.disabled = state.vaultState === "locked";
  $("#add").title = t("add_title");
  $("#manage").title = t("manage_title");
  // What concerns one backend is greyed out under "All".
  $("#manage").disabled = state.choice === "all" || state.vaultState === "locked";
  $("#add").disabled = state.vaultState === "locked";
}

let renders = 0;
async function render() {
  const mine = ++renders;
  renderTop();
  const view = $("#view");
  try {
    if (state.vaultState === "locked") {
      // Nothing of the store stays on screen or in memory while it is locked; a download queue stops.
      if (state.docs) { state.docs.stop = true; unhighlight(state.docs); state.docs = null; }
      if (state.watch) { endWatching(state.watch, "stopped"); state.watch = null; }
      Object.assign(state, { job: null, preview: null, done: null, view: "list" });
      return view.replaceChildren(viewUnlock());
    }
    // A job and its editing carry their own backend, also under "All"; management and a new job need one chosen.
    if ((["manage", "new"].includes(state.view) && !current()) || (["job", "edit"].includes(state.view) && !(state.job && state.backends.some((x) => x.id === state.job.b.id)))) state.view = "list";
    if (state.view === "docs" && !state.docs) state.view = "list";
    if (state.view === "watch" && !state.watch) state.view = "list";
    const v = state.view;
    const content = v === "watch" ? viewWatch() : v === "docs" ? viewDocs() : v === "job" ? viewJob() : v === "add" ? viewAdd() : v === "manage" ? await viewManage() : v === "new" || v === "edit" ? await viewNew() : await viewList();
    // A slower render that started earlier does not cover a later one.
    if (mine === renders) view.replaceChildren(content);
  } catch (e) { fail(e); }
}
// "fromTab" holds for the one view it was given to; a preview of a file only while its backend's management is shown.
// Something typed or a file previewed, which a reload would lose.
const typed = () => !!state.preview || [...document.querySelectorAll("#view input, #view textarea")].some((el) => el.type !== "file" && el.value && !el.readOnly && el.defaultValue !== el.value);
const go = (view, extra = {}) => { if (view !== "docs" && state.docs && state.docs.running) state.docs.stop = true; if (view !== "watch" && state.watch) { endWatching(state.watch, "stopped"); state.watch = null; } if (view !== "job") state.keptNote = ""; Object.assign(state, { view, fromTab: false }, view === "manage" ? {} : { preview: null }, extra); render(); };

// ------------------------------------------------------------------ views
function viewUnlock() {
  const pw = h("input", { type: "password", autocomplete: "current-password" });
  const form = h("form", { class: "card" }, h("h1", {}, t("unlock_title")), h("p", { class: "small" }, t("unlock_text")), h("label", {}, t("passphrase")), pw,
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn primary", type: "submit" }, t("unlock"))),
    h("p", { class: "small muted" }, t("export_reminder")),
    h("details", { class: "small" }, h("summary", {}, t("forgot_title")), h("p", {}, t("forgot_text")),
      confirmButton(t("forgot_button"), t("really"), "bad", async () => {
        // The store is locked, so its services are unknown; every host permission belongs to one of them.
        const { origins = [] } = await api.permissions.getAll();
        await vault.forget();
        if (origins.length) api.permissions.remove({ origins }).catch(() => {});
        await loadBackends(); state.choice = "all"; go("list");
      })));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const ok = await vault.unlock(pw.value);
      if (!ok) return toast(t("passphrase_wrong"), true);
      // The passphrase fit, but the content does not open: a damaged store.
      if (ok === "damaged") return toast(t("err_damaged"), true);
      await loadBackends();
      go("list");
    } catch (err) { fail(err); }
  });
  setTimeout(() => pw.focus(), 0);
  return form;
}

async function viewList() {
  const chosen = state.choice === "all" ? state.backends : [current()];
  const box = h("div", {});
  if (!state.backends.length) {
    box.append(h("div", { class: "card" }, h("h1", {}, t("welcome_title")), h("p", { class: "small" }, t("welcome_text")),
      h("button", { class: "btn primary", type: "button", onclick: () => go("add") }, t("add_title"))));
    box.append(h("button", { class: "btn wide", type: "button", onclick: findDocuments }, t("docs_find")));
    box.append(watchOffer());
    return box;
  }
  // What concerns one backend is greyed out under "All".
  box.append(h("div", { class: "row", style: "margin-bottom:8px" }, h("button", { class: "btn", type: "button", disabled: state.choice === "all" || !!state.mismatch[state.choice], title: state.choice === "all" ? t("choose_backend") : null, onclick: () => go("new", { fromTab: true }) }, t("add_page")),
    h("button", { class: "btn", type: "button", onclick: findDocuments }, t("docs_find"))));
  box.append(watchOffer());
  const all = [];
  await Promise.all(chosen.map(async (b) => {
    delete state.problems[b.id];
    delete state.mismatch[b.id];
    try {
      if (b instanceof ServiceBackend) {
        const st = await b.call("service.status");
        if (st.contract !== CONTRACT) { state.mismatch[b.id] = true; state.problems[b.id] = t("contract_mismatch", b.name, st.contract || "?", CONTRACT); }
        else if (!st.signed_in) { state.problems[b.id] = t("signed_out", b.name); return; }
      }
      const r = await b.call("job.list");
      for (const j of r.jobs) all.push({ b, j });
    } catch (e) { state.problems[b.id] = ["device_revoked", "credential_unknown", "user_deactivated"].includes(e.kind) ? t("signed_out", b.name) : `${b.name}: ${explain(e)}`; }
  }));
  for (const b of chosen) if (state.problems[b.id]) box.append(h("div", { class: "card alert small" }, state.problems[b.id]));
  all.sort((x, y) => (x.j.next_due < y.j.next_due ? -1 : x.j.next_due > y.j.next_due ? 1 : x.j.title.localeCompare(y.j.title)));
  if (!all.length && !chosen.some((b) => state.problems[b.id])) box.append(h("p", { class: "muted" }, t("no_jobs")));
  for (const { b, j } of all) {
    box.append(h("div", { class: "card job", onclick: () => go("job", { job: { b, j }, done: null }) },
      h("div", { class: "row" }, urgency(j.urgency_days), h("strong", { class: "grow" }, j.title)),
      h("div", { class: "muted small" }, state.choice === "all" ? `${b.name} · ${fmtDate(j.next_due)}` : fmtDate(j.next_due))));
  }
  return box;
}

function viewJob() {
  const { b, j } = state.job;
  const box = h("div", {});
  box.append(h("button", { class: "btn", type: "button", onclick: () => go("list") }, t("back")));
  box.append(h("h1", {}, j.title), h("div", { class: "muted small" }, `${b.name} · ${(j.interval_weeks === 1 ? t("schedule_one", fmtDate(j.next_due)) : t("schedule", fmtDate(j.next_due), j.interval_weeks))}`));
  if (state.done) {
    box.append(h("div", { class: "card done" }, h("strong", {}, t("done", fmtDate(state.done))),
      h("div", { style: "margin-top:6px" }, h("button", { class: "btn primary", type: "button", onclick: () => go("list", { done: null }) }, t("next_job")))));
  }
  if (j.last_run) box.append(h("p", { class: "small muted" }, t("last_run", t(j.last_run.outcome), fmtDateTime(j.last_run.finished_at), j.last_run.by), j.last_run.note ? h("div", { class: "pre" }, j.last_run.note) : null));
  box.append(h("button", { class: "btn primary wide", type: "button", onclick: () => { if (/^https?:\/\//i.test(j.entry_url)) api.tabs.create({ url: j.entry_url }); } }, t("open_portal")));
  box.append(h("button", { class: "btn wide", type: "button", style: "margin-top:6px", onclick: findDocuments }, t("docs_find")));
  box.append(watchOffer());
  const login = h("div", { class: "card" });
  for (const [k, v] of [["username", j.username], ["password", j.password]]) {
    if (!v) continue;
    const shown = k === "username";
    const value = h("span", { class: "value grow" }, shown ? v : "••••••••");
    const toggle = shown ? null : h("button", { class: "btn", type: "button", onclick: (e) => { const open = value.textContent !== v; value.textContent = open ? v : "••••••••"; e.currentTarget.textContent = open ? t("hide") : t("show"); } }, t("show"));
    login.append(h("label", {}, t(k)), h("div", { class: "row" }, value, toggle, h("button", { class: "btn", type: "button", onclick: (e) => copy(v, e.currentTarget) }, t("copy"))));
  }
  if (!j.username && !j.password && j.username !== undefined) login.append(h("p", { class: "small muted" }, t("no_login")));
  if (j.username === undefined) login.append(h("p", { class: "small muted" }, t("login_hidden")));
  box.append(login);
  if (j.instructions_md) box.append(h("div", { class: "card pre small" }, j.instructions_md));
  if (!state.mismatch[b.id]) box.append(h("div", { class: "row", style: "margin:6px 0" },
    h("button", { class: "btn", type: "button", onclick: () => go("edit") }, t("edit")),
    confirmButton(t("delete"), t("really"), "bad", async () => { try { await b.call("job.delete", { job_id: j.job_id }); toast(t("deleted")); go("list", { job: null }); } catch (e) { fail(e); } })));
  if (state.mismatch[b.id]) box.append(h("p", { class: "card alert small" }, t("contract_blocks")));
  else if (!state.done) {
    const note = h("textarea", { placeholder: t("note_placeholder") });
    if (state.keptNote) { note.value = state.keptNote; state.keptNote = ""; }
    const finish = async (outcome) => {
      try {
        const r = await b.call("job.complete", { job_id: j.job_id, outcome, note: note.value, expected_next_due: j.next_due });
        const fresh = await b.call("job.get", { job_id: j.job_id });
        go("job", { job: { b, j: fresh }, done: r.next_due });
      } catch (e) {
        fail(e);
        // Changed elsewhere meanwhile: show the job as it is now, keeping the note.
        if (e.kind === "job_changed") {
          try { const kept = note.value; const fresh = await b.call("job.get", { job_id: j.job_id }); state.keptNote = kept; go("job", { job: { b, j: fresh } }); } catch (e2) { fail(e2); }
        }
      }
    };
    box.append(h("label", {}, t("note")), note, h("div", { class: "row", style: "margin-top:8px" },
      confirmButton(t("btn_succeeded"), t("really"), "ok grow", () => finish("succeeded")),
      confirmButton(t("btn_failed"), t("really"), "bad grow", () => finish("failed"))));
  }
  return box;
}

async function viewNew() {
  const editing = state.view === "edit" && state.job ? state.job.j : null;
  // A job is edited in its own backend, also under "All".
  const b = editing ? state.job.b : current();
  const f = { title: h("input", { type: "text", required: true, maxlength: "200" }), url: h("input", { type: "url", required: true }), weeks: h("input", { type: "number", min: "1", max: "520", value: "4" }),
    retry: h("input", { type: "number", min: "1", max: "365", value: "2" }), due: h("input", { type: "date" }),
    user: h("input", { type: "text", autocomplete: "off", spellcheck: "false" }), pass: h("input", { type: "text", autocomplete: "off", spellcheck: "false" }), text: h("textarea", {}) };
  if (editing) {
    Object.assign(f.title, { value: editing.title }); f.url.value = editing.entry_url; f.weeks.value = editing.interval_weeks; f.retry.value = editing.retry_days;
    f.due.value = editing.next_due; f.user.value = editing.username || ""; f.pass.value = editing.password || ""; f.text.value = editing.instructions_md || "";
  }
  if (!editing && state.fromTab && /^https?:/.test(state.tabUrl)) {
    // An invitation in the fragment does not belong into a job.
    const u = new URL(state.tabUrl); if (/invite=/.test(u.hash)) u.hash = "";
    f.url.value = u.href; f.title.value = state.tabTitle || u.host;
  }
  // What is filled in here counts as the starting point, not as typed (see typed()).
  for (const el of Object.values(f)) el.defaultValue = el.value;
  const form = h("form", { class: "card" }, h("h1", {}, editing ? t("edit_job") : t("new_job")), h("label", {}, t("title")), f.title, h("label", {}, t("entry_url")), f.url,
    editing ? h("p", { class: "small muted" }, t("url_hint")) : null,
    h("label", {}, t("every_weeks")), f.weeks, h("label", {}, t("retry_days")), f.retry, editing ? h("label", {}, t("next_due")) : null, editing ? f.due : null,
    h("label", {}, t("username")), f.user, h("label", {}, t("password")), f.pass, h("p", { class: "small muted" }, b.id === "local" ? t("login_local") : t("login_plain")),
    h("label", {}, t("instructions_md")), f.text,
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit" }, editing ? t("save") : t("create")), h("button", { class: "btn", type: "button", onclick: () => go(editing ? "job" : "list") }, t("cancel"))));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const all = { title: f.title.value, entry_url: f.url.value.trim(), interval_weeks: Number(f.weeks.value), retry_days: Number(f.retry.value), username: f.user.value, password: f.pass.value, instructions_md: f.text.value };
    try {
      if (editing) {
        if (f.due.value) all.next_due = f.due.value;
        // Only what changed, so that a change by somebody else meanwhile survives.
        const changed = Object.fromEntries(Object.entries(all).filter(([k, v]) => editing[k] !== v));
        const j = await b.call("job.update", { job_id: editing.job_id, ...changed });
        toast(t("saved")); go("job", { job: { b, j }, done: null });
      } else {
        await b.call("job.create", all);
        toast(t("created")); go("list");
      }
    } catch (err) { fail(err); }
  });
  return form;
}

function viewAdd() {
  const box = h("div", {});
  followTab();
  box.append(h("button", { class: "btn", type: "button", onclick: () => go("list") }, t("back")));
  box.append(h("div", { class: "card" }, h("h1", {}, t("add_service_title")), h("p", { class: "small" }, t("add_service_text")),
    h("button", { class: "btn primary wide", type: "button", onclick: addFromTab }, t("add_from_tab"))));
  if (!state.content.local) {
    const p1 = h("input", { type: "password", autocomplete: "new-password" }), p2 = h("input", { type: "password", autocomplete: "new-password" });
    const form = h("form", { class: "card" }, h("h1", {}, t("local_title")), h("p", { class: "small" }, t("local_text")),
      h("label", {}, t("passphrase")), p1, h("label", {}, t("passphrase_again")), p2, h("p", { class: "small muted" }, t("passphrase_warning")),
      h("button", { class: "btn wide", type: "submit" }, t("local_create")));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (p1.value.length < 10) return toast(t("passphrase_short"), true);
      if (p1.value !== p2.value) return toast(t("passphrase_differs"), true);
      try { await vault.createLocal(p1.value); await loadBackends(); state.choice = "local"; toast(t("local_created")); go("list"); } catch (err) { fail(err); }
    });
    box.append(form);
  }
  return box;
}

async function addFromTab() {
  const inv = parseInvitation(state.tabUrl);
  if (!inv) return toast(t("no_invitation"), true);
  const pattern = originPattern(inv.base);
  let granted = false, redeemed = null;
  // Known without waiting, so that the permission request stays the first awaited step.
  const hadPattern = !!(state.content && state.content.services.some((s) => originPattern(s.base) === pattern));
  try {
    // The first thing the click awaits, as Firefox requires: access to this one service only.
    granted = await api.permissions.request({ origins: [pattern] });
    if (!granted) return toast(t("permission_refused"), true);
    const content = await vault.read();
    if (content.services.some((s) => s.base === inv.base)) { toast(t("already_added"), true); return; }
    const probe = new ServiceBackend({ id: "probe", name: inv.origin, base: inv.base, token: "" });
    const st = await probe.call("service.status");
    if (st.contract !== CONTRACT) throw Object.assign(new Error(t("contract_mismatch", inv.origin, st.contract || "?", CONTRACT)), { kind: "contract" });
    const ua = navigator.userAgent;
    const browser = /Firefox\//.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : "Chrome";
    const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
    const label = t("device_label", browser, os).trim();
    redeemed = await probe.call("invitation.redeem", { token: inv.token, label, kind: "extension" });
    const r = redeemed;
    const id = `s${Date.now().toString(36)}`;
    // Read anew: another window may have changed the store while the service answered.
    const kept = await vault.update((latest) => {
      const there = latest.services.find((s) => s.base === inv.base);
      if (there) return there.id;
      latest.services.push({ id, name: `${new URL(inv.base).host} (${r.name})`, base: inv.base, token: r.device_token });
      return id;
    });
    // From here on the access is either kept or revoked below; no later failure may revoke it.
    redeemed = null;
    if (kept !== id) dropDevice(inv.base, r.device_token);
    await loadBackends();
    state.choice = kept;
    if (kept !== id) toast(t("already_added"), true);
    else toast(t("service_added", r.name));
    go("list");
  } catch (e) {
    // An access redeemed but not kept is revoked on the service again.
    if (redeemed) dropDevice(inv.base, redeemed.device_token);
    // A permission for a service that was not added is given back.
    // Given back only if it was granted for this attempt and no kept service uses it; when in doubt it stays.
    if (granted && !hadPattern) vault.read().then((c) => { if (!c.services.some((s) => originPattern(s.base) === pattern)) api.permissions.remove({ origins: [pattern] }).catch(() => {}); }, () => {});
    fail(e);
  }
}

// Documents in the active tab: found, numbered and highlighted in yellow, then downloaded one
// after the other into a folder of the job. What was downloaded is remembered per job (or per
// site, without a job) and offered unticked next time.
async function findDocuments() {
  const url = state.tabUrl, tabId = state.tabId;
  if (!/^https?:/i.test(url) || tabId == null) return toast(t("docs_no_page"), true);
  // Plain http only for this computer; the browser would refuse to ask for any other.
  const site = new URL(url);
  if (site.protocol === "http:" && !["localhost", "127.0.0.1"].includes(site.hostname)) return toast(t("docs_http"), true);
  // The job it was started from; a new search keeps it.
  const job = state.view === "job" ? state.job : state.view === "docs" && state.docs ? state.docs.job : null;
  try {
    // The first thing the click awaits, as Firefox requires: access to this portal only.
    if (!(await api.permissions.request({ origins: [originPattern(url)] }))) return toast(t("docs_refused"), true);
    if (state.docs) { state.docs.stop = true; await unhighlight(state.docs); }
    let results;
    // Every frame the extension may reach; frames of other addresses are left out.
    try { results = await api.scripting.executeScript({ target: { tabId, allFrames: true }, func: scan }); }
    catch { results = await api.scripting.executeScript({ target: { tabId }, func: scan }); }
    const scope = job ? `job:${job.b.id}:${job.j.job_id}` : `site:${new URL(url).hostname}`;
    const known = await remembered.get(scope);
    let n = 0;
    const frames = [], keys = new Set();
    const hidden = results.reduce((sum, x) => sum + ((x && x.result && x.result.hidden) || 0), 0);
    for (const r of results.filter((x) => x && x.result)) {
      const items = [];
      for (const found of r.result.items) {
        const it = { ...found, page: r.result.url };
        const key = await remembered.keyOf(it);
        // Ticked: what is new, sure to be a download, and not the same as one above it.
        const twice = keys.has(key);
        keys.add(key);
        items.push({ ...it, frameId: r.frameId, n: ++n, key, twice, done: known[key] || null, on: !known[key] && it.sure !== false && !twice, status: null });
      }
      frames.push({ frameId: r.frameId, url: r.result.url, items });
    }
    state.docs = { tabId, url, job, scope, folder: folderFor(job && job.j, url), frames, hidden, running: false, stop: false };
    await highlight(state.docs);
    go("docs");
  } catch (e) { fail(e); }
}
async function highlight(d = state.docs) {
  if (!d || state.docs !== d) return;
  await Promise.all(d.frames.map((f) => api.scripting.executeScript({ target: { tabId: d.tabId, frameIds: [f.frameId] }, func: mark, args: [f.items.filter((i) => i.on).map((i) => [i.i, i.n])] }).catch(() => {})));
}
const unhighlight = (d) => Promise.all(d.frames.map((f) => api.scripting.executeScript({ target: { tabId: d.tabId, frameIds: [f.frameId] }, func: unmark }).catch(() => {})));
async function clearDocuments() {
  const d = state.docs;
  if (d) d.stop = true;
  state.docs = null;
  if (d) await unhighlight(d);
  go(d && d.job ? "job" : "list", d && d.job ? { job: d.job } : {});
}
async function downloadDocuments(only) {
  const d = state.docs;
  if (!d || d.running) return;
  try {
    // The first thing the click awaits: the permission to download, asked once.
    if (!(await api.permissions.request({ permissions: ["downloads"] }))) return toast(t("docs_refused_downloads"), true);
    // One document from its own button, else every ticked one.
    const items = only && only.n ? [only] : d.frames.flatMap((f) => f.items).filter((i) => i.on);
    if (!items.length) return;
    d.running = true; d.stop = false;
    for (const i of items) i.status = "waiting";
    render();
    await runQueue({
      items, tabId: d.tabId, pageUrl: d.url, folder: d.folder,
      click: (it) => api.scripting.executeScript({ target: { tabId: d.tabId, frameIds: [it.frameId] }, func: press, args: [it.i] }).then((r) => (r && r[0] && r[0].result) || { gone: true }),
      alive: (it) => api.scripting.executeScript({ target: { tabId: d.tabId, frameIds: [it.frameId] }, func: alive }).then((r) => !!(r && r[0] && r[0].result)),
      stop: () => d.stop || state.docs !== d,
      onStep: async (n, status) => {
        const it = items.find((x) => x.n === n);
        it.status = status;
        if (status && status.ok) { it.done = new Date().toISOString().slice(0, 10); it.on = false; await remembered.add(d.scope, [it.key]); }
        // Only the document's own line changes, so that the stop button stays where it is.
        const row = document.querySelector(`[data-doc="${n}"]`);
        if (row && state.docs === d && state.view === "docs") { row.querySelector(".status").textContent = docLine(it); row.classList.toggle("failed", !!(status && status.ok === false)); }
      },
    });
    for (const i of items) if (i.status === "waiting") i.status = null;
    d.running = false;
    await highlight(d);
    if (state.docs === d && state.view === "docs") render();
    const ok = items.filter((i) => i.status && i.status.ok).length;
    toast(t("docs_finished", String(ok), String(items.length)), ok < items.length);
  } catch (e) { d.running = false; render(); fail(e); }
}
/** The state of one found document: waiting, downloading, saved, failed, or downloaded before. */
function docLine(it) {
  const errors = { nothing: t("docs_err_nothing"), navigated: t("docs_err_navigated"), tab_open: t("docs_err_tab"), timeout: t("docs_err_timeout"), html: t("docs_err_html"), gone: t("docs_err_gone"), stopped: t("docs_err_stopped"), container: t("docs_err_container") };
  const st = it.status;
  return st === "waiting" ? t("docs_waiting") : st === "running" ? t("docs_running")
    : st && st.ok ? t("docs_saved", (st.file || "").split(/[\\/]/).pop() || "?")
    : st ? t("docs_failed", errors[st.error] || st.error) : it.done ? t("docs_done_before", fmtDate(it.done))
    : it.twice ? t("docs_twice") : it.sure === false && !it.on ? t("docs_unsure") : "";
}
function viewDocs() {
  const d = state.docs;
  const items = d.frames.flatMap((f) => f.items);
  const ticked = items.filter((i) => i.on).length;
  const box = h("div", {});
  if (d.job) box.append(h("button", { class: "btn", type: "button", disabled: d.running, onclick: () => go("job", { job: d.job }) }, t("back")));
  const card = h("div", { class: "card" }, h("h1", {}, d.job ? d.job.j.title : t("docs_title")),
    h("p", { class: "small" }, items.length ? t("docs_count", String(items.length)) : t("docs_none")),
    d.hidden ? h("p", { class: "small muted" }, t("docs_hidden", String(d.hidden))) : null,
    // Firefox lets an extension choose the folder only with the file name; see the README.
    h("p", { class: "small muted" }, api.runtime.getBrowserInfo ? t("docs_folder_firefox", d.folder) : t("docs_folder", d.folder)),
    h("div", { class: "row" },
      d.running
        ? h("button", { class: "btn bad", type: "button", onclick: () => { d.stop = true; toast(t("docs_stopping")); } }, t("docs_stop"))
        : h("button", { class: "btn primary", type: "button", disabled: !ticked, onclick: () => downloadDocuments() }, t("docs_download", String(ticked))),
      h("button", { class: "btn", type: "button", disabled: d.running, onclick: findDocuments }, t("docs_again")),
      h("button", { class: "btn", type: "button", disabled: d.running, onclick: clearDocuments }, t("docs_clear"))),
    items.length ? h("div", { class: "row", style: "margin-top:6px" },
      h("button", { class: "btn", type: "button", disabled: d.running, onclick: () => { for (const i of items) i.on = i.sure !== false && !i.twice; highlight(d); render(); } }, t("docs_tick_all")),
      h("button", { class: "btn", type: "button", disabled: d.running, onclick: () => { for (const i of items) i.on = false; highlight(d); render(); } }, t("docs_tick_none"))) : null);
  box.append(card);
  const kinds = { file: t("docs_kind_file"), link: t("docs_kind_link"), button: t("docs_kind_button") };
  const why = { attr: t("docs_why_attr"), name: t("docs_why_name"), type: t("docs_why_type"), address: t("docs_why_address"), words: t("docs_why_words") };
  for (const it of items) {
    const check = h("input", { type: "checkbox", checked: it.on, disabled: d.running, "aria-label": String(it.n) });
    check.addEventListener("change", () => { it.on = check.checked; highlight(d); render(); });
    const where = it.url ? (() => { try { const u = new URL(it.url); let path = u.pathname; try { path = decodeURIComponent(path); } catch { /* as it is */ } return u.host + path; } catch { return it.url; } })() : "";
    const st = it.status;
    box.append(h("div", { class: `card doc${st && st.ok === false ? " failed" : ""}`, "data-doc": String(it.n) }, h("div", { class: "row" }, check, h("span", { class: "badge" }, String(it.n)),
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); api.scripting.executeScript({ target: { tabId: d.tabId, frameIds: [it.frameId] }, func: show, args: [it.i] }).catch(() => {}); } }, it.label || "—"),
      h("button", { class: "btn small one", type: "button", disabled: d.running, title: t("docs_one"), onclick: () => downloadDocuments(it) }, `↓ ${t("docs_one")}`)),
      h("div", { class: "small muted" }, `${kinds[it.kind]} · ${why[it.reason]}${where ? ` · ${where}` : ""}`),
      h("div", { class: "small status" }, docLine(it))));
  }
  if (!d.running) box.append(watchOffer());
  if (items.some((i) => i.done) && !d.running) box.append(h("button", { class: "btn wide", type: "button", onclick: async () => { await remembered.forget(d.scope); for (const i of items) { i.done = null; i.on = i.sure !== false && !i.twice; } await highlight(d); render(); } }, t("docs_forget")));
  return box;
}

// Watching the user download one document, for a feedback on a portal (observer.js, report.js).
// Only the active tab and the tabs it opens, only after the user agreed, until the first
// download or two minutes; the text is shown blacked out, and only the user copies it.
const FEEDBACK_FORM = "https://github.com/schlingensiepen/portal-download-extension/issues/new?template=portal-feedback.yml";
const WATCH_FOR = 2 * 60000;
const watchOffer = () => h("button", { class: "btn wide small", type: "button", style: "margin-top:6px", onclick: () => {
  if (!/^https?:/i.test(state.tabUrl) || state.tabId == null) return toast(t("docs_no_page"), true);
  // Back where it was offered: an open job, the found documents (while not started), or the list.
  const back = state.view === "job" ? { view: "job", job: state.job } : state.view === "docs" && state.docs ? { view: "docs" } : { view: "list" };
  go("watch", { watch: { phase: "ask", tabId: state.tabId, url: state.tabUrl, back } });
} }, t("watch_offer"));
async function startWatching() {
  const w = state.watch;
  if (!w || w.phase !== "ask") return;
  // The tab and address at the click, not at the offer: the user may have switched tabs or gone on since.
  if (state.tabId != null && /^https?:/i.test(state.tabUrl)) { w.tabId = state.tabId; w.url = state.tabUrl; }
  const site = new URL(w.url);
  if (site.protocol === "http:" && !["localhost", "127.0.0.1"].includes(site.hostname)) return toast(t("docs_http"), true);
  // Set before the first await: a second click on Start does nothing.
  w.phase = "starting";
  try {
    // The first thing the click awaits: access to this portal, and to the browser's downloads (to see one start).
    const granted = await api.permissions.request({ origins: [originPattern(w.url)], permissions: ["downloads"] });
    // Left meanwhile (back, another tab's lock): nothing is registered.
    if (state.watch !== w) return;
    if (!granted) { w.phase = "ask"; return toast(t("watch_refused"), true); }
    if (state.docs) {
      const d = state.docs; d.stop = true; state.docs = null;
      // The found documents go now: back to their job, else to the list.
      if (w.back && w.back.view === "docs") w.back = d.job ? { view: "job", job: d.job } : { view: "list" };
      await unhighlight(d);
    }
    if (state.watch !== w) return;
    Object.assign(w, { phase: "watching", token: crypto.randomUUID(), origin: site.origin, clicks: [], events: [], tabs: new Set([w.tabId]), seen: new Map([[w.tabId, w.url.split("#")[0]]]), origins: new Set([site.origin]), docs: new Map(), pending: new Map(), download: null, ended: "", blind: false, lastClick: 0, again: null });
    // The observer in every frame of a tab; true when it runs in the tab's page itself.
    const inject = async (tabId) => {
      const run = (func, args = []) => api.scripting.executeScript({ target: { tabId, allFrames: true }, func, args }).catch(() => api.scripting.executeScript({ target: { tabId }, func, args }));
      try {
        await run(scan);
        if (w.phase !== "watching") return "";
        const r = await run(observe, [w.token]);
        // Ended meanwhile: the page stops noting again at once.
        if (w.phase !== "watching") { run(unobserve).catch(() => {}); return ""; }
        // The mark of the tab's own document, or "" when the page cannot be watched.
        const top = r && r.find((x) => x.frameId === 0 && typeof x.result === "string");
        if (top) w.docs.set(tabId, top.result);
        return top ? top.result : "";
      } catch { return ""; }
    };
    // "null" (about:blank, data:) is no site.
    const originOf = (u) => { try { const o = new URL(u).origin; return o === "null" ? "" : o; } catch { return ""; } };
    w.listeners = {
      message: (msg, sender, reply) => {
        if (!msg || msg.portalDownloadClick !== w.token || sender.id !== api.runtime.id || !sender.tab || !w.tabs.has(sender.tab.id) || state.watch !== w || w.phase !== "watching") return;
        w.clicks.push(msg.click);
        if (w.clicks.length > 20) w.clicks.shift();
        w.lastClick = Date.now();
        reply(true);
        const n = document.querySelector("[data-watch-count]");
        if (n) n.textContent = t("watch_count", String(w.clicks.length));
        // Frames that appear after a click (a viewer with its own button) are watched too.
        clearTimeout(w.again);
        const tabId = sender.tab.id;
        w.again = setTimeout(() => { if (w.phase === "watching") inject(tabId); }, 1500);
      },
      updated: (tabId, info, tab) => {
        // At "loading" with a new address too: the observer goes in once the document can take it,
        // without waiting for slow pictures; at "complete" once more.
        // Firefox tells an address changed by the page's script as a new address without a status.
        if (!w.tabs.has(tabId) || !(info.status === "complete" || info.url)) return;
        // A page loaded anew needs the observer again; only a new address is worth telling.
        const url = info.url || (tab && tab.url) || "", bare = url.split("#")[0];
        // The first page of a new tab is part of "a new tab opened"; afterwards a new address is a new page.
        // Whether a page loaded or the page's script only changed the address is decided once the
        // tab is complete (or at once for a change without a status): the same document as before
        // is no new page. Several changes may wait (pushState, then replaceState).
        if (url && w.seen.has(tabId) && w.seen.get(tabId) !== bare) {
          const e = { at: Date.now(), kind: "page", before: w.docs.get(tabId) || "" };
          w.events.push(e);
          w.pending.set(tabId, [...(w.pending.get(tabId) || []), e]);
        }
        w.seen.set(tabId, bare);
        // Downloads count from the sites of the portal's own tab only: Chrome names the active tab as
        // the opener of a tab the user opens themselves, so a new tab's site is no proof.
        if (tabId === w.tabId && originOf(url)) w.origins.add(originOf(url));
        // Only the latest injection tells whether the page can be watched.
        const n = tabId === w.tabId ? (w.injections = (w.injections || 0) + 1) : 0;
        inject(tabId).then((doc) => {
          const waiting = w.pending.get(tabId);
          if (doc && waiting && (info.status === "complete" || !info.status)) {
            for (const e of waiting) if (doc === e.before) e.kind = "address";
            w.pending.delete(tabId);
          }
          const ok = !!doc;
          if (tabId === w.tabId && n === w.injections && w.blind !== !ok) { w.blind = !ok; if (state.view === "watch" && w.phase === "watching") render(); }
        });
      },
      created: (tab) => {
        // Only a tab the portal opened right after a click of the user. The click's message may
        // arrive after the new tab, so it is decided a moment later.
        if (!w.tabs.has(tab.openerTabId)) return;
        const at = Date.now();
        setTimeout(() => {
          if (w.phase !== "watching" || Math.abs(at - w.lastClick) > 5000) return;
          w.tabs.add(tab.id);
          w.events.push({ at: Math.max(at, w.lastClick), kind: "tab" });
          inject(tab.id);
        }, 400);
      },
      removed: (tabId) => { if (tabId === w.tabId) endWatching(w, "gone"); },
      download: (d) => {
        // The first download whose address or referrer is on a site of the portal's tab; none started
        // by an extension (this one or another).
        if (w.download || d.byExtensionId) return;
        const ours = [d.referrer, d.url, d.finalUrl].some((u) => u && w.origins.has(originOf(u)));
        // A data: address names no site; one right after a click counts.
        const originless = !d.referrer && /^data:/i.test(d.url || "") && Date.now() - w.lastClick < 10000;
        if (!ours && !originless) return;
        // Only kind and size go into the text; the name serves for the kind when the type says nothing.
        const got = { mime: d.mime, filename: d.filename, bytes: d.totalBytes, id: d.id };
        w.download = got;
        // Watching ends here: no later click goes into the text.
        endWatching(w, "download");
        // Type, name and size are known a moment later; the size only once the file is complete (up to 10 seconds).
        setTimeout(async () => {
          for (let k = 0; k < 20; k++) {
            try {
              const [x] = await api.downloads.search({ id: got.id });
              if (x) Object.assign(got, { mime: x.mime || got.mime, filename: x.filename || got.filename, bytes: x.fileSize > 0 ? x.fileSize : x.totalBytes > 0 ? x.totalBytes : got.bytes });
              if (!x || x.state !== "in_progress") break;
            } catch { break; }
            await new Promise((r) => setTimeout(r, 500));
          }
          // The text is made anew with the file's kind and size, unless the user already changed it.
          if (w.text === undefined && state.watch === w && state.view === "watch") render();
        }, 1500);
      },
    };
    api.runtime.onMessage.addListener(w.listeners.message);
    api.tabs.onUpdated.addListener(w.listeners.updated);
    api.tabs.onCreated.addListener(w.listeners.created);
    api.tabs.onRemoved.addListener(w.listeners.removed);
    api.downloads.onCreated.addListener(w.listeners.download);
    w.timer = setTimeout(() => endWatching(w, "timeout"), WATCH_FOR);
    // Counted like every later injection: a late answer does not cover a newer one.
    const n = w.injections = (w.injections || 0) + 1;
    const doc = await inject(w.tabId);
    if (n === w.injections) w.blind = !doc;
    if (state.view === "watch" && state.watch === w) render();
  } catch (e) { if (w.phase === "starting") w.phase = "ask"; endWatching(w, "stopped"); fail(e); }
}
/** Ends a watch: listeners off, the page stops noting, the text is shown. */
function endWatching(w, why) {
  if (!w || w.phase !== "watching") return;
  w.phase = "done"; w.ended = why;
  clearTimeout(w.timer); clearTimeout(w.again);
  const L = w.listeners || {};
  try {
    api.runtime.onMessage.removeListener(L.message);
    api.tabs.onUpdated.removeListener(L.updated);
    api.tabs.onCreated.removeListener(L.created);
    api.tabs.onRemoved.removeListener(L.removed);
    api.downloads?.onCreated.removeListener(L.download);
  } catch { /* already gone */ }
  for (const tabId of w.tabs) api.scripting.executeScript({ target: { tabId, allFrames: true }, func: unobserve }).catch(() => api.scripting.executeScript({ target: { tabId }, func: unobserve })).catch(() => {});
  if (state.view === "watch" && state.watch === w) render();
}
/** The browser's name and main version, for the report. */
function browserName() {
  const ua = navigator.userAgent;
  const m = /Firefox\/(\d+)/.exec(ua) || /Edg\/(\d+)/.exec(ua) || /Chrom(?:e|ium)\/(\d+)/.exec(ua);
  const name = /Firefox\//.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : "Chrome";
  return m ? `${name} ${m[1]}` : name;
}
function viewWatch() {
  const w = state.watch;
  const box = h("div", {});
  const back = () => { const b = w.back || { view: "list" }; go(b.view, b.job ? { job: b.job } : {}); };
  if (w.phase === "ask" || w.phase === "starting") {
    box.append(h("div", { class: "card" }, h("h1", {}, t("watch_title")),
      h("p", { class: "small" }, t("watch_intro")),
      h("ul", { class: "small" }, h("li", {}, t("watch_what_tab")), h("li", {}, t("watch_what_click")), h("li", {}, t("watch_what_private"))),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", disabled: w.phase === "starting", onclick: startWatching }, t("watch_start")),
        h("button", { class: "btn", type: "button", onclick: back }, t("cancel")))));
    return box;
  }
  if (w.phase === "watching") {
    box.append(h("div", { class: "card" }, h("h1", {}, t("watch_title")),
      h("p", {}, t("watch_now")),
      h("p", { class: "small muted", "data-watch-count": "" }, t("watch_count", String(w.clicks.length))),
      w.blind ? h("p", { class: "small err" }, t("watch_blind")) : null,
      h("button", { class: "btn bad", type: "button", onclick: () => endWatching(w, "stopped") }, t("watch_stop"))));
    return box;
  }
  let host = "";
  try { host = new URL(w.url).host; } catch { /* none */ }
  if (w.named === undefined) w.named = true;
  const make = () => buildReport(w, { version: api.runtime.getManifest().version, browser: browserName(), namePortal: w.named });
  const text = h("textarea", { rows: "16", style: "width:100%;font:12px ui-monospace,monospace", "aria-label": t("watch_title") });
  // What the user changed in the text stays when the panel draws anew.
  text.value = w.text ?? make();
  text.addEventListener("input", () => { w.text = text.value; });
  const name = h("input", { type: "checkbox", checked: w.named });
  name.addEventListener("change", () => { w.named = name.checked; text.value = make(); w.text = undefined; });
  const copyBtn = h("button", { class: "btn primary", type: "button", onclick: () => copy(text.value, copyBtn) }, t("watch_copy"));
  const ended = { download: t("watch_end_download"), timeout: t("watch_end_timeout"), stopped: t("watch_end_stopped"), gone: t("watch_end_gone") };
  box.append(h("div", { class: "card" }, h("h1", {}, t("watch_title")),
    h("p", { class: "small" }, ended[w.ended] || ""),
    h("p", { class: "small" }, t("watch_check")),
    host ? h("label", { class: "small row" }, name, t("watch_name_portal", host)) : null,
    text,
    h("div", { class: "row", style: "margin-top:6px" }, copyBtn,
      h("button", { class: "btn", type: "button", onclick: () => api.tabs.create({ url: FEEDBACK_FORM }) }, t("watch_form")),
      h("button", { class: "btn", type: "button", onclick: back }, t("back")))));
  return box;
}

/** Revokes a device access just redeemed but not kept, best effort. */
function dropDevice(base, token) {
  const b = new ServiceBackend({ id: "drop", name: base, base, token });
  b.call("device.list").then((d) => b.call("device.revoke", { device_id: d.current_device_id })).catch(() => {});
}

async function viewManage() {
  const b = current();
  const box = h("div", {});
  box.append(h("button", { class: "btn", type: "button", onclick: () => go("list") }, t("back")), h("h1", {}, b.name));
  if (b instanceof ServiceBackend) {
    box.append(h("div", { class: "card" }, h("p", { class: "small" }, t("webapp_text")),
      h("button", { class: "btn", type: "button", onclick: () => api.tabs.create({ url: b.service.base }) }, t("webapp_open"))));
  }
  box.append(exchangeCard(b));
  if (state.preview && state.preview.backend === b.id) box.append(previewCard(b));
  if (b instanceof ServiceBackend) {
    box.append(h("div", { class: "card" }, h("p", { class: "small" }, t("remove_service_text")),
      confirmButton(t("remove_service"), t("really"), "bad", async () => {
        try { const d = await b.call("device.list"); await b.call("device.revoke", { device_id: d.current_device_id }); } catch (e) { if (!["device_revoked", "credential_unknown", "user_deactivated"].includes(e.kind)) { console.error(e); toast(t("revoke_failed"), true); } }
        const content = await vault.update((c) => { c.services = c.services.filter((s) => s.id !== b.id); return c; });
        const pattern = originPattern(b.service.base);
        if (!content.services.some((s) => originPattern(s.base) === pattern)) api.permissions.remove({ origins: [pattern] }).catch(() => {});
        await loadBackends(); state.choice = "all"; go("list");
      })));
  } else {
    const p1 = h("input", { type: "password", autocomplete: "new-password" }), p2 = h("input", { type: "password", autocomplete: "new-password" });
    const change = h("form", { class: "card" }, h("p", { class: "small muted" }, t("export_reminder")), h("label", {}, t("passphrase_new")), p1, h("label", {}, t("passphrase_again")), p2, h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn", type: "submit" }, t("passphrase_change")),
      h("button", { class: "btn", type: "button", onclick: async () => { try { await vault.lock(); await loadBackends(); go("list"); } catch (e) { fail(e); } } }, t("lock"))));
    change.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (p1.value.length < 10) return toast(t("passphrase_short"), true);
      if (p1.value !== p2.value) return toast(t("passphrase_differs"), true);
      try { await vault.changePassphrase(p1.value); p1.value = ""; p2.value = ""; toast(t("passphrase_changed")); } catch (err) { fail(err); }
    });
    box.append(change, h("div", { class: "card" }, h("p", { class: "small" }, t("local_remove_text")),
      confirmButton(t("local_remove"), t("really"), "bad", async () => { await vault.removeLocal(); await loadBackends(); state.choice = "all"; go("list"); })));
  }
  return box;
}

function exchangeCard(b) {
  const pw = h("input", { type: "text", autocomplete: "off", spellcheck: "false" });
  const file = h("input", { type: "file", accept: ".zip,application/zip" });
  const pwIn = h("input", { type: "text", autocomplete: "off", spellcheck: "false" });
  const header = (p) => (p ? { "X-Backup-Password": p } : {});
  const exportIt = async () => {
    try {
      checkPassword(pw.value || null);
      const r = await b.call("job.export", {}, header(pw.value));
      if (r.encrypted !== !!pw.value) return toast(t("not_encrypted"), true);
      saveFile(fromBase64(r.zip_base64), r.file_name);
    } catch (e) { fail(e); }
  };
  const preview = async () => {
    const f = file.files[0];
    if (!f) return toast(t("choose_file"), true);
    if (f.size > 48 * 1024 * 1024) return toast(t("file_too_large"), true);
    try {
      checkPassword(pwIn.value || null);
      const bytes = new Uint8Array(await f.arrayBuffer());
      let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const zip = btoa(s);
      const result = await b.call("job.importPreview", { zip_base64: zip }, header(pwIn.value));
      state.preview = { backend: b.id, zip, pw: pwIn.value, result, choices: {} };
      render();
    } catch (e) { fail(e); }
  };
  return h("div", { class: "card" }, h("h2", {}, t("exchange_title")), h("p", { class: "small" }, t("exchange_text")),
    h("label", {}, t("file_password")), pw,
    h("div", { class: "row", style: "margin-top:6px" },
      h("button", { class: "btn", type: "button", onclick: () => (pw.value ? exportIt() : toast(t("password_needed"), true)) }, t("export_encrypted")),
      confirmButton(t("export_plain"), t("export_plain_really"), "", () => { pw.value = ""; return exportIt(); })),
    h("h2", {}, t("import_title")), file, h("label", {}, t("file_password_in")), pwIn,
    h("div", { style: "margin-top:6px" }, h("button", { class: "btn primary", type: "button", onclick: preview }, t("import_preview"))));
}

function previewCard(b) {
  const P = state.preview, R = P.result;
  const box = h("div", { class: "card" }, h("h2", {}, t("preview_title")));
  const line = (x, extra) => h("div", { class: "small" }, h("strong", {}, x.title), " ", h("span", { class: "muted" }, extra || ""));
  if (R.people_left_out || R.people) box.append(h("p", { class: "small" }, t("people_left_out")));
  box.append(h("h2", {}, t("preview_new", R.new.length)), ...R.new.map((x) => line(x, x.new_runs === 1 ? t("runs_one") : x.new_runs ? t("runs_more", x.new_runs) : "")));
  box.append(h("h2", {}, t("preview_same", R.same.length)), ...R.same.map((x) => line(x, x.new_runs === 1 ? t("runs_one") : x.new_runs ? t("runs_more", x.new_runs) : "")));
  box.append(h("h2", {}, t("preview_decide", R.decide.length)));
  for (const x of R.decide) {
    const fields = Object.fromEntries((x.fields || []).map((f) => [f.field, f.preselect]));
    const choice = P.choices[x.guid] || (P.choices[x.guid] = x.actions ? (x.fields ? { action: x.preselect, fields } : { action: x.preselect }) : { fields });
    const caseText = x.case === "deleted_here" ? t("case_deleted", fmtDateTime(x.deleted_at)) : x.case === "replaces" ? t("case_replaces", x.replaces_title, x.local_entry_url) : x.case === "old_address" ? t("case_old_address", x.local_entry_url) : t("case_known");
    const card = h("div", { class: "card" }, h("strong", {}, x.title), h("div", { class: "small" }, caseText));
    if (x.fields && x.fields.length) {
      const rows = x.fields.map((f) => {
        const radio = (side) => { const r = h("input", { type: "radio", name: `${x.guid}:${f.field}` }); r.checked = choice.fields[f.field] === side; r.addEventListener("change", () => { if (r.checked) choice.fields[f.field] = side; }); return r; };
        const show = (v) => (f.field === "next_due" ? fmtDate(v) : f.field === "password" && v !== "•••" ? "••••••••" : String(v));
        return h("tr", {}, h("td", {}, t(f.field)), h("td", {}, h("label", {}, radio("local"), " ", show(f.local))), h("td", {}, h("label", {}, radio("incoming"), " ", show(f.incoming))));
      });
      card.append(h("table", {}, h("tr", {}, h("th", {}), h("th", {}, t("here")), h("th", {}, t("in_file"))), ...rows));
    }
    if (x.actions) {
      const sel = h("select", {}, ...x.actions.map((a) => h("option", { value: a }, t(`action_${a}`))));
      sel.value = choice.action;
      sel.addEventListener("change", () => { choice.action = sel.value; });
      card.append(sel);
    }
    box.append(card);
  }
  if (R.decide.length) box.append(h("p", { class: "small muted" }, t("preselected_hint")));
  box.append(h("div", { class: "row", style: "margin-top:8px" },
    h("button", { class: "btn primary", type: "button", disabled: !!state.mismatch[b.id], onclick: async () => {
      try {
        const r = await b.call("job.import", { zip_base64: P.zip, decisions: P.choices }, P.pw ? { "X-Backup-Password": P.pw } : {});
        state.preview = null;
        toast(t("imported", r.added, r.updated, r.reactivated, r.replaced, r.skipped, r.runs_added));
        go("list");
      } catch (e) { fail(e); }
    } }, t("import_apply")),
    h("button", { class: "btn", type: "button", onclick: () => { state.preview = null; render(); } }, t("cancel"))));
  return box;
}

// ------------------------------------------------------------------ start
$("#choose").addEventListener("change", (e) => { state.choice = e.target.value; state.preview = null; go("list"); });
$("#add").addEventListener("click", () => go("add"));
$("#manage").addEventListener("click", () => go("manage"));
document.documentElement.lang = locale;
// The language, chosen at the foot; "auto" follows the browser. A change draws the panel anew.
{
  const sel = $("#language");
  sel.setAttribute("aria-label", t("language"));
  sel.append(new Option(t("language_auto"), "auto"), ...Object.entries(LANGUAGES).map(([code, name]) => new Option(name, code)));
  sel.value = chosenLanguage;
  sel.addEventListener("change", async () => {
    // Reloading draws the panel anew; what is typed or previewed would be lost.
    if (typed() && !confirm(t("language_discard"))) { sel.value = chosenLanguage; return; }
    await api.storage.local.set({ language: sel.value });
    location.reload();
  });
}
$("#choose").setAttribute("aria-label", t("backend"));
// The links at the foot open in a tab of their own.
for (const [sel, label] of [["#project", t("project_page")], ["#feedback", t("feedback")]]) {
  const a = $(sel); a.textContent = label;
  a.addEventListener("click", (e) => { e.preventDefault(); api.tabs.create({ url: a.href }); });
}
$("#version").textContent = `v${api.runtime.getManifest().version}`;
// Closing the panel takes the highlighting off the page and ends a queue.
addEventListener("pagehide", () => { const d = state.docs; if (d) { d.stop = true; unhighlight(d); } if (state.watch) endWatching(state.watch, "stopped"); });
// Another panel of this browser may unlock, lock or add a service.
api.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.language && (changes.language.newValue ?? "auto") !== chosenLanguage && !typed()) return location.reload(); if (area === "local" || area === "session") { try { await loadBackends(); } catch { return; } if (state.view === "list" || state.view === "add" || state.vaultState === "locked") render(); else renderTop(); } });
loadBackends().then(render, fail);
