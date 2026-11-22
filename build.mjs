// Packs the extension into dist/portal-download-<version>.zip: the one file for Chrome and Edge
// (unpack and load) and for Firefox (submitted to addons.mozilla.org; Mozilla signs it after its review).
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipFiles } from "./build/zip.mjs";
const root = fileURLToPath(new URL(".", import.meta.url));
const version = JSON.parse(readFileSync(root + "manifest.json", "utf8")).version;
const files = [];
const walk = (dir) => { for (const n of readdirSync(join(root, dir)).sort()) { const p = join(dir, n); if (statSync(join(root, p)).isDirectory()) walk(p); else files.push(p); } };
files.push("manifest.json", "LICENSE");
for (const d of ["src", "_locales", "icons"]) walk(d);
mkdirSync(root + "dist", { recursive: true });
const out = `dist/portal-download-${version}.zip`;
writeFileSync(root + out, await zipFiles(files.map((f) => [f, readFileSync(join(root, f))])));
console.log(`${out}: ${files.length} files`);
