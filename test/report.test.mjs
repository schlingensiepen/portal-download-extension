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
});

test("addresses keep their form only", () => {
  assert.equal(redactUrl(`${P}/kunde/4711/rechnung.pdf?id=8&sid=abc#p=2`, P), "/kunde/#/rechnung.pdf?id=…&sid=…#…");
  assert.equal(redactUrl(`${P}/dl/eyJhbGciOiJIUzI1NiJ9abcdefgh/file`, P), "/dl/…/file");
  assert.equal(redactUrl(`${P}/u/max.muster@example.org/doc`, P), "/u/…/doc");
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

const click = (over) => ({ at: 1000, tag: "a", type: "", role: "", id: "row-4711", cls: "btn btn-pdf", text: "Rechnung 03/2026", title: "", aria: "", alt: "", download: null, href: `${P}/api/doc?id=4711&token=s3cr3t`, target: "_blank", onclick: "track('Max Muster')", form: null, pointer: true, icons: ["fa fa-file-pdf"], chain: ["table.grid", "tr", "td"], shadow: false, frame: "", page: `${P}/rechnungen`, verdict: { finder: "found", kind: "link", reason: "address", sure: true }, ...over });

test("the report names the portal only when asked, and leaks no number, token or e-mail", () => {
  const w = { url: `${P}/kunde/4711/rechnungen?sid=abc`, ended: "download",
    clicks: [click({ at: 1 }), click({ at: 2, tag: "div", cls: "", text: "⤓", href: "", onclick: "", verdict: { finder: "none", clickable: false } })],
    events: [{ at: 1.5, kind: "tab", url: `${P}/view?doc=4711` }],
    download: { mime: "application/pdf", filename: "/home/u/Downloads/Rechnung_4711.PDF", url: "https://cdn.example/x/9?sig=abc", referrer: `${P}/kunde/4711/rechnungen` } };
  const named = buildReport(w, { version: "1.1.0", browser: "Firefox 147", namePortal: true });
  const anon = buildReport(w, { version: "1.1.0", browser: "Firefox 147", namePortal: false });
  assert.match(named, /Portal: www\.portal\.example/);
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
