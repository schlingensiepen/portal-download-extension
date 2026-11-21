// The ZIP code against files the service wrote, and its own round trip. Run: node test/zip.test.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { zipText, unzipText, crc32 } from "../src/zipaes.js";
const here = new URL(".", import.meta.url).pathname;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const kind = async (p) => { try { await p; return "none"; } catch (e) { return e.kind; } };

check(crc32(new TextEncoder().encode("123456789")) === 0xcbf43926, "CRC-32 check value");
const plain = new Uint8Array(readFileSync(here + "fixtures/server-plain.zip"));
const aes = new Uint8Array(readFileSync(here + "fixtures/server-aes.zip"));
const text = await unzipText(plain, "portal-download.jsonl");
check(text.startsWith('{"') && text.includes('"Energy"') && text.includes('"type":"run"'), "reads the service's plain file");
check((await unzipText(aes, "portal-download.jsonl", "fixture password")) === text, "reads the service's AES-256 file");
check((await kind(unzipText(aes, "portal-download.jsonl"))) === "password_required", "an encrypted file needs its password");
check((await kind(unzipText(aes, "portal-download.jsonl", "wrong password"))) === "password_wrong", "a wrong password is refused");
check((await kind(unzipText(new Uint8Array([1, 2, 3]), "portal-download.jsonl"))) === "file_invalid", "no ZIP is refused");
const mine = await zipText("portal-download.jsonl", text, "long password");
check((await unzipText(mine, "portal-download.jsonl", "long password")) === text, "round trip with AES-256");
const minePlain = await zipText("portal-download.jsonl", text);
check((await unzipText(minePlain, "portal-download.jsonl")) === text, "round trip without password");
// A big file: many blocks of keystream.
const big = "x".repeat(300000) + "\n";
check((await unzipText(await zipText("portal-download.jsonl", big, "long password"), "portal-download.jsonl", "long password")) === big, "round trip of 300 kB with AES");
// A decompression bomb is stopped at the limit.
const bomb = await zipText("portal-download.jsonl", "a".repeat(2_000_000));
check((await kind(unzipText(bomb, "portal-download.jsonl", null, 1_000_000))) === "file_too_large", "a file that inflates beyond the limit is refused");
// The old ZipCrypto: mark an entry encrypted without the AES field.
const old = minePlain.slice(); old[6] |= 1; const cd = old.findIndex((_, i) => old[i] === 0x50 && old[i + 1] === 0x4b && old[i + 2] === 1 && old[i + 3] === 2); old[cd + 8] |= 1;
check((await kind(unzipText(old, "portal-download.jsonl", "x"))) === "file_encryption", "the old ZIP encryption is refused");
if (process.argv[2]) { writeFileSync(process.argv[2], mine); console.log("wrote", process.argv[2]); }
if (failed) { console.log(`${failed} failed`); process.exit(1); }
