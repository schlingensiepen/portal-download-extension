// The feedback text of the observer: nothing that may name a person gets into it, and it says
// what the search made of each click. REPORT_SRC may point at another copy (for red proofs).
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const src = process.env.REPORT_SRC ? pathToFileURL(process.env.REPORT_SRC).href : "../src/report.js";
const { redactText, redactCode, redactUrl, buildReport, verdictText } = await import(src);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const P = "https://www.portal.example";

test("words lose digits and e-mail addresses, and stay short", () => {
  assert.equal(redactText("Rechnung 2026-0471 für max.muster@example.org"), "Rechnung #-# für [e-mail]");
  assert.equal(redactText("Kundennr. ４７１１"), "Kundennr. #");
  assert.equal([...redactText("x".repeat(200))].length, 81);
  assert.ok(!redactText("a `b` c").includes("`"));
});

test("scripts keep their function names, not what is quoted", () => {
  assert.equal(redactCode("__doPostBack('ctl00$Main$Grid','Select$12')"), "__doPostBack('…','…')");
  assert.equal(redactCode('openDoc("Max Muster", 4711)'), 'openDoc("…", #)');
  assert.equal(redactCode("load(`/kunde/mustermann`)"), "load('…')");
});

test("addresses keep their form only", () => {
  assert.equal(redactUrl(`${P}/kunde/4711/rechnung.pdf?id=8&sid=abc#p=2`, P), "/kunde/#/rechnung.pdf?id=…&sid=…#…");
  assert.equal(redactUrl(`${P}/dl/eyJhbGciOiJIUzI1NiJ9abcdefgh/file`, P), "/dl/…/file");
  assert.equal(redactUrl(`${P}/u/max.muster@example.org/doc`, P), "/u/…/doc");
  assert.equal(redactUrl(`${P}/docs/rechnung-2026-01.pdf`, P), "/docs/rechnung-#-#.pdf");
  assert.equal(redactUrl(`${P}/f/a8Kd93LmQz71xPw2.pdf`, P), "/f/….pdf");
  assert.equal(redactUrl(`${P}/f/550e8400-e29b-41d4-a716-446655440000`, P), "/f/…");
  assert.equal(redactUrl(`${P}/doc;jsessionid=0A1B2C3D4E5F6A7B8C9D`, P), "/doc;…");
  assert.equal(redactUrl(`${P}/download/dGhpcyBpcyBh_c2VjcmV0LXRva2Vu`, P), "/download/…");
  assert.equal(redactUrl(`${P}/t/AbCdEfGhIjKlMnOpQrStUvWx/`, P), "/t/…/");
  assert.equal(redactUrl(`${P}/x/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJtYXgifQ.c2lnbmF0dXJl`, P), "/x/…");
  assert.equal(redactUrl(`${P}/dl.php?eyJhbGciOiJIUzI1NiJ9abcdef`, P), "/dl.php?…=…");
  assert.equal(redactUrl(`${P}/api/downloadInvoiceDocument/Jahresabrechnung`, P), "/api/downloadInvoiceDocument/Jahresabrechnung");
  assert.equal(redactUrl("https://files.cdn.example/a/b.pdf?t=1", P), "https://files.cdn.example/a/b.pdf?t=…");
  assert.equal(redactUrl("https://files.cdn.example/a/b.pdf", P, false), "[another site]/a/b.pdf");
  assert.equal(redactUrl("data:application/pdf;base64,JVBERi0xLjQK", P), "data:application/pdf");
  assert.equal(redactUrl("blob:https://www.portal.example/1-2-3", P), "blob: (made in the page)");
  assert.equal(redactUrl("javascript:show('Max', 12)", P), "javascript:show('…', #)");
});

test("the search's verdict in words", () => {
  assert.match(verdictText({ finder: "found", kind: "button", reason: "words", sure: false }), /found as a button \(its words\), offered unticked/);
  assert.match(verdictText({ finder: "hidden", why: "words" }), /left out: its words name a destroying action/);
  assert.match(verdictText({ finder: "none", clickable: false }), /no link or button in the markup/);
});

const click = (over) => ({ at: 1000, tag: "a", type: "", role: "", id: "row-4711", cls: "btn btn-pdf", text: "Rechnung 03/2026", title: "", aria: "", alt: "", download: null, href: `${P}/api/doc?id=4711&token=s3cr3t`, target: "_blank", onclick: "track('Max Muster')", form: null, pointer: true, icons: [{ cls: "fa fa-file-pdf" }], chain: [{ tag: "table", cls: "grid" }, { tag: "tr", cls: "" }, { tag: "td", cls: "" }], shadow: false, frame: "", page: `${P}/rechnungen`, verdict: { finder: "found", kind: "link", reason: "address", sure: true }, ...over });

test("the report names the portal only when asked, and leaks no number, token or e-mail", () => {
  const w = { url: `${P}/kunde/4711/rechnungen?sid=abc`, ended: "download",
    clicks: [click({ at: 1 }), click({ at: 2, tag: "div", cls: "", text: "⤓", href: "", onclick: "", verdict: { finder: "none", clickable: false } })],
    events: [{ at: 1.5, kind: "tab", url: `${P}/view?doc=4711` }],
    download: { mime: "application/pdf", filename: "/home/u/Downloads/Rechnung_4711.PDF", url: "https://cdn.example/x/9?sig=abc", referrer: `${P}/kunde/4711/rechnungen` } };
  const named = buildReport(w, { version: "1.1.0", browser: "Firefox 147", namePortal: true });
  const anon = buildReport(w, { version: "1.1.0", browser: "Firefox 147", namePortal: false });
  assert.match(named, /Portal: `www\.portal\.example`/);
  assert.match(named, /Portal-Download 1\.1\.0, Firefox 147/);
  assert.match(anon, /Portal: \(not named\)/);
  assert.ok(!anon.includes("portal.example") && !anon.includes("cdn.example"));
  for (const r of [named, anon]) {
    for (const bad of ["4711", "s3cr3t", "Max Muster", "abc", "2026"]) assert.ok(!r.includes(bad), `${bad} in the report`);
    assert.match(r, /search: found as a link \(its address looks like a download\), ticked/);
    assert.match(r, /no link or button in the markup/);
    assert.match(r, /then a new tab opened: `\/view\?doc=…`/);
    assert.match(r, /type `application\/pdf`, file ending `\.pdf`/);
  }
});

