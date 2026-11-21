// The local backend: the job methods of the service, kept in this browser. It behaves as the
// service does for every scenario of the shared contract tests: the same fields, the same
// errors, the same file format and the same merge of a file into the jobs.
//
// The data lives in one object { next_id, jobs, runs, deleted }; `load` and `save` hand it to
// and from wherever it is kept (the encrypted store of the extension, or memory in tests).

import { zipText, unzipText, ZipError } from "./zipaes.js";

export const FORMAT = "portal-download";
export const VERSION = 3;
const ENTRY = "portal-download.jsonl";
const FIELDS = ["title", "interval_weeks", "retry_days", "next_due", "username", "password", "instructions_md"];

export class OpError extends Error {
  constructor(code, kind, message) { super(message); this.code = code; this.kind = kind; }
}
const bad = (kind, message) => new OpError(400, kind, message);

export function emptyData() { return { next_id: 1, jobs: {}, runs: [], deleted: {} }; }

const pad = (n, w = 2) => String(n).padStart(w, "0");
export function nowIso() { const d = new Date(); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`; }
export function todayIso(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(iso, days) { const [y, m, d] = iso.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + days)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
function daysBetween(a, b) { const p = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 86400000); }

export function newGuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ------------------------------------------------------------------ checks, as the service makes them
const chars = (s) => [...s].length;
function text(field, s, min, max) {
  const t = String(s).trim();
  if (chars(t) < min || chars(t) > max) throw bad("field_length", `\`${field}\` must have between ${min} and ${max} characters; it has ${chars(t)}. Shorten or fill it and send again.`);
  return t;
}
function parseDate(field, s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const bad_ = () => bad("date_invalid", `\`${field}\` = "${s}" is not a date. Write it as YYYY-MM-DD, for example "2026-12-01".`);
  if (!m) throw bad_();
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (y < 2000 || y > 2200 || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) throw bad_();
  return s;
}
function checkLogin(field, s) {
  if (chars(s) > 1000) throw bad("field_length", `\`${field}\` may have at most 1000 characters; it has ${chars(s)}. Shorten it and send again.`);
  // Control characters as Rust's char::is_control: C0, DEL and C1.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(s)) throw bad("login_invalid", `\`${field}\` contains a line break or another control character. Enter the login in one line and send again.`);
}
function checkUrl(u) {
  const t = String(u).trim();
  if (!(t.startsWith("https://") || t.startsWith("http://")) || t.length > 2000 || /\s/.test(t)) {
    throw bad("entry_url_invalid", "`entry_url` must be a web address starting with https:// (or http://), without spaces. Copy it from the browser's address bar.");
  }
  return t;
}
const KNOWN = ["title", "entry_url", "interval_weeks", "retry_days", "next_due", "username", "password", "instructions_md"];
function validateJob(input, creating) {
  for (const k of Object.keys(input)) if (!KNOWN.includes(k)) throw bad("params_invalid", `The params do not fit this method: unknown field \`${k}\`.`);
  const need = (k) => { if (creating && input[k] === undefined) throw bad("field_missing", `\`${k}\` is required to create a job. Add it and send again.`); };
  need("title"); need("entry_url"); need("interval_weeks");
  if (input.title !== undefined) text("title", input.title, 1, 200);
  if (input.entry_url !== undefined) checkUrl(input.entry_url);
  const int = (v) => Number.isInteger(v);
  if (input.interval_weeks !== undefined && !(int(input.interval_weeks) && input.interval_weeks >= 1 && input.interval_weeks <= 520)) throw bad("interval_invalid", "`interval_weeks` must lie between 1 and 520.");
  if (input.retry_days !== undefined && !(int(input.retry_days) && input.retry_days >= 1 && input.retry_days <= 365)) throw bad("retry_invalid", "`retry_days` must lie between 1 and 365.");
  if (input.next_due !== undefined) parseDate("next_due", input.next_due);
  if (input.username !== undefined) checkLogin("username", input.username);
  if (input.password !== undefined) checkLogin("password", input.password);
  if (input.instructions_md !== undefined && new TextEncoder().encode(input.instructions_md).length > 65536) throw bad("instructions_too_long", "`instructions_md` may hold at most 64 KiB of text. Shorten it.");
}
const nocase = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase()); // SQLite's NOCASE folds ASCII only
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ------------------------------------------------------------------ the backend
export class LocalBackend {
  /** load() returns the data object, save(data) keeps it; byName names who closes runs. */
  constructor({ load, save, byName = "Extension" }) { this.load = load; this.save = save; this.byName = byName; }

