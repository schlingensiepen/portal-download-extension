// Runs the contract scenarios of the service against the local backend.
//   node test/contract.mjs <directory with the scenario files>
import { readFileSync, readdirSync } from "node:fs";
import { LocalBackend, emptyData, todayIso } from "../src/local.js";

const dir = process.argv[2];
if (!dir) { console.error("usage: node test/contract.mjs <contract-tests directory>"); process.exit(2); }
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return todayIso(d); };
function substitute(v, saved) {
  if (typeof v === "string") {
    if (v === "$any" || v === "$uuid") return v;
    if (v.startsWith("$today")) return addDays(Number(v.slice(6) || 0));
    if (v.startsWith("$")) { if (!(v.slice(1) in saved)) throw new Error(`nothing saved as ${v}`); return saved[v.slice(1)]; }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => substitute(x, saved));
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k.startsWith("$") && typeof saved[k.slice(1)] === "string" ? saved[k.slice(1)] : k] = substitute(x, saved);
    return o;
  }
  return v;
}
function matches(e, a, at) {
  if (e === "$any") return;
  if (e === "$uuid") { if (typeof a === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a)) return; throw new Error(`${at} is ${JSON.stringify(a)}, expected a GUID`); }
  if (e && typeof e === "object" && !Array.isArray(e)) {
    if (!a || typeof a !== "object") throw new Error(`${at} is ${JSON.stringify(a)}, expected an object`);
    for (const [k, v] of Object.entries(e)) { if (!(k in a)) throw new Error(`${at}/${k} is missing`); matches(v, a[k], `${at}/${k}`); }
    return;
  }
  if (Array.isArray(e)) {
    if (!Array.isArray(a) || a.length !== e.length) throw new Error(`${at} has ${Array.isArray(a) ? a.length : "no"} entries, expected ${e.length}: ${JSON.stringify(a)}`);
    e.forEach((x, i) => matches(x, a[i], `${at}/${i}`));
    return;
  }
  if (e !== a) throw new Error(`${at} is ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`);
}
const pointer = (v, p) => p.split("/").slice(1).reduce((x, k) => (x == null ? undefined : x[k.replace(/~1/g, "/").replace(/~0/g, "~")]), v);

let failed = 0;
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
if (files.length < 6) { console.error(`only ${files.length} scenarios found in ${dir}`); process.exit(1); }
for (const file of files) {
  const sc = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
  const backends = {}, saved = {};
  const get = (name) => backends[name] ||= (() => { let data = emptyData(); return new LocalBackend({ load: async () => data, save: async (d) => { data = d; } }); })();
  try {
    for (const [i, step] of sc.steps.entries()) {
      const ctx = `step ${i + 1} (${step.call})`;
      let result, error;
      try { result = await get(step.on || "a").call(step.call, substitute(step.params || {}, saved), step.password ? { "X-Backup-Password": step.password } : {}); }
      catch (e) { error = e; }
      if (step.error) {
        if (!error) throw new Error(`${ctx}: expected the error ${step.error}, got ${JSON.stringify(result)}`);
        if (error.kind !== step.error) throw new Error(`${ctx}: expected the error ${step.error}, got ${error.kind}: ${error.message}`);
        continue;
      }
      if (error) throw new Error(`${ctx}: failed with ${error.kind}: ${error.message}`);
      if (step.expect) { try { matches(substitute(step.expect, saved), result, ""); } catch (e) { throw new Error(`${ctx}: ${e.message}\nresult: ${JSON.stringify(result)}`); } }
      for (const [k, p] of Object.entries(step.save || {})) { const v = pointer(result, p); if (v === undefined) throw new Error(`${ctx}: nothing at ${p}`); saved[k] = v; }
    }
    console.log(`ok   ${file}: ${sc.name}`);
  } catch (e) { failed++; console.log(`FAIL ${file}: ${sc.name}\n     ${e.message}`); }
}
if (failed) { console.log(`${failed} of ${files.length} scenarios failed`); process.exit(1); }
console.log(`all ${files.length} scenarios pass`);
