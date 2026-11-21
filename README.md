# Portal-Download browser extension

The due portal downloads of every [Portal-Download](https://github.com/schlingensiepen/portal-download) service you belong to, and of a store in this browser, in one list in the browser's side panel. The portal opens in a normal tab beside it; the login is copied with one click; a run is closed as succeeded or failed.

For Chrome, Edge and Firefox (128 or newer).

## Installing

From the [releases](https://github.com/schlingensiepen/portal-download-extension/releases):

- **Firefox:** open the `.xpi` file and confirm.
- **Chrome and Edge:** download the ZIP, unpack it into a folder that stays, open `chrome://extensions` (Edge: `edge://extensions`), switch on *Developer mode*, *Load unpacked*, and choose the folder. The browser reminds you now and then that a developer extension is active.

The toolbar button opens the side panel (Firefox: the sidebar).

## Adding a service

1. Open an invitation link of the service in a tab, or, in the service's web application, *Add to the browser extension* under **My devices**, which opens such a link for you. It serves once, within the hour.
2. Click **+** in the panel and *Take the invitation from the current tab*.
3. Allow the extension to reach that service. It asks for that one service only.

The extension gets a device access of its own, which shows up among your devices in the service and can be revoked there.

**The computer must trust the service's certificate.** Chrome and Edge do not count a certificate that was only accepted on a warning page. A service in the Portal-Download container image offers its certificate authority on its overview page and at `/ca.crt`: compare its fingerprint, then import it once as a trusted root certificate authority. Firefox takes an accepted warning, or the system's roots.

## The list

**All** at the top shows the jobs of every backend in one list, most urgent first, each with the name of its backend. Choosing one backend shows its jobs only and enables what concerns that backend: *Add the current page as a job*, and under ⚙ the exchange of jobs as a file and its management.

## The local store

Under **+**, *Keep jobs in this browser* creates a store of jobs in this browser only, encrypted with a passphrase of at least ten characters. From then on the tokens of the services lie under the passphrase as well, and the extension asks for it once after every start of the browser. **A forgotten passphrase cannot be recovered**: export the jobs now and then.

## Exchanging jobs

Under ⚙ of a backend, *Export the jobs* writes a ZIP file with every job, its login, its history and the deleted jobs, encrypted with AES-256 when you give a password (8 to 200 characters, no umlauts); without one the logins are in plain text. *Read a file in* takes such a file from any Portal-Download service or from this extension: it first shows what would be taken over as new, what is the same, and where you decide, field by field, which side to keep. No run is lost. So jobs move between the local store and a service, or between services.

## License

Apache License 2.0, see [LICENSE](LICENSE).