  async call(method, params = {}, headers = {}) {
    const fn = METHODS[method];
    if (!fn) throw new OpError(404, "method_unknown", `The local store does not offer ${method}.`);
    const data = await this.load();
    const password = headers["X-Backup-Password"] || null;
    const out = await fn.call(this, data, params || {}, password);
    if (out && out.__changed) { await this.save(data); delete out.__changed; }
    return out;
  }
}

function stored(data, jobId) {
  const j = data.jobs[jobId];
  if (!j) throw new OpError(404, "job_unknown", `There is no job ${jobId}. Call job.list for the valid identifiers.`);
  return j;
}
function lastRun(data, id) {
  const runs = data.runs.map((r, i) => [r, i]).filter(([r]) => r.job_id === id).sort((a, b) => cmp(b[0].finished_at, a[0].finished_at) || b[1] - a[1]);
  if (!runs.length) return null;
  const r = runs[0][0];
  return { outcome: r.outcome, finished_at: r.finished_at, note: r.note, by: r.by_name };
}
function view(data, j, today) {
  return {
    job_id: j.id, guid: j.guid, replaces: j.replaces, title: j.title, entry_url: j.entry_url,
    interval_weeks: j.interval_weeks, retry_days: j.retry_days, next_due: j.next_due, urgency_days: daysBetween(today, j.next_due),
    username: j.username, password: j.password, instructions_md: j.instructions_md, last_run: lastRun(data, j.id),
  };
}
const changed = (o) => Object.assign(o, { __changed: true });

const METHODS = {
  "service.status"() {
    return { name: "portal-download", version: "local", contract: "0.8", setup_required: false, signed_in: true, me: { kind: "local" } };
  },
  "job.list"(data) {
    const today = todayIso();
    const jobs = Object.values(data.jobs).sort((a, b) => cmp(a.next_due, b.next_due) || cmp(nocase(a.title), nocase(b.title)) || a.id - b.id);
    return { today, jobs: jobs.map((j) => view(data, j, today)) };
  },
  "job.get"(data, p) { return view(data, stored(data, p.job_id), todayIso()); },
  "job.create"(data, p) {
    validateJob(p, true);
    const ts = nowIso();
    const id = data.next_id++;
    data.jobs[id] = {
      id, guid: newGuid(), replaces: null, title: String(p.title).trim(), entry_url: checkUrl(p.entry_url),
      interval_weeks: p.interval_weeks, retry_days: p.retry_days ?? 2, next_due: p.next_due ?? todayIso(),
      username: p.username ?? "", password: p.password ?? "", instructions_md: p.instructions_md ?? "", created_at: ts,
      changed: Object.fromEntries(FIELDS.map((f) => [f, ts])),
    };
    return changed(view(data, data.jobs[id], todayIso()));
  },
  "job.update"(data, p) {
    const { job_id, ...input } = p;
    validateJob(input, false);
    const j = stored(data, job_id);
    const ts = nowIso();
    if (input.title !== undefined) input.title = String(input.title).trim();
    for (const f of FIELDS) if (input[f] !== undefined && input[f] !== j[f]) { j[f] = input[f]; j.changed[f] = ts; }
    if (input.entry_url !== undefined) {
      const u = checkUrl(input.entry_url);
      if (u !== j.entry_url) {
        const guid = newGuid();
        data.deleted[j.guid] = { title: j.title, entry_url: j.entry_url, deleted_at: ts, replaced_by: guid };
        j.replaces = j.guid; j.guid = guid; j.entry_url = u;
      }
    }
    return changed(view(data, j, todayIso()));
  },
  "job.delete"(data, p) {
    const j = stored(data, p.job_id);
    data.deleted[j.guid] = { title: j.title, entry_url: j.entry_url, deleted_at: nowIso(), replaced_by: null };
    delete data.jobs[j.id];
    data.runs = data.runs.filter((r) => r.job_id !== j.id);
    return changed({ job_id: j.id, guid: j.guid, deleted: true });
  },
  "job.complete"(data, p) {
    if (p.outcome !== "succeeded" && p.outcome !== "failed") throw bad("outcome_invalid", `\`outcome\` = "${p.outcome}" is not possible. Send "succeeded" when everything was filed, "failed" otherwise.`);
    const note = text("note", p.note ?? "", 0, 2000);
    const j = stored(data, p.job_id);
    if (p.expected_next_due != null && p.expected_next_due !== j.next_due) {
      throw new OpError(409, "job_changed", `This job is now due on ${j.next_due}, not on ${p.expected_next_due}: somebody else has closed a run or changed it meanwhile. Reload it and check whether the run is still needed.`);
    }
    const today = todayIso();
    const due = p.outcome === "succeeded" ? addDays(today, 7 * j.interval_weeks) : addDays(today, j.retry_days);
    const ts = nowIso(), guid = newGuid();
    data.runs.push({ guid, job_id: j.id, by_name: this.byName, outcome: p.outcome, note, finished_at: ts, due_before: j.next_due, due_after: due });
    const before = j.next_due;
    j.next_due = due; j.changed.next_due = ts;
    return changed({ job_id: j.id, run_guid: guid, outcome: p.outcome, due_before: before, next_due: due });
  },
  "job.history"(data, p) {
    const j = stored(data, p.job_id);
    const runs = data.runs.map((r, i) => [r, i]).filter(([r]) => r.job_id === j.id).sort((a, b) => cmp(b[0].finished_at, a[0].finished_at) || b[1] - a[1]).slice(0, 200)
      .map(([r]) => ({ run_guid: r.guid, outcome: r.outcome, note: r.note, finished_at: r.finished_at, due_before: r.due_before, due_after: r.due_after, by: r.by_name }));
    return { job_id: j.id, runs };
  },
  async "job.export"(data, p, password) {
    checkPassword(password);
    const bytes = await zipText(ENTRY, exchangeText(data), password || undefined);
    return { file_name: `portal-download-jobs-${todayIso()}.zip`, encrypted: !!password, zip_base64: toBase64(bytes) };
  },
  async "job.importPreview"(data, p, password) {
    const f = parseFile(await unzip(p.zip_base64, password));
    return previewJson(f, plan(data, f));
  },
  async "job.import"(data, p, password) {
    const f = parseFile(await unzip(p.zip_base64, password));
    return changed(apply(data, f, p.decisions, this));
  },
};

