// The feedback text of the observer: per click only the kind of element, its words (digits and
// e-mail addresses replaced), yes/no marks and the search's verdict; the download as kind and size.
// Nothing a page wrote can become Markdown. REPORT_SRC may point at another copy (for red proofs).
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const src = process.env.REPORT_SRC ? pathToFileURL(process.env.REPORT_SRC).href : "../src/report.js";
const { redactText, buildReport, verdictText } = await import(src);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const P = "https://www.portal.example";
const click = (over) => ({ at: 1, tag: "a", role: "", type: "", words: "Rechnung 03/2026", link: "address", download: false, newTab: false, onclick: false, submits: false, icon: false, pointer: true, frame: false, shadow: false, verdict: { finder: "found", kind: "link", reason: "address", sure: true }, ...over });

test("words lose digits, e-mail addresses and format characters, and stay short", () => {
  assert.equal(redactText("Rechnung 2026-0471 für max.muster@example.org"), "Rechnung #-# für [e-mail]");
  assert.equal(redactText("Kundennr. ４７１１"), "Kundennr. #");
  assert.equal(redactText("abc\u202Edef\u200B"), "abcdef");
  assert.equal(redactText("Code aB3xY9kLmN0pQ7rS2tUv holen"), "Code [long] holen");
  assert.equal(redactText("Jahresverbrauchsabrechnung"), "Jahresverbrauchsabrechnung");
  assert.equal(redactText("https://portal.example/share/abcdefghijk"), "[address]");
  assert.equal(redactText("Link: www.portal.example/u/johnsmith holen"), "Link: [address] holen");
  assert.equal(redactText("get.php?user=johnsmith"), "[address]");
  assert.equal([...redactText("x".repeat(200))].length, 81);
  assert.ok(!redactText("a `b` c").includes("`"));
});

test("the search's verdict in words, only from known values", () => {
  assert.match(verdictText({ finder: "found", kind: "button", reason: "words", sure: false }), /found as a button \(its words\), offered unticked/);
  assert.match(verdictText({ finder: "hidden", why: "words" }), /left out: its words name a destroying action/);
  assert.match(verdictText({ finder: "none", clickable: false }), /no link or button in the markup/);
  assert.match(verdictText({ finder: "none", clickable: false }, "input"), /a form field/);
  assert.match(verdictText({ finder: "found", kind: "[x](http://e)", reason: "@me" }), /found as a candidate \(other reason\)/);
});

test("a click is its kind, its words and yes/no marks; no address, id, class or script", () => {
  const r = buildReport({ url: `${P}/kunde/4711/rechnungen?sid=abc`, ended: "download",
    clicks: [click({ at: 1, newTab: true, onclick: true, href: `${P}/api/doc?id=4711&token=s3cr3t`, id: "row-4711", cls: "secret-class" }),
      click({ at: 3, tag: "span", link: "", words: "", icon: true, verdict: { finder: "none", clickable: false } }),
      click({ at: 5, tag: "button", link: "", submits: true, words: "Speichern", verdict: { finder: "none", clickable: true } })],
    events: [{ at: 2, kind: "tab" }, { at: 4, kind: "page" }, { at: 6, kind: "address" }],
    download: { mime: "application/pdf", filename: "/home/u/Downloads/Rechnung_4711.PDF", bytes: 245760 } }, { version: "1.1.0", browser: "Firefox 147" });
  assert.match(r, /Portal-Download 1\.1\.0, Firefox 147/);
  assert.match(r, /Portal: `www\.portal\.example`/);
  assert.match(r, /1\. a link with an address `"Rechnung #\/#"` · opens a new tab · script in its markup/);
  assert.match(r, /then a new tab opened/);
  assert.match(r, /2\. an element `<span>` without words · has an icon · pointer cursor/);
  assert.match(r, /then a new page loaded/);
  assert.match(r, /3\. a submit button `"Speichern"`/);
  assert.match(r, /then the page's script changed the address, without loading a new page/);
  assert.match(r, /\*\*Download:\*\* a PDF of 240 KB was downloaded\./);
  for (const bad of ["4711", "s3cr3t", "secret-class", "row-", "kunde", "rechnungen", "sid", "Rechnung_", "2026"]) assert.ok(!r.includes(bad), `${bad} in the report`);
});

test("the portal is named only when asked", () => {
  const r = buildReport({ url: `${P}/x`, ended: "stopped", clicks: [click()], events: [] }, { namePortal: false });
  assert.match(r, /Portal: \(not named\)/);
  assert.ok(!r.includes("portal.example"));
});

test("what a page wrote cannot become a link, an image or a mention, nor a strange tag or role", () => {
  const r = buildReport({ url: `${P}/`, ended: "stopped", clicks: [click({ words: "[pay here](https://evil.example) @octocat ![x](https://e/t.png)", tag: "x](http://e)", role: "@me" })], events: [] });
  const line = r.split("\n").find((l) => l.startsWith("1."));
  assert.match(line, /^1\. an element `<element>` `"[^`]*"`$/);
  const odd = buildReport({ url: `${P}/`, ended: "stopped", clicks: [click({ tag: "user-4711", role: "row-12", link: "", words: "" })], events: [] });
  assert.match(odd, /an element `<user-#>` with role `row-#`/);
  assert.ok(!line.includes("@me"));
});

test("a name in the words of an element is not recognised: the user must read the text (the panel says so)", () => {
  assert.ok(buildReport({ url: `${P}/`, ended: "stopped", clicks: [click({ words: "Rechnung für Max Muster" })], events: [] }).includes("Max Muster"));
});

test("the kind of a download from its type, else a short ending of letters; size from the browser", () => {
  const kind = (d) => buildReport({ url: `${P}/`, ended: "download", clicks: [], events: [], download: d }).split("**Download:** ")[1];
  assert.equal(kind({ mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: 3 * 1024 * 1024 }), "an Excel file of 3.0 MB was downloaded.");
  assert.equal(kind({ mime: "application/octet-stream", filename: "/d/Max_Muster.xml" }), "a XML file (size unknown) was downloaded.");
  assert.equal(kind({ mime: "application/octet-stream", filename: "/d/invoice.20240115" }), "a file (size unknown) was downloaded.");
  assert.equal(kind({ mime: "", filename: "/d/J.Smith" }), "a file (size unknown) was downloaded.");
});

test("only the last five clicks are told", () => {
  const w = { url: `${P}/`, ended: "timeout", clicks: [1, 2, 3, 4, 5, 6, 7].map((k) => click({ at: k, words: `Knopf ${"abcdefg"[k - 1]}` })), events: [] };
  const r = buildReport(w);
  assert.match(r, /the last five/);
  assert.ok(!r.includes('"Knopf a"') && !r.includes('"Knopf b"') && r.includes('"Knopf c"') && r.includes('"Knopf g"'));
  assert.match(r, /no download within two minutes/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); }
}
if (failed) { console.log(`${failed} of ${tests.length} failed`); process.exit(1); }
console.log(`all ${tests.length} passed`);
