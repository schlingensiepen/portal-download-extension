// The panel's own language choice: which folder a browser language gets, how messages are
// filled, and that every language offered has its folder and every folder is offered.
import { readdirSync } from "node:fs";
import { LANGUAGES, resolve, fill, tag } from "../src/i18n.js";
const root = new URL("..", import.meta.url).pathname;
let failed = 0;
const eq = (got, want, what) => { if (got !== want) { console.log(`FAIL ${what}: ${got} instead of ${want}`); failed++; } };
for (const [ui, want] of [["de", "de"], ["de-AT", "de"], ["en-US", "en"], ["fr-CA", "fr"], ["es-419", "es"], ["pt-BR", "pt_BR"], ["pt", "pt_PT"], ["pt-PT", "pt_PT"],
  ["zh-CN", "zh_CN"], ["zh-TW", "zh_TW"], ["zh-HK", "zh_TW"], ["zh", "zh_CN"], ["ja", "en"], ["", "en"], [undefined, "en"], ["pt_BR", "pt_BR"]]) eq(resolve(ui), want, `resolve(${ui})`);
eq(fill("overdue by $1 days", ["3"]), "overdue by 3 days", "one placeholder");
eq(fill("$2 of $1", ["a", "b"]), "b of a", "placeholders in another order");
eq(fill("costs $$5", []), "costs $5", "a dollar sign");
eq(fill("$1 and $3", ["x"]), "x and ", "a missing value");
eq(tag("pt_BR"), "pt-BR", "language tag");
const folders = readdirSync(root + "_locales").sort().join(",");
eq(Object.keys(LANGUAGES).sort().join(","), folders, "languages offered and folders");
if (failed) process.exit(1);
console.log(`ok   language choice, ${Object.keys(LANGUAGES).length} languages`);