function checkPassword(pw) {
  if (pw && (chars(pw) < 8 || chars(pw) > 200 || /[\u0000-\u001f\u007f-\u009f]/.test(pw))) {
    throw bad("password_invalid", "The password for the file must have between 8 and 200 characters, in one line. Choose another and send again.");
  }
}

export function toBase64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
export function fromBase64(b64) { let s; try { s = atob(String(b64).trim()); } catch { throw bad("file_invalid", "`zip_base64` is not base64. Send the file's bytes base64-encoded, as job.export returns them."); } const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
async function unzip(b64, password) {
  try { return await unzipText(fromBase64(b64), ENTRY, password); }
  catch (e) { if (e instanceof ZipError) throw new OpError(400, e.kind, e.message); throw e; }
}

// ------------------------------------------------------------------ the file
function jobRecord(j) {
  return {
    type: "job", guid: j.guid, replaces: j.replaces, title: j.title, entry_url: j.entry_url, interval_weeks: j.interval_weeks, retry_days: j.retry_days,
    next_due: j.next_due, username: j.username, password: j.password, instructions_md: j.instructions_md, created_at: j.created_at, changed: { ...j.changed },
  };
}
export function exchangeText(data) {
  const out = [{ format: FORMAT, version: VERSION, kind: "jobs", created_at: nowIso(), service: "extension" }];
  const jobs = Object.values(data.jobs).sort((a, b) => a.id - b.id);
  for (const j of jobs) out.push(jobRecord(j));
  const guidOf = Object.fromEntries(jobs.map((j) => [j.id, j.guid]));
  for (const r of data.runs) out.push({ type: "run", guid: r.guid, job_guid: guidOf[r.job_id], by: r.by_name, outcome: r.outcome, note: r.note, finished_at: r.finished_at, due_before: r.due_before, due_after: r.due_after });
  for (const g of Object.keys(data.deleted).sort()) { const d = data.deleted[g]; out.push({ type: "deleted_job", guid: g, title: d.title, entry_url: d.entry_url, deleted_at: d.deleted_at, replaced_by: d.replaced_by }); }
  return out.map((v) => JSON.stringify(v) + "\n").join("");
}

const guidOk = (g) => typeof g === "string" && g.length === 36 && /^[0-9a-fA-F-]+$/.test(g);
const tsOk = (t) => typeof t === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(t) && !Number.isNaN(Date.parse(t));
const str = (v, k) => (typeof v[k] === "string" ? v[k] : "");
const lineError = (n, why) => bad("file_invalid", `Line ${n} of the file is not valid: ${why}. Nothing was read in; choose a file this service or the browser extension wrote.`);
function jobInput(v) {
  const n = (x) => (typeof x === "number" && Number.isInteger(x) ? x : x === undefined ? undefined : NaN);
  return { title: v.title, entry_url: v.entry_url, interval_weeks: n(v.interval_weeks), retry_days: n(v.retry_days), next_due: v.next_due, username: v.username ?? "", password: v.password ?? "", instructions_md: v.instructions_md ?? "" };
}

export function parseFile(content) {
  const lines = content.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => l.trim() !== "");
  if (!lines.length) throw lineError(1, "the file is empty");
  let head;
  try { head = JSON.parse(lines[0][1]); } catch { throw lineError(1, "the head is no JSON"); }
  if (head.format !== FORMAT) throw lineError(1, "the head does not name the format portal-download");
  if (head.version !== VERSION) throw bad("file_version", `The file has format version ${JSON.stringify(head.version ?? null)}; this reads version ${VERSION}, which portal-download 0.8 writes. Files of older versions are not read.`);
  if (head.kind !== "jobs" && head.kind !== "full") throw lineError(1, "the head names neither jobs nor full");
  const f = { kind: head.kind, jobs: [], runs: [], deleted: [] };
  for (const [n, line] of lines.slice(1)) {
    let v;
    try { v = JSON.parse(line); } catch { throw lineError(n, "it is no JSON"); }
    if (v.type === "job") {
      if (!guidOk(v.guid) || !tsOk(v.created_at)) throw lineError(n, "a job lacks a GUID, an entry address or its creation time");
      try { checkUrl(str(v, "entry_url")); validateJob(jobInput(v), true); } catch (e) { throw lineError(n, e.message); }
      for (const fld of FIELDS) if (!tsOk(v.changed && v.changed[fld])) throw lineError(n, `a job lacks the time its field ${fld} changed`);
      f.jobs.push(v);
    } else if (v.type === "run") {
      let ok = guidOk(v.guid) && guidOk(v.job_guid) && (v.outcome === "succeeded" || v.outcome === "failed") && tsOk(v.finished_at);
      try { parseDate("due_before", str(v, "due_before")); parseDate("due_after", str(v, "due_after")); text("by", str(v, "by"), 1, 200); text("note", str(v, "note"), 0, 2000); } catch { ok = false; }
      if (!ok) throw lineError(n, "a run lacks its GUID, its job, its outcome or its dates");
      f.runs.push(v);
    } else if (v.type === "deleted_job") {
      if (!guidOk(v.guid) || !tsOk(v.deleted_at) || (v.replaced_by != null && !guidOk(v.replaced_by))) throw lineError(n, "a deleted job lacks its GUID or the time it was deleted");
      f.deleted.push(v);
    } else if (["user", "invitation", "device", "agent"].includes(v.type) && f.kind === "full") {
      // People and accesses of a full backup stay with the service; the local store takes jobs only.
    } else throw lineError(n, `the record type "${v.type}" is not known here`);
  }
  const known = new Set(f.jobs.map((j) => j.guid));
  const stray = f.runs.find((r) => !known.has(r.job_guid));
  if (stray) throw bad("file_invalid", `A run in the file belongs to job ${stray.job_guid}, which the file does not hold. Nothing was read in.`);
  return f;
}

