# Privacy / Datenschutz

**Portal-Download browser extension** · contact: addons@schlingensiepen.com

## English

The extension collects no data. It has no analytics, no telemetry, no advertising and no servers of its author. **Everything stays in your browser, or goes to a Portal-Download service that you, or the people you trust with it, run yourselves.** The author never receives any of it.

### What the extension does

- **What it keeps, and where:** the services you add (their address and the extension's own access token) and, if you create one, the local store of jobs (titles, portal addresses, logins, notes, history). All of it lies in the browser's storage for this extension on your computer.
- **With a local store,** all of it is encrypted with your passphrase (AES-GCM, key from PBKDF2-SHA256). The unlocked key is kept only until the browser closes.
- **Without a local store,** the access tokens of your services lie unencrypted in the browser's storage, as a browser keeps its cookies. Whoever can read your browser profile can use them.
- **What it sends, and to whom:** requests go only to the Portal-Download services you added yourself, with that service's token, to list and change your jobs there. Nothing goes to anyone else.
- **Your language choice** is kept in the browser's storage for this extension, unencrypted, as it is no secret.
- **What it reads:** the address and title of the active tab. While the panel is open, it reads them whenever you switch tabs or a tab loads a page. It needs them at hand for **+** (to take an invitation link) and for *Add the current page as a job*: Firefox grants a permission only as the first step of a click. It keeps them in memory only, and neither stores nor sends them. It reads no page content and no browsing history.
- **Clipboard:** it writes a username or password to the clipboard only when you click *Copy*.
- **Files:** an exported file is written only when you ask for it. With a password it is encrypted with AES-256. **Without a password it holds the portal logins in plain text**; the extension asks before it writes such a file.
- **Removing:** removing the extension deletes everything it kept in this browser. Remove a service first under ⚙ to also revoke the extension's access on that service.

### What a service holds

A Portal-Download service is self-hosted software. It runs on a machine of your own or of your circle; it is not a service of the author.

- **On a service, the portal logins lie in plain text in its store.** Every person of the circle sees them. Whoever operates the service, or can read its store or a backup without a password, can read them too.
- **A service also records** the people of the circle: name, optional e-mail, rights, and who invited whom. For each device it records the name you give it, the browser's identification, the address it last came from and when it was last seen. It records who closed which run.
- The service's own documentation describes this: [operating.md](https://github.com/schlingensiepen/portal-download/blob/main/docs/operating.md).

If you do not want that, keep your jobs in the local store. It needs no service.

### How to check this

- **The source** is public: <https://github.com/schlingensiepen/portal-download-extension>. The extension loads no code from elsewhere.
- **The Firefox file** is signed by Mozilla and offered on addons.mozilla.org.
- **The ZIP file** for Chrome and Edge is built by the repository's public CI from the tagged source. The [releases](https://github.com/schlingensiepen/portal-download-extension/releases) link each file to its tag, and the [workflow](https://github.com/schlingensiepen/portal-download-extension/blob/main/.github/workflows/ci.yml) shows the steps.
- **In the browser,** the developer tools of the panel show every request it sends.

## Deutsch

Die Erweiterung erhebt keine Daten. Es gibt keine Analyse, keine Telemetrie, keine Werbung und keine Server des Autors. **Alles bleibt in Deinem Browser oder geht an einen Portal-Download-Dienst, den Du selbst betreibst oder die Menschen, denen Du ihn anvertraust.** Der Autor erhält nichts davon.

### Was die Erweiterung tut

- **Was sie speichert, und wo:** die Dienste, die Du hinzufügst (deren Adresse und den eigenen Zugangstoken der Erweiterung), und, wenn Du ihn anlegst, den lokalen Speicher mit Vorgängen (Titel, Portaladressen, Zugangsdaten, Notizen, Verlauf). Alles liegt im Speicher des Browsers für diese Erweiterung auf Deinem Computer.
- **Mit lokalem Speicher** ist alles mit Deiner Passphrase verschlüsselt (AES-GCM, Schlüssel aus PBKDF2-SHA256). Der entsperrte Schlüssel bleibt nur, bis der Browser geschlossen wird.
- **Ohne lokalen Speicher** liegen die Zugangstoken Deiner Dienste unverschlüsselt im Speicher des Browsers, so wie ein Browser seine Cookies aufbewahrt. Wer Dein Browserprofil lesen kann, kann sie benutzen.
- **Was sie sendet, und an wen:** Anfragen gehen nur an die Portal-Download-Dienste, die Du selbst hinzugefügt hast, mit dem Token dieses Dienstes, um Deine Vorgänge dort zu lesen und zu ändern. An niemanden sonst.
- **Deine Sprachwahl** liegt unverschlüsselt im Speicher des Browsers für diese Erweiterung, denn sie ist kein Geheimnis.
- **Was sie liest:** Adresse und Titel des aktiven Tabs. Solange das Panel offen ist, liest sie beides, sobald Du den Tab wechselst oder ein Tab eine Seite lädt. Sie braucht beides griffbereit für **+** (um einen Einladungslink zu übernehmen) und für *Aktuelle Seite als Vorgang eintragen*: Firefox erteilt eine Berechtigung nur als ersten Schritt eines Klicks. Sie behält beides nur im Arbeitsspeicher und speichert und sendet es nicht. Sie liest keine Seiteninhalte und keinen Verlauf.
- **Zwischenablage:** Benutzername oder Passwort kommen nur auf Klick auf *Kopieren* in die Zwischenablage.
- **Dateien:** Eine Exportdatei entsteht nur auf Deinen Wunsch. Mit Passwort ist sie mit AES-256 verschlüsselt. **Ohne Passwort enthält sie die Portal-Zugangsdaten im Klartext**; die Erweiterung fragt nach, bevor sie eine solche Datei schreibt.
- **Entfernen:** Wer die Erweiterung entfernt, löscht alles, was sie in diesem Browser gespeichert hat. Entferne vorher einen Dienst unter ⚙, damit auch der Zugang der Erweiterung dort widerrufen wird.

### Was ein Dienst speichert

Ein Portal-Download-Dienst ist selbst betriebene Software. Er läuft auf einem eigenen Rechner oder dem Deines Kreises; er ist kein Dienst des Autors.

- **Auf einem Dienst liegen die Portal-Zugangsdaten im Klartext in dessen Speicher.** Jede Person des Kreises sieht sie. Wer den Dienst betreibt oder dessen Speicher oder eine Sicherung ohne Passwort lesen kann, kann sie ebenfalls lesen.
- **Ein Dienst hält außerdem fest:** die Personen des Kreises mit Name, optional E-Mail und Rechten, und wer wen eingeladen hat. Zu jedem Gerät hält er den Namen fest, den Du ihm gibst, die Kennung des Browsers, die Adresse, von der es zuletzt kam, und wann es zuletzt gesehen wurde. Er hält fest, wer welchen Lauf abgeschlossen hat.
- Die Dokumentation des Dienstes beschreibt das (auf Englisch): [operating.md](https://github.com/schlingensiepen/portal-download/blob/main/docs/operating.md).

Wenn Du das nicht möchtest, behalte Deine Vorgänge im lokalen Speicher. Er braucht keinen Dienst.

### Wie Du das prüfen kannst

- **Der Quelltext** ist öffentlich: <https://github.com/schlingensiepen/portal-download-extension>. Die Erweiterung lädt keinen Code von anderswo.
- **Die Firefox-Datei** ist von Mozilla signiert und wird auf addons.mozilla.org angeboten.
- **Die ZIP-Datei** für Chrome und Edge baut die öffentliche CI des Repositorys aus dem getaggten Quelltext. Die [Releases](https://github.com/schlingensiepen/portal-download-extension/releases) verknüpfen jede Datei mit ihrem Tag, und der [Workflow](https://github.com/schlingensiepen/portal-download-extension/blob/main/.github/workflows/ci.yml) zeigt die Schritte.
- **Im Browser** zeigen die Entwicklerwerkzeuge des Panels jede Anfrage, die es sendet.
