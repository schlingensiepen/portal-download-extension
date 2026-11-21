// The side panel: one list of the due jobs of every backend, a job with its login and
// instructions, closing a run, adding a service from an invitation in the current tab, the
// local store with its passphrase, and the exchange of jobs as a file.

import { Vault } from "./vault.js";
import { ServiceBackend, localBackend, parseInvitation, CONTRACT } from "./backends.js";
import { checkPassword, fromBase64 } from "./local.js";

const api = globalThis.browser ?? globalThis.chrome;
const vault = new Vault();
const $ = (s) => document.querySelector(s);
const t = (key, ...subs) => api.i18n.getMessage(key, subs.map(String)) || key;

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
  if (e.kind === "unreadable") return t("err_unreadable");
  if (e.kind === "locked") return t("err_locked");
  return e.message || String(e);
}
const fail = (e) => { console.error(e); toast(explain(e), true); };
const fmtDate = (iso) => (iso ? new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) : "–");
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "–");
function urgency(days) {
  if (days < 0) return h("span", { class: "chip bad" }, t("overdue", -days));
  if (days === 0) return h("span", { class: "chip warn" }, t("due_today"));
  if (days === 1) return h("span", { class: "chip warn" }, t("due_tomorrow"));
  return h("span", { class: "chip" }, t("due_in", days));
}
async function copy(text, btn) {
  await navigator.clipboard.writeText(text);
  const old = btn.textContent; btn.textContent = t("copied"); setTimeout(() => (btn.textContent = old), 1500);
}
/** A button that asks once more in place before it acts. */
function confirmButton(label, question, cls, action) {
  const b = h("button", { class: `btn ${cls}`, type: "button" }, label);
  let armed = false;
  b.addEventListener("click", async () => {
    if (!armed) { armed = true; b.textContent = question; setTimeout(() => { armed = false; b.textContent = label; }, 4000); return; }
    armed = false; b.disabled = true;
    try { await action(); } finally { b.disabled = false; b.textContent = label; }
  });
  return b;
}
function saveFile(bytes, name) {
  const a = h("a", { href: URL.createObjectURL(new Blob([bytes], { type: "application/zip" })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
async function activeTab() { const [tab] = await api.tabs.query({ active: true, currentWindow: true }); return tab; }

// ------------------------------------------------------------------ state
const state = { choice: "all", view: "list", job: null, done: null, backends: [], content: null, vaultState: "plain", problems: {}, preview: null };
const current = () => state.backends.find((b) => b.id === state.choice) || null;

async function loadBackends() {
  state.vaultState = await vault.state();
  state.backends = [];
  if (state.vaultState === "locked") return;
  state.content = await vault.read();
  for (const s of state.content.services) state.backends.push(new ServiceBackend(s));
  if (state.content.local) { const b = localBackend(vault); b.name = t("local_name"); state.backends.push(b); }
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

async function render() {
  renderTop();
  const view = $("#view");
  try {
    if (state.vaultState === "locked") return view.replaceChildren(viewUnlock());
    const v = state.view;
    const content = v === "job" ? viewJob() : v === "add" ? viewAdd() : v === "manage" ? await viewManage() : v === "new" ? await viewNew() : await viewList();
    view.replaceChildren(content);
  } catch (e) { fail(e); }
}
const go = (view, extra = {}) => { Object.assign(state, { view }, extra); render(); };

// ------------------------------------------------------------------ views
function viewUnlock() {
  const pw = h("input", { type: "password", autocomplete: "current-password" });
  const form = h("form", { class: "card" }, h("h1", {}, t("unlock_title")), h("p", { class: "small" }, t("unlock_text")), h("label", {}, t("passphrase")), pw,
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn primary", type: "submit" }, t("unlock"))));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await vault.unlock(pw.value)) { await loadBackends(); go("list"); } else toast(t("passphrase_wrong"), true);
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
    return box;
  }
  if (state.choice !== "all") box.append(h("div", { class: "row", style: "margin-bottom:8px" }, h("button", { class: "btn", type: "button", onclick: () => go("new", { fromTab: true }) }, t("add_page"))));
  const all = [];
  await Promise.all(chosen.map(async (b) => {
    try {
      if (b instanceof ServiceBackend && !state.problems[b.id + ":checked"]) {
        const st = await b.call("service.status");
        state.problems[b.id + ":checked"] = true;
        if (st.contract !== CONTRACT) state.problems[b.id] = t("contract_mismatch", b.name, st.contract || "?", CONTRACT);
        else if (!st.signed_in) state.problems[b.id] = t("signed_out", b.name);
      }
      const r = await b.call("job.list");
      for (const j of r.jobs) all.push({ b, j });
    } catch (e) { state.problems[b.id] = `${b.name}: ${explain(e)}`; }
  }));
  for (const b of chosen) if (state.problems[b.id]) box.append(h("div", { class: "card alert small" }, state.problems[b.id]));
  all.sort((x, y) => (x.j.next_due < y.j.next_due ? -1 : x.j.next_due > y.j.next_due ? 1 : x.j.title.localeCompare(y.j.title)));
  if (!all.length) box.append(h("p", { class: "muted" }, t("no_jobs")));
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
  box.append(h("h1", {}, j.title), h("div", { class: "muted small" }, `${b.name} · ${t("schedule", fmtDate(j.next_due), j.interval_weeks)}`));
  if (state.done) {
    box.append(h("div", { class: "card done" }, h("strong", {}, t("done", fmtDate(state.done))),
      h("div", { style: "margin-top:6px" }, h("button", { class: "btn primary", type: "button", onclick: () => go("list", { done: null }) }, t("next_job")))));
  }
  if (j.last_run) box.append(h("p", { class: "small muted" }, t("last_run", t(j.last_run.outcome), fmtDateTime(j.last_run.finished_at), j.last_run.by), j.last_run.note ? h("div", { class: "pre" }, j.last_run.note) : null));
  box.append(h("button", { class: "btn primary wide", type: "button", onclick: () => api.tabs.create({ url: j.entry_url }) }, t("open_portal")));
  const login = h("div", { class: "card" });
  for (const [k, v] of [["username", j.username], ["password", j.password]]) {
    if (!v) continue;
    const shown = k === "username";
    const value = h("span", { class: "value grow" }, shown ? v : "••••••••");
    const toggle = shown ? null : h("button", { class: "btn", type: "button", onclick: () => { value.textContent = value.textContent === v ? "••••••••" : v; } }, t("show"));
    login.append(h("label", {}, t(k)), h("div", { class: "row" }, value, toggle, h("button", { class: "btn", type: "button", onclick: (e) => copy(v, e.currentTarget) }, t("copy"))));
  }
  if (!j.username && !j.password && j.username !== undefined) login.append(h("p", { class: "small muted" }, t("no_login")));
  if (j.username === undefined) login.append(h("p", { class: "small muted" }, t("login_hidden")));
  box.append(login);
  if (j.instructions_md) box.append(h("div", { class: "card pre small" }, j.instructions_md));
  if (!state.done) {
    const note = h("textarea", { placeholder: t("note_placeholder") });
    const finish = async (outcome) => {
      try {
        const r = await b.call("job.complete", { job_id: j.job_id, outcome, note: note.value, expected_next_due: j.next_due });
        const fresh = await b.call("job.get", { job_id: j.job_id });
        go("job", { job: { b, j: fresh }, done: r.next_due });
      } catch (e) { fail(e); }
    };
    box.append(h("label", {}, t("note")), note, h("div", { class: "row", style: "margin-top:8px" },
      confirmButton(t("succeeded"), t("really"), "ok grow", () => finish("succeeded")),
      confirmButton(t("failed"), t("really"), "bad grow", () => finish("failed"))));
  }
  return box;
}

async function viewNew() {
  const b = current();
  const f = { title: h("input", { type: "text", required: true, maxlength: "200" }), url: h("input", { type: "url", required: true }), weeks: h("input", { type: "number", min: "1", max: "520", value: "4" }),
    user: h("input", { type: "text", autocomplete: "off", spellcheck: "false" }), pass: h("input", { type: "text", autocomplete: "off", spellcheck: "false" }) };
  if (state.fromTab) { const tab = await activeTab(); if (tab && /^https?:/.test(tab.url || "")) { f.url.value = tab.url; f.title.value = tab.title || new URL(tab.url).host; } }
  const form = h("form", { class: "card" }, h("h1", {}, t("new_job")), h("label", {}, t("title")), f.title, h("label", {}, t("entry_url")), f.url, h("label", {}, t("every_weeks")), f.weeks,
    h("label", {}, t("username")), f.user, h("label", {}, t("password")), f.pass, h("p", { class: "small muted" }, t("login_plain")),
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit" }, t("create")), h("button", { class: "btn", type: "button", onclick: () => go("list") }, t("cancel"))));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await b.call("job.create", { title: f.title.value, entry_url: f.url.value.trim(), interval_weeks: Number(f.weeks.value), username: f.user.value, password: f.pass.value });
      toast(t("created")); go("list");
    } catch (err) { fail(err); }
  });
  return form;
}

function viewAdd() {
  const box = h("div", {});
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
  try {
    const tab = await activeTab();
    const inv = tab && parseInvitation(tab.url || "");
    if (!inv) return toast(t("no_invitation"), true);
    // Asked in the click itself, as the browsers require: access to this one service only.
    if (!(await api.permissions.request({ origins: [`${inv.origin}/*`] }))) return toast(t("permission_refused"), true);
    const probe = new ServiceBackend({ id: "probe", name: inv.origin, base: inv.base, token: "" });
    const st = await probe.call("service.status");
    if (st.contract !== CONTRACT) return toast(t("contract_mismatch", inv.origin, st.contract || "?", CONTRACT), true);
    const label = `${/Firefox\//.test(navigator.userAgent) ? "Firefox" : /Edg\//.test(navigator.userAgent) ? "Edge" : "Chrome"} extension`;
    const r = await probe.call("invitation.redeem", { token: inv.token, label, kind: "extension" });
    const content = await vault.read();
    const id = `s${Date.now().toString(36)}`;
    content.services.push({ id, name: `${new URL(inv.base).host} (${r.name})`, base: inv.base, token: r.device_token });
    await vault.write(content);
    await loadBackends();
    state.choice = id;
    toast(t("service_added", r.name));
    go("list");
  } catch (e) { fail(e); }
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
        try { const d = await b.call("device.list"); await b.call("device.revoke", { device_id: d.current_device_id }); } catch (e) { console.error(e); }
        const content = await vault.read();
        content.services = content.services.filter((s) => s.id !== b.id);
        await vault.write(content);
        await loadBackends(); state.choice = "all"; go("list");
      })));
  } else {
    const p1 = h("input", { type: "password", autocomplete: "new-password" });
    const change = h("form", { class: "card" }, h("label", {}, t("passphrase_new")), p1, h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn", type: "submit" }, t("passphrase_change")),
      h("button", { class: "btn", type: "button", onclick: async () => { await vault.lock(); await loadBackends(); go("list"); } }, t("lock"))));
    change.addEventListener("submit", async (e) => { e.preventDefault(); if (p1.value.length < 10) return toast(t("passphrase_short"), true); await vault.changePassphrase(p1.value); toast(t("saved")); });
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
    try {
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
  box.append(h("h2", {}, t("preview_new", R.new.length)), ...R.new.map((x) => line(x, x.new_runs ? t("runs_more", x.new_runs) : "")));
  box.append(h("h2", {}, t("preview_same", R.same.length)), ...R.same.map((x) => line(x, x.new_runs ? t("runs_more", x.new_runs) : "")));
  box.append(h("h2", {}, t("preview_decide", R.decide.length)));
  for (const x of R.decide) {
    const fields = Object.fromEntries((x.fields || []).map((f) => [f.field, f.preselect]));
    const choice = P.choices[x.guid] || (P.choices[x.guid] = x.actions ? (x.fields ? { action: x.preselect, fields } : { action: x.preselect }) : { fields });
    const caseText = x.case === "deleted_here" ? t("case_deleted", fmtDateTime(x.deleted_at)) : x.case === "replaces" ? t("case_replaces", x.replaces_title, x.local_entry_url) : x.case === "old_address" ? t("case_old_address", x.local_entry_url) : t("case_known");
    const card = h("div", { class: "card" }, h("strong", {}, x.title), h("div", { class: "small" }, caseText));
    if (x.fields && x.fields.length) {
      const rows = x.fields.map((f) => {
        const radio = (side) => { const r = h("input", { type: "radio", name: `${x.guid}:${f.field}` }); r.checked = choice.fields[f.field] === side; r.addEventListener("change", () => { if (r.checked) choice.fields[f.field] = side; }); return r; };
        const show = (v) => (f.field === "next_due" ? fmtDate(v) : String(v));
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
  box.append(h("div", { class: "row", style: "margin-top:8px" },
    h("button", { class: "btn primary", type: "button", onclick: async () => {
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
document.documentElement.lang = api.i18n.getUILanguage();
// Another panel of this browser may unlock, lock or add a service.
api.storage.onChanged.addListener(async (_, area) => { if (area === "local" || area === "session") { await loadBackends(); if (state.view === "list") render(); else renderTop(); } });
loadBackends().then(render, fail);
