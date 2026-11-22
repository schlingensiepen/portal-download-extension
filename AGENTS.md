# Working on portal-download-extension

The browser extension for Portal-Download services, for Chrome, Edge and Firefox, from one manifest (Manifest V3).

| Where | What |
|---|---|
| `manifest.json` | One manifest for both browser families: `side_panel` for Chrome and Edge, `sidebar_action` for Firefox, `background.service_worker` and `background.scripts`. |
| `src/panel.js`, `panel.html`, `panel.css` | The side panel. Every text comes from `_locales/<lang>/messages.json` through `t()`; elements are built with `h()`, text goes in as text only, never as HTML. |
| `src/backends.js` | Services over their JSON-RPC API with the extension's device token (`Authorization: Bearer`), and how an invitation link is read. |
| `src/local.js` | The local backend: the job methods of the service, kept in this browser. |
| `src/vault.js` | What is kept: the services with their tokens, and once a local store exists, everything encrypted under its passphrase. |
| `src/zipaes.js` | The exchange file: a ZIP with one entry, WinZip AES-256, with WebCrypto and CompressionStream. No third-party code. |
| `test/` | `contract.mjs` runs the service's contract scenarios against the local backend; `zip.test.mjs` reads files the service wrote (`fixtures/`); `messages.test.mjs` holds the text keys. |

Working on it:
- **Load from source:** Chrome and Edge: *Extensions → Developer mode → Load unpacked* on this folder; reload the card after a change. Firefox: `about:debugging` → *This Firefox* → *Load Temporary Add-on* → `manifest.json`.
- **Tests:** `node test/contract.mjs ../product/contract-tests` (with the service checked out beside this repository, or cloned as the CI does), `node test/zip.test.mjs`, `node test/messages.test.mjs`, `node test/i18n.test.mjs`. `node build.mjs` packs `dist/` with `build/zip.mjs`, a plain ZIP writer, the same bytes for the same sources.
- **Languages:** `src/i18n.js` reads `_locales/<code>/messages.json` itself, so that the language can be chosen in the panel; the browser's lookup serves only the manifest. A new language: its folder with every key, and an entry in `LANGUAGES`; `test/i18n.test.mjs` checks that both match.
- **A new text:** add the key with its message to every `_locales/<lang>/messages.json`, with the same `$1`… placeholders; `messages.test.mjs` fails on a key used but missing, or kept but unused.
- **Releasing:** set `version` in `manifest.json`, commit, tag `v<version>` (the CI refuses a tag that differs from the manifest), push the tag. The CI tests, packs, submits the version to addons.mozilla.org on the listed channel (secrets `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`) and creates the GitHub release with the ZIP, and with the signed `.xpi` when Mozilla approved it within the wait; a refused or slower review leaves a warning and does not stop the release. Set `PRODUCT_REF` in the CI to the tag of the service whose scenarios the release passes.
- **Store pages:** `store/listing.md` holds the texts, `store/logo-300.png`, `store/logo-512.png` and the icons (all from `build/icons.sh`, which renders `icons/logo.svg`, and `icons/logo-small.svg` for 16 and 32 pixels, with `rsvg-convert`) and the screenshots; `store/amo-metadata.json` goes with every signing at Mozilla, now on the listed channel.
- **What is kept:** `storage.local` holds `services` (a list of `{id, name, base, token}`) while no local store exists. With one, it holds `vault`: `{salt, iterations, sealed: {iv, data}}`, where `data` is AES-GCM of `{services, local}`; `local` is `{next_id, jobs: {id: job with changed times}, runs: [...], deleted: {guid: …}}`. The unlocked key lies in `storage.session` as `vaultKey`. In both cases `storage.local` also holds `language`, the panel's language choice, unencrypted.

Rules that hold:
- **The local backend behaves as the service does** for every scenario in the service's `contract-tests/`, of the same major and minor version (`PRODUCT_REF` in the CI). A change of the merge or the file format goes into the service first, with a scenario, then here.
- **One backend cannot reach another:** nothing a backend sends is put into the page as HTML; instructions are shown as text.
- **Host permissions only for the services added,** asked for in the click that adds one (`optional_host_permissions`).
- **The extension sends a token only to the base address that issued it,** in the `Authorization` header.
- Run `node test/contract.mjs <path to the service's contract-tests>`, `node test/zip.test.mjs`, `node test/messages.test.mjs`, `node test/i18n.test.mjs` before each commit; `node build.mjs` packs `dist/`.

Questions and ideas from users come in under GitHub Discussions of this repository; they are read regularly, and what holds up becomes an issue or a change.
