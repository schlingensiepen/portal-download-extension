# Portal-Download browser extension

> [!IMPORTANT]
> **Warum es das gibt.** Rechnungen, Bescheide und Abrechnungen kommen bei vielen Unternehmen nicht mehr per Post oder E-Mail, sondern liegen nur noch in einem Portal, aus dem ich sie mir selbst holen muss. Das ist eine absolute Unart. Jedes Unternehmen hat sein eigenes Portal, ein einheitliches Verfahren gibt es nicht, und der einzige Grund, den ich mir dafür vorstellen kann, ist die Einbildung, so ließe sich die Zustellung beweisen. Mich nervt das gewaltig. portal-download löst das Problem nicht, es macht es für mich nur erträglicher, und zufrieden bin ich damit nicht. Die [GitHub-Diskussionen](https://github.com/schlingensiepen/portal-download-extension/discussions) sind offen und werden gelesen: Tragt dort bitte Erfahrungen, Wünsche, Verbesserungsvorschläge und Bugs ein.

> [!NOTE]
> **Why this exists.** Invoices, notices and statements from many companies no longer come by post or e-mail; they sit in a portal, and I have to fetch them myself. That is an utter bad habit. Every company has its own portal, there is no common procedure, and the only reason I can think of is the belief that this proves delivery. It annoys me enormously. portal-download does not solve the problem; it only makes it bearable for me, and I am not happy with it. The [GitHub discussions](https://github.com/schlingensiepen/portal-download-extension/discussions) are open and read: please post your experience, wishes, suggestions and bugs there.

![The extension's side panel beside a portal (made up for the picture)](store/screenshot-1-en.png)

The extension shows your due portal downloads in one list in the browser's side panel. The portal opens in a normal tab beside it. You copy the login with one click, let the extension find the documents in the portal page and download them one after the other, and close the run as succeeded or failed.

It works in two ways, also both at once:

- **Without any server:** the jobs are kept in this browser only, in an encrypted **local store**.
- **With a [Portal-Download](https://github.com/schlingensiepen/portal-download) service:** a small circle of people shares one list of jobs. Somebody in the circle runs the service.

A **backend** is one source of jobs: a service, or the local store. A **job** is one portal with its login and its schedule. The [glossary](https://github.com/schlingensiepen/portal-download/blob/main/docs/glossary.md) explains the other words.

The extension is for Chrome and Edge 121 or newer, and Firefox 140 or newer.

## Installing

**Firefox:** install it from [addons.mozilla.org](https://addons.mozilla.org/); search for *Portal-Download* there. Mozilla reviewed and signed it.

A [release](https://github.com/schlingensiepen/portal-download-extension/releases) may also carry the same signed file as `portal-download-<version>.xpi`. To install that file:

1. Download it.
2. Open `about:addons`.
3. In the gear menu, choose *Install Add-on From File…* and pick the file.

**Chrome and Edge:** load it from the ZIP file of a [release](https://github.com/schlingensiepen/portal-download-extension/releases).

1. Download `portal-download-<version>.zip`.
2. Unpack it into a folder that stays. The browser loads the extension from that folder at every start.
3. Open `chrome://extensions` (Edge: `edge://extensions`).
4. Switch on *Developer mode*.
5. Click *Load unpacked* and choose the folder.

The browser reminds you now and then that a developer extension is active. It may also list two manifest keys it does not know; they are for Firefox. Both are harmless.

**The toolbar button** opens the side panel (Firefox: the sidebar). In Chrome and Edge, pin it first: click the puzzle piece in the toolbar, then the pin beside *Portal-Download*.

**Permissions.** The extension asks for these:

| Permission | What for |
|---|---|
| `storage`, `unlimitedStorage` | Keeping your backends and the local store in the browser's storage for this extension. |
| `sidePanel` | Showing the panel beside the page. |
| `tabs` | Reading the address and title of the active tab, and opening a portal in a new tab. |
| `scripting` | Reading a portal page to find documents, highlighting them and clicking their buttons, only when you click *Find documents on this page* or *Start downloading*. |
| access to one address, asked for later | Reaching a service, or searching a portal's pages. The browser asks when you add that service, or the first time you search that portal, and for that address only. |
| `downloads`, asked for later | Downloading the documents found. The browser asks the first time you click *Start downloading*. If you decline, the extension only highlights. |

While the panel is open, it follows the address and title of the tab you are looking at, in memory only. It needs them at hand when you click **+** or *Add the current page as a job*. It neither stores nor sends them. The browser's wording *read your browsing history* is its general text for the `tabs` permission.

## The panel

| Where | What |
|---|---|
| Top, left | **The backend menu.** *All* shows the jobs of every backend in one list. Choosing one backend shows its jobs only. |
| Top, **+** | Add a service or a local store. |
| Top, **⚙** | Manage the chosen backend: exchange jobs as a file, and more. Choose one backend first; under *All* the button is greyed out. |
| Middle | The list of jobs, the most urgent first. Under *All*, each job names its backend. |
| Foot | *Project page*, *Feedback*, the version, and after it **the language menu**: a drop-down list whose first entry is *As the browser*. |

Some things concern one backend and are greyed out under *All*: *Add the current page as a job* and **⚙**.

## Start without a server

You need no service to use the extension.

1. Click the toolbar button. The panel says *No backend yet*.
2. Click *Add a service or a local store*, or **+** at the top.
3. Under *Keep jobs in this browser*, enter a passphrase of at least ten characters, twice.
4. Click *Create the local store*. The backend menu now shows *This browser*.

**A forgotten passphrase cannot be recovered.** Export the jobs now and then; see [Exchanging jobs](#exchanging-jobs).

## Your first job

1. **Choose a backend** in the backend menu, for example *This browser*.
2. **Open the portal's login page** in a tab.
3. **Click *Add the current page as a job*.** The form *New job* opens. The title and the address come from the tab.
4. **Fill in the form** and click *Create*:

   | Field | Meaning |
   |---|---|
   | *Title* | The name in the list. |
   | *Entry page (URL)* | The portal's address. |
   | *Every how many weeks?* | How often the download is due. Four weeks unless you change it. |
   | *After a failure, days* | When to try again after a failed run. Two days unless you change it. |
   | *Username*, *Password* | The portal login. |
   | *Instructions* | A note for yourself: what to file where. |

   The job is due today and appears in the list.
5. **Click the job** in the list.
6. **Click *Open the portal in a new tab*.** The panel stays beside the portal.
7. **Copy the login.** Click *Copy* beside the username, paste it into the portal, and do the same for the password. *Show* reveals the password.
8. **Download** what you came for: see [Documents in the portal](#documents-in-the-portal), or download by hand.
9. **Close the run.** Click *Succeeded* or *Failed*. The button asks *Really?*; click it again within four seconds. You can write a note first.

The panel then says *Closed – due again on …*. After *Succeeded* that is today plus the weeks; after *Failed*, today plus the retry days. *Next job* returns to the list.

*Edit* and *Delete* under a job change or remove it.

## Adding a service

Somebody who runs a Portal-Download service gives you an invitation link.

1. **Make your computer trust the service's certificate first.** Follow the [certificate instructions](https://github.com/schlingensiepen/portal-download/blob/main/docs/install.md#certificates) of the service. Chrome and Edge do not count a certificate that was only accepted on a warning page.
2. Open the invitation link in a tab. The page *Accept the invitation* appears. Leave it as it is; you need not accept anything on that page.
3. Click **+** in the panel, then *Take the invitation from the current tab*.
4. The browser asks whether the extension may access the service's address. Allow it.

The backend menu now shows the service, and the list shows its jobs. The extension alone is enough: you need not sign in to the service's web application first.

- If you already use the service's web application, open **My devices** there and click **Add to the browser extension** instead of step 2. That link serves once, within the hour.
- The extension gets an access of its own, named after the browser and the system. It shows up among your devices in the service and can be revoked there.
- On a service, the logins are kept in plain text and are visible to everybody who uses it.
- If the panel says the service cannot be reached, check step 1.

Under **⚙** of a service you find *Open the web application*. People, devices, agents and the full backup of a service are managed there.

## The local store

The local store keeps its jobs in this browser only, encrypted with the passphrase.

- The **passphrase** protects the store. A **password** protects an exported file. They are two different things.
- Once the local store exists, the tokens of your services lie under the passphrase too.
- The extension asks for the passphrase once after every start of the browser.
- Without a local store, the tokens of your services lie unencrypted in the browser's storage, as a browser keeps its cookies.

Under **⚙** of *This browser*:

| Action | What it does |
|---|---|
| *Export the jobs*, *Read a file in* | Writes the jobs to a file, or takes jobs from a file. See [Exchanging jobs](#exchanging-jobs). |
| *Change the passphrase* | Sets a new passphrase. |
| *Lock now* | Locks the store at once. |
| *Delete the local store* | Deletes the store with its jobs. The services stay, and their tokens lie unencrypted again. Export the jobs first. |

**If you forgot the passphrase,** the unlock card offers *Forgot the passphrase?* and there *Delete the store and the services*. This deletes the local store with its jobs, and the services' tokens in this browser. Your accesses stay valid on the services, though. Revoke them in each service's web application under **My devices**, then add the services again with new links.

## Exchanging jobs

Jobs travel as a ZIP file between backends: from the local store to a service, between two services, or to another browser. Choose a backend, then click **⚙**.

**Export the jobs:**

- **With a password:** enter a password for the file and click *Download encrypted*. The file is encrypted with AES-256.
- **Without a password:** click *Download without password*. The button then reads *Logins in plain text – really?*. Click it a second time within four seconds; otherwise nothing is written.

The local store must be unlocked for this. While it is locked, the panel shows only the unlock card.

The file is named `portal-download-jobs-<date>.zip`. The browser saves it where it saves downloads. It holds every job with its login, its history and the deleted jobs. **Without a password, the logins in it are in plain text.**

The password has 8 to 200 characters: letters A to Z and a to z, digits, punctuation and spaces. Umlauts and other non-ASCII characters are not allowed, nor a space at either end.

**Read a file in:**

1. Under *Read a file in*, choose a file from this extension or from any Portal-Download service. Enter its password, if it has one.
2. Click *Show what would change*. Nothing is changed yet.
3. The preview shows three groups: *Taken over, because new*, *Taken over, because the same*, and *Please decide*.
4. For the jobs of the third group, choose per field between *Here* and *In the file*. The newer side is chosen for you; for a due date, the nearer one.
5. Click *Read in*.

No run is lost. Reading in copies. To move jobs, read them in on the other backend and then delete them where they were. A deleted job stays deleted on both sides when files travel again.

## Updating

- **Firefox, installed from addons.mozilla.org:** Firefox updates the extension by itself.
- **Firefox, installed from the `.xpi` file:** if Firefox does not update it, install the newer file the same way.
- **Chrome and Edge:** download the new ZIP file. Replace the content of the folder with it. Then click the reload arrow on the extension's card under `chrome://extensions`.

Your backends and jobs stay.

**Versions of the interface.** The extension and a service must speak the same version of the interface. This extension speaks version 0.8, as services of version 0.8 and 0.9 do. So extensions 0.8, 0.9 and 1.0 work with both.

A later version may change the interface. Suppose a service then speaks a version 1.1 and your extension still speaks 0.8. The panel says so and names both versions. You still see the jobs of that service, but you cannot change them, close runs or read files in. Update the side that is older.

## Removing

1. For each service: choose it in the backend menu, click **⚙**, then *Remove the service*. This also revokes the extension's access on that service.
2. Export the jobs of the local store, if you want to keep them.
3. Remove the extension on the browser's extension page.

Removing the extension deletes everything it kept in this browser. If you skipped step 1, revoke the device in the service's web application under **My devices**.

## Documents in the portal

Once you are logged in to the portal, the extension can find the documents in the page and download them for you. You log in yourself, by hand; the extension never does.

1. **Log in to the portal** and open the page with the documents, for example the list of invoices.
2. **Click *Find documents on this page*.** The button is in an open job, below *Open the portal in a new tab*; from there the files go into the job's folder. It is also in the list of jobs, for a page that belongs to no job. The first time for a portal, the browser asks whether the extension may access that site. If you decline, nothing is searched.
3. **Look at the page.** Everything that looks like a document is highlighted in yellow and numbered: links to files such as PDF, Word, Excel, TIFF, ZIP or XML, and buttons and icons that say *download*. The panel lists them with the same numbers. Click a name to scroll to it.
4. **Choose.** Ticked are the documents that are new and surely downloads. Untick what is no document, or use *Tick all* (which leaves the doubtful ones alone) and *Tick none*. Not ticked, with a note, are: documents downloaded from this job before (with their date), buttons that only say *PDF* or *Export* or send a form, and an address found twice.
5. **Click *Start downloading*,** or *Only this one* beside a single document. The first time, the browser asks for the permission to download. The extension then works through the list one document at a time, slowly, and shows beside each what happened. *Stop* ends it at once; a download already under way may still finish. Leaving this view stops it too.
6. **More pages:** if the portal spreads its documents over several pages, open the next page and search again.

**Where the files go:** into the folder *Portal-Download/<job title>* inside the folder your browser saves downloads to (usually *Downloads*); for a page without a job, into *Portal-Download/<site>*. Documents downloaded before are remembered per job, or per site for pages without a job.

- **Links** are downloaded with the browser's download function and your login cookies of the portal.
- **Buttons** are clicked in the page, as you would. The first download from the portal that follows counts as that document. If the button opens a new tab, a download from that tab counts; else the extension downloads the tab's address and closes the tab.
- **In Firefox,** documents from buttons, and links whose address names no file, land in the download folder itself, not in the *Portal-Download* subfolder. Firefox lets an extension choose the subfolder only when the file name is known before the download starts.

**What the panel says beside a document:**

| Message | Meaning | What to do |
|---|---|---|
| *Saved as …* | Downloaded; the file name in the folder. | Nothing. |
| *Downloaded on …* | Downloaded from this job before; not ticked. | Tick it to download it again. |
| *Not ticked: it may not be a download* | A button that only says *PDF* or *Export*, or one that sends a form. | Tick it if you are sure. |
| *Found twice; ticked only once* | The same address stands twice in the page. | Nothing. |
| *it opened a tab without a document* | The button opened a tab, but no document came from it. The tab stays open. | Look at the tab; download by hand. |
| *the click started no download* | The button did nothing the browser counted as a download within 20 seconds. Some portals block automatic clicks, or open a pop-up the browser blocks; Chrome may also ask once whether the site may download several files. | Download it by hand. |
| *a web page came back instead of a document* | Usually the login expired. The page was deleted again. | Log in again, search again. |
| *the page went to another address* | The click left the page or loaded it anew; the rest is stopped. | Go back to the list and search again. |
| *the element is no longer in the page* | The page changed since the search. | Search again. |
| *stopped* | You clicked *Stop*, or left this view. The browser may still finish this one download. | Start again for the rest. |
| *still not finished after five minutes* | A very large or stuck download. | Look at the browser's downloads. |
| other words, such as *NETWORK_FAILED* | The browser's own reason. | Try again later, or by hand. |

A document that failed stays ticked, so that *Start downloading* tries it again.

**What it never does:** log in, fill in a form, or click anything whose words name an action such as delete, remove, save, send, upload, cancel, order or pay, or fetch an address that names one. A button that sends a form, or says *download* and an action at once, is only offered unticked, for you to decide. It works only when you click. It remembers which documents were downloaded, per job, in this browser only, as checksums that name no address and no document; *Forget which documents were downloaded* at the end of the list clears that for the job. Closing the panel takes the highlighting off the page and ends the downloads.

**Close the run** afterwards as before, with *Succeeded* or *Failed*; downloading does not close it.

## Languages

English, German, French, Spanish, Portuguese (Brazil and Portugal) and Chinese (simplified and traditional).

- The panel follows the browser's language. The language menu at the panel's foot chooses another one.
- The translations other than English and German were made by machine. Corrections are welcome. Each language has an issue of its own in the issues list: <https://github.com/schlingensiepen/portal-download-extension/issues>. The [discussions](https://github.com/schlingensiepen/portal-download-extension/discussions) are open too.
- Messages that come from a service are in English. So are some messages of the local store about input it refuses.

## Privacy

The extension collects no data. Everything stays in the browser, or goes to a Portal-Download service that you or your circle run yourselves. The author receives nothing. Details are in [PRIVACY.md](PRIVACY.md).

## Safari

Ich bitte um Verständnis, dass ich für ein kleines Hobbyprojekt nicht in das Apple Developer Program investiere. Ich habe aber gehört, dass Firefox und Chrome sehr gut auf Apple-Geräten laufen.

*Please understand that I am not paying for the Apple Developer Program for a small hobby project. I have heard, though, that Firefox and Chrome run very well on Apple devices.*

## Edge Add-ons

Wegen der Unbenutzbarkeit des Microsoft Partner Center musste der Eintrag bei Edge Add-ons leider verschoben werden. Bis dahin lädt Edge die ZIP-Datei aus den Releases wie Chrome.

*Because the Microsoft Partner Center proved unusable, the listing on Edge Add-ons had to be postponed. Until then, Edge loads the ZIP file from the releases, as Chrome does.*

## License

Apache License 2.0, see [LICENSE](LICENSE).
