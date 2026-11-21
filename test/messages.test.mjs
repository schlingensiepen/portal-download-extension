// Every text key the panel and the manifest use exists in every language, with the same placeholders.
import { readFileSync, readdirSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const panel = readFileSync(root + "src/panel.js", "utf8");
const manifest = readFileSync(root + "manifest.json", "utf8");
const used = new Set([...panel.matchAll(/\bt\("([a-z_]+)"/g)].map((m) => m[1]).concat([...manifest.matchAll(/__MSG_([a-z_]+)__/g)].map((m) => m[1])));
// Keys the panel builds at run time: outcomes, fields and actions.
for (const k of ["succeeded", "failed", "username", "password", "title", "next_due", "interval_weeks", "retry_days", "instructions_md", "action_reactivate", "action_skip", "action_replace", "action_keep_both"]) used.add(k);
let failed = 0;
const langs = readdirSync(root + "_locales");
const holes = (s) => [...s.matchAll(/\$(\d)/g)].map((m) => m[1]).sort().join(",");
const en = JSON.parse(readFileSync(root + "_locales/en/messages.json", "utf8"));
for (const lang of langs) {
  const m = JSON.parse(readFileSync(`${root}_locales/${lang}/messages.json`, "utf8"));
  for (const k of used) if (!m[k]) { console.log(`FAIL ${lang} lacks ${k}`); failed++; }
  for (const k of Object.keys(m)) {
    if (!used.has(k)) { console.log(`FAIL ${lang} has ${k}, which nothing uses`); failed++; }
    if (en[k] && holes(m[k].message) !== holes(en[k].message)) { console.log(`FAIL ${lang} ${k} has other placeholders than English`); failed++; }
  }
}
if (failed) process.exit(1);
console.log(`ok   ${used.size} keys in ${langs.length} languages`);