// ------------------------------------------------------------------ the merge, as the service does it
const byGuid = (data, g) => Object.values(data.jobs).find((j) => j.guid === g) || null;
function successor(data, guid) {
  let g = guid;
  for (let i = 0; i < 50; i++) {
    const d = data.deleted[g];
    if (!d || !d.replaced_by) return null;
    const j = byGuid(data, d.replaced_by);
    if (j) return j;
    g = d.replaced_by;
  }
  return null;
}
const runKnown = (data, g) => data.runs.some((r) => r.guid === g);
function newestLocalRun(data, id) {
  const r = data.runs.map((x, i) => [x, i]).filter(([x]) => x.job_id === id).sort((a, b) => cmp(b[0].finished_at, a[0].finished_at) || b[1] - a[1])[0];
  return r ? [r[0].finished_at, r[0].due_after] : null;
}
function compare(local, rec, newest) {
  const diffs = [];
  let dueFromRun = null;
  for (const f of FIELDS) {
    const lv = local[f], lt = local.changed[f], iv = rec[f] ?? "", it = rec.changed[f];
    if (f === "next_due") {
      if (newest && newest[0] >= lt && newest[0] >= it) { if (newest[1] !== local.next_due) dueFromRun = newest[1]; continue; }
      if (lv !== iv) diffs.push({ field: f, local: lv, incoming: iv, local_changed_at: lt, incoming_changed_at: it, preselect: iv < lv ? "incoming" : "local" });
      continue;
    }
    if (lv !== iv) diffs.push({ field: f, local: lv, incoming: iv, local_changed_at: lt, incoming_changed_at: it, preselect: it > lt ? "incoming" : "local" });
  }
  return { diffs, dueFromRun };
}
function plan(data, f) {
  const runsOf = {};
  for (const r of f.runs) (runsOf[r.job_guid] ||= []).push(r);
  return f.jobs.map((rec) => {
    let c;
    const known = byGuid(data, rec.guid);
    const succ = known ? null : successor(data, rec.guid);
    const del = data.deleted[rec.guid];
    let replacedTarget = null;
    if (!known && !succ && !(del && !del.replaced_by) && rec.replaces) replacedTarget = byGuid(data, rec.replaces) || successor(data, rec.replaces);
    if (known) c = { kind: "known", target: known, viaOld: false };
    else if (succ) c = { kind: "known", target: succ, viaOld: true };
    else if (del && !del.replaced_by) c = { kind: "deleted_here", deleted_at: del.deleted_at };
    else if (replacedTarget) c = { kind: "replaces", target: replacedTarget };
    else c = { kind: "new" };
    const newRuns = (runsOf[rec.guid] || []).filter((r) => !runKnown(data, r.guid));
    let diffs = [], dueFromRun = null;
    if (c.target) {
      let newest = newestLocalRun(data, c.target.id);
      for (const r of newRuns) if (!newest || r.finished_at > newest[0]) newest = [r.finished_at, r.due_after];
      ({ diffs, dueFromRun } = compare(c.target, rec, newest));
    }
    const group = c.kind === "new" ? "new" : c.kind === "known" && !diffs.length ? "same" : "decide";
    return { rec, c, newRuns, diffs, dueFromRun, group };
  });
}
function previewJson(f, items) {
  const out = { kind: f.kind, new: [], same: [], decide: [] };
  for (const it of items) {
    const v = { guid: it.rec.guid, title: it.rec.title, entry_url: it.rec.entry_url, new_runs: it.newRuns.length };
    if (it.c.kind === "known") { v.job_id = it.c.target.id; v.case = it.c.viaOld ? "old_address" : "known"; if (it.c.viaOld) v.local_entry_url = it.c.target.entry_url; }
    if (it.c.kind === "deleted_here") { v.case = "deleted_here"; v.deleted_at = it.c.deleted_at; }
    if (it.c.kind === "replaces") { v.case = "replaces"; v.job_id = it.c.target.id; v.replaces_title = it.c.target.title; v.local_entry_url = it.c.target.entry_url; }
    if (it.dueFromRun) v.next_due_from_run = it.dueFromRun;
    if (it.diffs.length) v.fields = it.diffs;
    if (it.c.kind === "deleted_here") { v.actions = ["reactivate", "skip"]; v.preselect = "skip"; }
    if (it.c.kind === "replaces") { v.actions = ["replace", "keep_both", "skip"]; v.preselect = "replace"; }
    out[it.group].push(v);
  }
  return out;
}
function insertJob(data, rec) {
  const id = data.next_id++;
  const i = jobInput(rec);
  data.jobs[id] = {
    id, guid: rec.guid, replaces: rec.replaces ?? null, title: String(i.title).trim(), entry_url: checkUrl(rec.entry_url),
    interval_weeks: i.interval_weeks, retry_days: i.retry_days ?? 2, next_due: i.next_due ?? todayIso(),
    username: i.username, password: i.password, instructions_md: i.instructions_md, created_at: rec.created_at,
    changed: Object.fromEntries(FIELDS.map((f) => [f, rec.changed[f]])),
  };
  return id;
}
function insertRuns(data, id, runs) {
  let n = 0;
  for (const r of runs) if (!runKnown(data, r.guid)) { data.runs.push({ guid: r.guid, job_id: id, by_name: r.by, outcome: r.outcome, note: r.note, finished_at: r.finished_at, due_before: r.due_before, due_after: r.due_after }); n++; }
  return n;
}
function apply(data, f, decisionsIn) {
  const decisions = decisionsIn && typeof decisionsIn === "object" ? decisionsIn : {};
  if (decisionsIn != null && (typeof decisionsIn !== "object" || Array.isArray(decisionsIn))) throw bad("decision_invalid", "`decisions` must be an object keyed by GUID.");
  const items = plan(data, f);
  const missing = items.filter((i) => i.group === "decide" && !(i.rec.guid in decisions)).map((i) => i.rec.guid);
  if (missing.length) throw bad("decision_missing", `The jobs ${missing.join(", ")} need a decision; call the preview again and send one for each of them. Nothing was read in.`);
  // Work on a copy, so that an error leaves the store as it was.
  const work = JSON.parse(JSON.stringify(data));
  const done = { added: 0, updated: 0, unchanged: 0, reactivated: 0, replaced: 0, skipped: 0, runs_added: 0 };
  for (const it of plan(work, f)) {
    const d = decisions[it.rec.guid];
    const take = (field, pre) => {
      if (!d || d.accept === "preselected" || d.action) return pre === "incoming";
      if (d.fields && typeof d.fields === "object") {
        const side = d.fields[field];
        if (side === "incoming") return true;
        if (side === "local") return false;
        if (side === undefined) throw bad("decision_missing", `The decision for ${it.rec.guid} names no side for its field ${field}. Nothing was read in.`);
        throw bad("decision_invalid", `The side for field ${field} of ${it.rec.guid} is neither local nor incoming.`);
      }
      throw bad("decision_invalid", `The decision for ${it.rec.guid} names nothing to do.`);
    };
    const action = (offered, pre) => {
      if (d && d.action !== undefined) {
        if (offered.includes(d.action)) return d.action;
        throw bad("decision_invalid", `"${d.action}" is not offered for ${it.rec.guid}; the preview offers ${offered.join(", ")}. Nothing was read in.`);
      }
      return pre;
    };
    const setField = (j, field, value, at) => { j[field] = value; j.changed[field] = at; };
    if (it.c.kind === "new") {
      const id = insertJob(work, it.rec); done.runs_added += insertRuns(work, id, it.newRuns); done.added++;
    } else if (it.c.kind === "known") {
      const j = work.jobs[it.c.target.id];
      let ch = false;
      for (const x of it.diffs) if (take(x.field, x.preselect)) { setField(j, x.field, x.incoming, x.incoming_changed_at); ch = true; }
      done.runs_added += insertRuns(work, j.id, it.newRuns);
      if (it.dueFromRun) { j.next_due = it.dueFromRun; j.changed.next_due = nowIso(); ch = true; }
      done[ch || it.newRuns.length ? "updated" : "unchanged"]++;
    } else if (it.c.kind === "deleted_here") {
      if (action(["reactivate", "skip"], "skip") === "reactivate") {
        delete work.deleted[it.rec.guid];
        const id = insertJob(work, it.rec); done.runs_added += insertRuns(work, id, it.newRuns); done.reactivated++;
      } else done.skipped++;
    } else {
      const a = action(["replace", "keep_both", "skip"], "replace");
      if (a === "replace") {
        const j = work.jobs[it.c.target.id];
        work.deleted[j.guid] = { title: j.title, entry_url: j.entry_url, deleted_at: nowIso(), replaced_by: it.rec.guid };
        j.replaces = j.guid; j.guid = it.rec.guid; j.entry_url = it.rec.entry_url;
        for (const x of it.diffs) if (take(x.field, x.preselect)) setField(j, x.field, x.incoming, x.incoming_changed_at);
        done.runs_added += insertRuns(work, j.id, it.newRuns);
        if (it.dueFromRun) { j.next_due = it.dueFromRun; j.changed.next_due = nowIso(); }
        done.replaced++;
      } else if (a === "keep_both") {
        const id = insertJob(work, it.rec); done.runs_added += insertRuns(work, id, it.newRuns); done.added++;
      } else done.skipped++;
    }
  }
  for (const x of f.deleted) if (!work.deleted[x.guid] && !byGuid(work, x.guid)) work.deleted[x.guid] = { title: x.title, entry_url: x.entry_url, deleted_at: x.deleted_at, replaced_by: x.replaced_by ?? null };
  Object.keys(data).forEach((k) => delete data[k]);
  Object.assign(data, work);
  return done;
}