test("what a page wrote cannot become a link, an image or a mention in the issue", () => {
  const r = buildReport({ url: `${P}/`, ended: "stopped", clicks: [click({ text: "[pay here](https://evil.example) @octocat ![x](https://evil.example/t.png)", title: "@someone" })], events: [] });
  const line = r.split("\n").find((l) => l.startsWith("1."));
  // Everything the page wrote stands inside code spans.
  for (const part of line.split(" · ").slice(1)) assert.match(part, /^(title |label |alt )?`[^`]*`$/, part);
});

test("icons, ids and classes lose their keys; icon addresses their parameters", () => {
  const r = buildReport({ url: `${P}/`, ended: "stopped", clicks: [click({ id: "dl-a8Kd93LmQz71xPw2Zq", cls: "btn sess-AbCdEfGhIjKlMnOpQr", icons: [{ cls: "fa fa-file-pdf", url: "https://cdn.portal.example/avatars/max.mustermann.png?token=abcdefgh" }] })], events: [] }, { namePortal: false });
  assert.ok(!r.includes("a8Kd93") && !r.includes("AbCdEf") && !r.includes("abcdefgh") && !r.includes("cdn.portal"), r);
  assert.match(r, /icons `fa fa-file-pdf \[another site\]\/avatars\/max\.mustermann\.png\?token=…`/);
});

test("fields of an odd type do not break the text", () => {
  const r = buildReport({ url: `${P}/`, ended: "stopped", clicks: [click({ form: { action: {}, method: 5 }, id: {}, chain: "x", icons: null })], events: [] });
  assert.match(r, /sends a form/);
});

test("short share keys, base64 and runs of capitals go; words with a number and camelCase stay", () => {
  assert.equal(redactUrl("https://cloud.example/s/aBcDe4GhIjK7mNo", P), "https://cloud.example/s/…");
  assert.equal(redactUrl(`${P}/share/Xk9fQ2LmPz7Rt`, P), "/share/…");
  assert.equal(redactUrl(`${P}/doc/SGVsbG8gV29ybGQ.pdf`, P), "/doc/….pdf");
  assert.equal(redactUrl(`${P}/d/QWERTZUIOPASDFGHJKLYXCVB`, P), "/d/…");
  assert.equal(redactUrl(`${P}/files/rechnung2024.pdf`, P), "/files/rechnung#.pdf");
  assert.equal(redactUrl(`${P}/api/getDocumentById`, P), "/api/getDocumentById");
  assert.equal(redactUrl("moz-extension://1b2c3d4e-aaaa-bbbb/icon.png", P), "[extension]");
});

test("a file name shows only its ending, and only a short one of letters", () => {
  const r = buildReport({ url: `${P}/`, ended: "download", clicks: [click({ download: "Rechnung_Max_Mustermann_2024.pdf" })], events: [],
    download: { mime: "application/octet-stream", filename: "/home/u/Downloads/invoice.20240115", url: `${P}/x` } });
  assert.ok(!r.includes("Mustermann"), r);
  assert.match(r, /download attribute `set, \.pdf`/);
  assert.match(r, /file ending `other`/);
});

test("scripts lose an unpaired quote to the end; invisible format characters go", () => {
  assert.equal(redactCode("x='unterminated secret"), "x='…");
  assert.equal(redactText("abc\u202Edef\u200B"), "abcdef");
});

test("a new tab without an address yet is still told; the verdict takes only known words", () => {
  const r = buildReport({ url: `${P}/`, ended: "stopped", clicks: [click({ at: 1, verdict: { finder: "found", kind: "[x](http://e)", reason: "@me", sure: true } })], events: [{ at: 2, kind: "tab", url: "about:blank" }] });
  assert.match(r, /then a new tab opened: `\(no address yet\)`/);
  assert.match(r, /found as a candidate \(other reason\)/);
  assert.ok(!r.includes("@me") && !r.includes("http://e"));
});

test("only the last five clicks are told", () => {
  const w = { url: `${P}/`, ended: "timeout", clicks: [1, 2, 3, 4, 5, 6, 7].map((k) => click({ at: k, text: `Knopf ${"abcdefg"[k - 1]}` })), events: [] };
  const r = buildReport(w);
  assert.match(r, /the last five/);
  assert.ok(!r.includes('"Knopf a"') && !r.includes('"Knopf b"') && r.includes('"Knopf c"') && r.includes('"Knopf g"'));
  assert.match(r, /no download within two minutes/);
});

test("a name in the words of an element is not recognised: the user must read the text (the panel says so)", () => {
  const r = buildReport({ url: `${P}/`, ended: "stopped", clicks: [click({ text: "Rechnung für Max Muster" })], events: [] });
  assert.ok(r.includes("Max Muster"));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); }
}
if (failed) { console.log(`${failed} of ${tests.length} failed`); process.exit(1); }
console.log(`all ${tests.length} passed`);
