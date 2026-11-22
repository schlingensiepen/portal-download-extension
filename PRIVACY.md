# Privacy / Datenschutz

**Portal-Download browser extension** · contact: addons@schlingensiepen.com

## English

The extension collects no data. It has no analytics, no telemetry, no advertising and no servers of its author. **Everything stays in your browser, or goes to a Portal-Download service that you, or the people you trust with it, run yourselves.** The author never receives any of it.

### What the extension does

- **What it keeps, and where:** the services you add (their address and the extension's own access token) and, if you create one, the local store of jobs (titles, portal addresses, logins, notes, history). All of it lies in the browser's storage for this extension on your computer.
- **With a local store,** all of it is encrypted (AES-GCM) with a random key, which in turn is encrypted with your passphrase (PBKDF2-SHA256), as password managers do it. The unlocked key is kept only until the browser closes.
- **Without a local store,** the access tokens of your services lie unencrypted in the browser's storage, as a browser keeps its cookies. Whoever can read your browser profile can use them.
- **What it sends, and to whom:** requests go only to the Portal-Download services you added yourself, with that service's token, to list and change your jobs there. Nothing goes to anyone else.
- **Your language choice** is kept in the browser's storage for this extension, unencrypted, as it is no secret.
- **Documents in a portal:** only when you click *Find documents on this page*, the extension reads the page in the active tab (with your permission for that site) to find links and buttons that look like documents, and highlights them. When you click *Start downloading*, it downloads them with the browser's download function, with your login cookies of the portal, into your download folder, and clicks buttons in the page as you would. The page's content, the documents and the cookies go nowhere else: not to a service, not to the author.
- **Feedback on a portal:** only when you click *Something missing or wrong? Show me how you download* and then *Start watching*, the extension notes your own clicks in the active tab, its frames and the pages it loads, and in a tab opened from it within five seconds after a click (in Chrome also one you open yourself in that moment). It needs access to the site and the downloads permission; that permission stays until you remove it in the browser's extension settings. For each click the text says what kind of element it was (link, button or another element by its tag and role), its words (the text of a link or button; of other elements only a short text; else its label), a few yes-or-no marks (download attribute, opens a new tab, script in its markup, icon, frame, shadow DOM, hand cursor) and what the search made of it; then whether a new page loaded or a tab opened, and that a download started, as its kind and size only. The text takes no address, file name, id, class name or script text from the element or the download, and never the content of a field or an entry chosen from a list the browser knows as one. Watching ends at the first download, after two minutes, or when you stop it, close the tab or leave the view; the text holds the last five clicks. In the words, every run of digits becomes `#`, every e-mail address `[e-mail]`, an address written as words `[address]` and a long mix of letters and digits `[long]`; a name cannot be recognised, so read the text and delete anything personal; you can edit it. With *Name the portal* unticked, the text does not name the site. The notes pass from the page to the panel inside the extension and are kept in memory only. Nothing is sent: you decide whether to copy the text and post it in the feedback form on GitHub, which needs a GitHub account and is public.
- **Which documents were downloaded** is kept per job in the browser's storage for this extension, as SHA-256 checksums with the date of the download, unencrypted: they name no address, no document and no job. It is not sent to a service.
- **What it reads:** the address and title of the active tab. While the panel is open, it reads them whenever you switch tabs or a tab loads a page. It needs them at hand for **+** (to take an invitation link) and for *Add the current page as a job*. The browser lets the extension ask for access to a service only at the very moment of your click, so the address must be known by then. It keeps them in memory only, and neither stores nor sends them. It reads no browsing history, and the content of a page only as described under *Documents in a portal* and *Feedback on a portal*.
- **Clipboard:** it writes a username or password to the clipboard only when you click *Copy*.
- **Files:** an exported file is written only when you ask for it. With a password it is encrypted with AES-256. **Without a password it holds the portal logins in plain text**; the extension asks before it writes such a file.
- **Removing:** removing the extension deletes everything it kept in this browser. Remove a service first under ⚙ to also revoke the extension's access on that service.

### What a service holds

A Portal-Download service is self-hosted software. It runs on a machine of your own or of your circle; it is not a service of the author.

- **On a service, the portal logins lie in plain text in its store.** Every person of the circle sees them. Whoever operates the service, or can read its store or a backup without a password, can read them too.
- **A service also records** the people of the circle: name, optional e-mail, rights, and who invited whom. For each device it records the name you give it, the browser's identification, the address it last came from and when it was last seen. It records who closed which run.
- The service's own documentation describes this: [operating.md](https://github.com/schlingensiepen/portal-download/blob/main/docs/operating.md).
- **Installing a service's certificate authority is a decision to trust its operator.** Your computer then accepts certificates from that authority. The authority is limited to the service's name and its subdomains. See the [certificate instructions](https://github.com/schlingensiepen/portal-download/blob/main/docs/install.md#certificates).

If you do not want that, keep your jobs in the local store. It needs no service.

### How to check this

- **The source** is public: <https://github.com/schlingensiepen/portal-download-extension>. The extension loads no code from elsewhere.
- **The Firefox file** is submitted to addons.mozilla.org; Mozilla signs it and offers it there after its review.
- **The ZIP file** for Chrome and Edge is built by the repository's public CI from the tagged source. The [releases](https://github.com/schlingensiepen/portal-download-extension/releases) link each file to its tag, and the [workflow](https://github.com/schlingensiepen/portal-download-extension/blob/main/.github/workflows/ci.yml) shows the steps.
- **Checksums:** a release carries the file `SHA256SUMS` with the SHA-256 checksums of its files. Compare them with the checksum of the file you downloaded.
- **In the browser,** the developer tools of the panel show every request it sends.

## Deutsch

Die Erweiterung erhebt keine Daten. Es gibt keine Analyse, keine Telemetrie, keine Werbung und keine Server des Autors. **Alles bleibt in Deinem Browser oder geht an einen Portal-Download-Dienst, den Du selbst betreibst oder die Menschen, denen Du ihn anvertraust.** Der Autor erhält nichts davon.

### Was die Erweiterung tut

- **Was sie speichert, und wo:** die Dienste, die Du hinzufügst (deren Adresse und den eigenen Zugangstoken der Erweiterung), und, wenn Du ihn anlegst, den lokalen Speicher mit Vorgängen (Titel, Portaladressen, Zugangsdaten, Notizen, Verlauf). Alles liegt im Speicher des Browsers für diese Erweiterung auf Deinem Computer.
- **Mit lokalem Speicher** ist alles mit einem zufälligen Schlüssel verschlüsselt (AES-GCM), der seinerseits mit Deiner Passphrase verschlüsselt ist (PBKDF2-SHA256), wie es Passwortmanager machen. Der entsperrte Schlüssel bleibt nur, bis der Browser geschlossen wird.
- **Ohne lokalen Speicher** liegen die Zugangstoken Deiner Dienste unverschlüsselt im Speicher des Browsers, so wie ein Browser seine Cookies aufbewahrt. Wer Dein Browserprofil lesen kann, kann sie benutzen.
- **Was sie sendet, und an wen:** Anfragen gehen nur an die Portal-Download-Dienste, die Du selbst hinzugefügt hast, mit dem Token dieses Dienstes, um Deine Vorgänge dort zu lesen und zu ändern. An niemanden sonst.
- **Deine Sprachwahl** liegt unverschlüsselt im Speicher des Browsers für diese Erweiterung, denn sie ist kein Geheimnis.
- **Dokumente in einem Portal:** Nur wenn Du auf *Dokumente auf dieser Seite finden* klickst, liest die Erweiterung die Seite im aktiven Tab (mit Deiner Erlaubnis für diese Website), um Links und Knöpfe zu finden, die nach Dokumenten aussehen, und markiert sie. Klickst Du auf *Herunterladen starten*, lädt sie diese mit der Download-Funktion des Browsers und Deinen Anmelde-Cookies des Portals in Deinen Download-Ordner und klickt Knöpfe in der Seite so, wie Du es tun würdest. Seiteninhalt, Dokumente und Cookies gehen nirgendwo anders hin: nicht an einen Dienst, nicht an den Autor.
- **Rückmeldung zu einem Portal:** Nur wenn Du auf *Fehlt etwas oder stimmt etwas nicht? Zeig mir, wie du herunterlädst* und dann auf *Zuschauen beginnen* klickst, notiert die Erweiterung Deine eigenen Klicks im aktiven Tab, in seinen Frames und den Seiten, die er lädt, und in einem Tab, der innerhalb von fünf Sekunden nach einem Klick aus ihm geöffnet wird (in Chrome auch einem, den Du in diesem Moment selbst öffnest). Sie braucht dafür Zugriff auf die Website und die Berechtigung für Downloads; diese Berechtigung bleibt, bis Du sie in den Erweiterungs-Einstellungen des Browsers entfernst. Zu jedem Klick sagt der Text, welche Art Element es war (Link, Knopf oder ein anderes Element mit seinem Tag und seiner Rolle), seine Worte (der Text eines Links oder Knopfs; bei anderen Elementen nur ein kurzer Text; sonst seine Beschriftung), einige Ja-Nein-Merkmale (download-Attribut, öffnet einen neuen Tab, Skript im Markup, Icon, Frame, Shadow DOM, Hand-Cursor) und was die Suche daraus gemacht hat; danach, ob eine neue Seite geladen oder ein Tab geöffnet wurde, und dass ein Download begann, nur mit Art und Größe. Adressen, Dateinamen, ids, Klassennamen und Skripttext übernimmt der Text weder aus dem Element noch aus dem Download, und nie den Inhalt eines Felds oder einen Eintrag, den Du aus einer Liste wählst, die der Browser als solche kennt. Das Zuschauen endet beim ersten Download, nach zwei Minuten oder wenn Du es beendest, den Tab schließt oder die Ansicht verlässt; im Text stehen die letzten fünf Klicks. In den Worten wird jede Ziffernfolge zu `#`, jede E-Mail-Adresse zu `[e-mail]`, eine als Worte geschriebene Adresse zu `[address]` und eine lange Mischung aus Buchstaben und Ziffern zu `[long]`; einen Namen kann sie nicht erkennen, darum lies den Text und lösche alles Persönliche; Du kannst ihn bearbeiten. Ohne das Häkchen bei *Das Portal nennen* nennt der Text die Website nicht. Die Notizen gehen innerhalb der Erweiterung von der Seite an das Panel und liegen nur im Arbeitsspeicher. Nichts wird gesendet: Du entscheidest, ob Du den Text kopierst und im Rückmeldeformular auf GitHub veröffentlichst; das braucht ein GitHub-Konto und ist öffentlich.
- **Welche Dokumente schon geladen wurden,** liegt je Vorgang im Speicher des Browsers für diese Erweiterung, nur als SHA-256-Prüfsummen mit dem Datum des Downloads, unverschlüsselt: Sie nennen keine Adresse, kein Dokument und keinen Vorgang. Sie gehen an keinen Dienst.
- **Was sie liest:** Adresse und Titel des aktiven Tabs. Solange das Panel offen ist, liest sie beides, sobald Du den Tab wechselst oder ein Tab eine Seite lädt. Sie braucht beides griffbereit für **+** (um einen Einladungslink zu übernehmen) und für *Aktuelle Seite als Vorgang eintragen*. Der Browser lässt die Erweiterung nur genau im Moment Deines Klicks um Zugriff auf einen Dienst bitten; die Adresse muss dann schon bekannt sein. Sie behält beides nur im Arbeitsspeicher und speichert und sendet es nicht. Sie liest keinen Verlauf, und den Inhalt einer Seite nur so, wie unter *Dokumente in einem Portal* und *Rückmeldung zu einem Portal* beschrieben.
- **Zwischenablage:** Benutzername oder Passwort kommen nur auf Klick auf *Kopieren* in die Zwischenablage.
- **Dateien:** Eine Exportdatei entsteht nur auf Deinen Wunsch. Mit Passwort ist sie mit AES-256 verschlüsselt. **Ohne Passwort enthält sie die Portal-Zugangsdaten im Klartext**; die Erweiterung fragt nach, bevor sie eine solche Datei schreibt.
- **Entfernen:** Wer die Erweiterung entfernt, löscht alles, was sie in diesem Browser gespeichert hat. Entferne vorher einen Dienst unter ⚙, damit auch der Zugang der Erweiterung dort widerrufen wird.

### Was ein Dienst speichert

Ein Portal-Download-Dienst ist selbst betriebene Software. Er läuft auf einem eigenen Rechner oder dem Deines Kreises; er ist kein Dienst des Autors.

- **Auf einem Dienst liegen die Portal-Zugangsdaten im Klartext in dessen Speicher.** Jede Person des Kreises sieht sie. Wer den Dienst betreibt oder dessen Speicher oder eine Sicherung ohne Passwort lesen kann, kann sie ebenfalls lesen.
- **Ein Dienst hält außerdem fest:** die Personen des Kreises mit Name, optional E-Mail und Rechten, und wer wen eingeladen hat. Zu jedem Gerät hält er den Namen fest, den Du ihm gibst, die Kennung des Browsers, die Adresse, von der es zuletzt kam, und wann es zuletzt gesehen wurde. Er hält fest, wer welchen Lauf abgeschlossen hat.
- Die Dokumentation des Dienstes beschreibt das (auf Englisch): [operating.md](https://github.com/schlingensiepen/portal-download/blob/main/docs/operating.md).
- **Wer die Zertifizierungsstelle eines Dienstes installiert, entscheidet sich, dessen Betreiber zu vertrauen.** Dein Computer nimmt dann Zertifikate dieser Stelle an. Die Stelle ist auf den Namen des Dienstes und dessen Subdomains beschränkt. Siehe die [Anleitung zu Zertifikaten](https://github.com/schlingensiepen/portal-download/blob/main/docs/install.md#certificates) (auf Englisch).

Wenn Du das nicht möchtest, behalte Deine Vorgänge im lokalen Speicher. Er braucht keinen Dienst.

### Wie Du das prüfen kannst

- **Der Quelltext** ist öffentlich: <https://github.com/schlingensiepen/portal-download-extension>. Die Erweiterung lädt keinen Code von anderswo.
- **Die Firefox-Datei** wird bei addons.mozilla.org eingereicht; Mozilla signiert sie nach seiner Prüfung und bietet sie dort an.
- **Die ZIP-Datei** für Chrome und Edge baut die öffentliche CI des Repositorys aus dem getaggten Quelltext. Die [Releases](https://github.com/schlingensiepen/portal-download-extension/releases) verknüpfen jede Datei mit ihrem Tag, und der [Workflow](https://github.com/schlingensiepen/portal-download-extension/blob/main/.github/workflows/ci.yml) zeigt die Schritte.
- **Prüfsummen:** Ein Release enthält die Datei `SHA256SUMS` mit den SHA-256-Prüfsummen seiner Dateien. Vergleiche sie mit der Prüfsumme der Datei, die Du heruntergeladen hast.
- **Im Browser** zeigen die Entwicklerwerkzeuge des Panels jede Anfrage, die es sendet.
