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

Rules that hold:
- **The local backend behaves as the service does** for every scenario in the service's `contract-tests/`, of the same major and minor version (`PRODUCT_REF` in the CI). A change of the merge or the file format goes into the service first, with a scenario, then here.
- **One backend cannot reach another:** nothing a backend sends is put into the page as HTML; instructions are shown as text.
- **Host permissions only for the services added,** asked for in the click that adds one (`optional_host_permissions`).
- **The extension sends a token only to the base address that issued it,** in the `Authorization` header.
- Run `node test/contract.mjs <path to the service's contract-tests>`, `node test/zip.test.mjs`, `node test/messages.test.mjs` before each commit; `node build.mjs` packs `dist/`.
