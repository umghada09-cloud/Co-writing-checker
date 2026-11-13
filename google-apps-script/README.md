# Eval on Google Apps Script

This is build 64 of Eval (the Writing Grader), changed to run as a Google Apps Script web app. The original build 64 is kept unchanged in `../eval-build-64/index.html`.

The app looks and works the same. Only the server part moved into Google:

| Website version | Apps Script version |
|---|---|
| `config.js` | the open / access-code setting is written into the page by `Code.gs` |
| server route `api/check` | `checkCode()` in `Code.gs` |
| server route `api/messages` | `callClaude()` in `Code.gs`, which sends the request to Claude |
| Claude key on the server | Claude key in **Script properties**, never sent to the browser |
| `vendor/xlsx.full.min.js`, `vendor/heic2any.min.js` | the same libraries, loaded from a CDN |
| app icons and `manifest.webmanifest` | not used (Apps Script cannot serve them) |

## The files

| File in this folder | In the Apps Script editor |
|---|---|
| `Code.gs` | `Code.gs` |
| `Index.html` | HTML file named `Index` |
| `Styles.html` | HTML file named `Styles` |
| `JavaScript.html` | HTML file named `JavaScript` |
| `appsscript.json` | the project manifest |

## Setting it up (about 10 minutes)

1. Go to **script.google.com** and click **New project**. Rename it **Eval**.
2. **Code.gs:** delete what is in the editor and paste all of `Code.gs`.
3. **The three HTML files:** click **+** next to *Files*, choose **HTML**, and name it `Index` (without `.html`). Paste all of `Index.html`. Do the same for `Styles` and `JavaScript`.
   The names must match exactly, because `Index` pulls in the other two by name.
4. **Manifest:** open **Project Settings** (the gear icon) and tick **Show "appsscript.json" manifest file in editor**. Back in the editor, open `appsscript.json` and replace its contents with this folder's `appsscript.json`.
5. **Script properties:** in **Project Settings**, scroll down to **Script properties** and add:
   - `ANTHROPIC_API_KEY`: your Claude API key from console.anthropic.com (it starts with `sk-ant-`).
   - `ACCESS_CODES`: one or more codes for teachers, separated by commas, e.g. `eng-team-3, maths-7`.
   - Optional: `OPEN` = `true` lets anyone use the site with no code, and `DAILY_LIMIT` (default 500) caps the Claude calls per day. Only use `OPEN` if you accept that every visitor spends your credit.
6. **Deploy:** click **Deploy → New deployment**. Click the gear next to *Select type* and choose **Web app**. Then set:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Click **Deploy**. Google asks you to authorise the script: it needs permission to connect to an external service (Claude). On a personal Gmail account, Google may warn that the app isn't verified: click **Advanced → Go to Eval**.
7. Copy the **Web app URL** (it ends in `/exec`). That is the address teachers open. On the home screen, they enter one of the access codes under **Reading handwriting**.

## Updating it later

After editing any file, click **Deploy → Manage deployments**, click the pencil, choose **Version: New version**, and click **Deploy**. The URL stays the same.

To turn a newer build of the website version into these files, run:

```
python3 tools/convert.py <new index.html> .
```

The script stops with a message if the new build changed the parts it relies on.

## Good to know

- **Classes and marks stay in each teacher's browser**, as on the website. The Apps Script address is a new site, so it starts empty. Export marks from the old site first (**Export to gradebook** on the class page), then import the gradebook here.
- **Cost:** every paper read and graded is charged to the Claude key in Script properties. Keep the access codes private.
- **Limits:** Google limits how long one request may take. A paper with many pages may hit that limit; if one fails, it goes to Needs Review and can be read again. Free Gmail accounts can also make fewer outside requests per day than Google Workspace (school) accounts. Check Google's current quotas if a large school will use it.
- **Answer length:** `Code.gs` gives Claude room for up to 8,000 tokens, so it can think before answering without being cut off. You are only charged for the tokens it actually uses.
- Google adds a small banner at the top of web apps made with free Gmail accounts. School Workspace accounts don't show it.
