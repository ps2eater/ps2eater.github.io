# PS2EATER site + control room

Static site for **ps2eater.github.io** with a full content dashboard.
No build step, no database, no server: everything is HTML, CSS and JSON served by GitHub Pages.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Public site. Renders the catalogue from `data.json`. |
| `data.json` | All content: site text, sections and items. Single source of truth. |
| `admin.html` | Dashboard. Reads and writes `data.json` through the GitHub API. |
| `admin.css` / `admin.js` | Dashboard styles and logic. |
| `style.css` | Public site styles. |
| `logo.png` | Logo used in the hero, nav and dashboard. |
| `assets/` | Images uploaded from the dashboard (created on first upload). |

## Publishing from the dashboard

1. Open `https://ps2eater.github.io/admin.html`.
2. Create a **fine-grained personal access token**: GitHub -> Settings -> Developer settings ->
   Personal access tokens -> Fine-grained tokens -> Generate new token.
   - Repository access: **Only select repositories** -> `ps2eater.github.io`.
   - Repository permissions: **Contents: Read and write**.
3. Paste the token into the dashboard and press **Connect**.
4. Edit anything. Changes stay in the browser until you press **Publish**, which commits
   `data.json` to the branch with the commit message you choose.
5. GitHub Pages picks up the commit in about a minute.

The token is stored in `localStorage` on that device only and is sent to `api.github.com` only.
Never commit it to the repository. Use **Forget token** on the Connection page to remove it.

### Working without a token

Press **Work offline** on the login screen. You can edit everything and then
**Download data.json** from the Publish dialog (or the Connection page) and replace the file in
GitHub manually. The same page can import an existing `data.json` back into the editor.

## data.json shape

```json
{
  "site": {
    "title": "PS2EATER",
    "tagline": "SVR Modding Tools & Resources",
    "subtitle": "...",
    "about": "...",
    "announcement": "",
    "announcementEnabled": false,
    "footer": "...",
    "social": { "discord": "", "github": "", "itch": "" },
    "updated": "2026-11-01"
  },
  "categories": [
    { "id": "tools", "nav": "Tools", "title": "Modding Tools", "blurb": "...", "order": 1 }
  ],
  "tools": [
    {
      "id": "svr-2010-save-editor",
      "name": "SVR 2010 Save Editor",
      "version": "v0.2.8",
      "icon": "💾",
      "description": "Text. A line starting with - renders as a bullet.",
      "features": ["Entrance editing"],
      "price": "free",
      "link": "https://...",
      "image": "assets/cover.png",
      "featured": false,
      "hidden": false,
      "tags": ["Save"],
      "updated": "2026-10-28"
    }
  ],
  "characters": [],
  "movepacks": []
}
```

Notes:

- Category ids must match the arrays (`tools`, `characters`, `movepacks`).
- `price` is either `"free"` or a display string such as `"$15"`.
- `hidden: true` keeps the item out of the public page without deleting it.
- `features` is an array of short chips; `tags` is only used for searching in the dashboard.
- Anything missing is filled with defaults by the dashboard, so old files keep working.

## Deployment

GitHub Pages serves the repository root from the `main` branch.
With the dashboard you do not need to touch the GitHub web editor at all.

If you ever need to deploy by hand: upload `index.html`, `style.css`, `admin.html`,
`admin.css`, `admin.js`, `data.json`, `logo.png` and the `assets/` folder,
then commit.

## Local preview

```bash
npx serve .
# or any static server; opening the files with file:// breaks fetch('data.json')
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Could not reach api.github.com" | Network, VPN or firewall blocked the request. Check the internet, then run the test again on the Connection page. |
| 401 Token rejected | The token was revoked or copied with a typo. Create a new one. |
| 403 Access denied | The token needs **Contents: Read and write** on this exact repository. |
| 409 Conflict | `data.json` changed on GitHub while you were editing. Reload and redo the change. |
| Site still shows old content | GitHub Pages caches for about a minute. Hard refresh with Ctrl+F5. |
| Images do not upload | Uploads need a connected token; offline mode cannot write to the repository. |

## Arabic quick start

1. افتح `admin.html` من الموقع.
2. اعمل توكن من GitHub بصلاحية **Contents: Read and write** على ريبو `ps2eater.github.io`.
3. الصق التوكن واضغط **Connect**.
4. عدّل أي عنصر، وبعد ما تخلص اضغط **Publish** لرفع `data.json`.
5. الموقع بيتحدث خلال دقيقة تقريبًا.
6. من غير توكن: **Work offline** ثم **Download data.json** وارفع الملف يدويًا.

