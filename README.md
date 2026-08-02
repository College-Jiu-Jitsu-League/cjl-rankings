# CJL Season Rankings

Public archive of Collegiate Jiu-Jitsu League team standings, one season per entry.
Live site is served by GitHub Pages from this repo.

## Files

| File | What it is |
|---|---|
| `index.html` | The public rankings page. Reads `rankings.json` and renders it. Never needs editing between seasons. |
| `rankings.json` | The data. One block per season, with `combined` / `men` / `women` divisions. |
| `admin.html` | Staff editor. Loads `rankings.json`, provides a form UI, and commits changes back to this repo via the GitHub API. |

## Updating rankings (staff)

1. Open the admin page (`/admin.html` on the live site) and click **Load current rankings**.
2. Edit standings, add schools, or create a new season.
3. Click **Copy updated file**, then **Open GitHub editor** (sign in to GitHub if asked).
4. In the GitHub editor: select all (Ctrl+A / Cmd+A), paste, and **Commit changes**.
   The public page updates within ~1 minute.

Notes:
- Row order doesn't matter - the public page ranks by points (medal points break ties).
- Logo URL is optional. Without one, a monogram badge is shown.
- Every publish is a git commit, so all changes can be reviewed and reverted here on GitHub.

## Getting access (staff)

1. Have a free GitHub account and accept the invite to the CJL GitHub
   organization (sent to your CJL email).
2. That's it. The admin page publishes through GitHub's own editor using your
   normal GitHub login - no tokens or keys needed.

If GitHub won't let you commit, ask an org admin to give you **Write** access
to this repository.

## Admin page password

The admin page (`admin.html`) asks for a staff password before showing the
editor: **CJLrankingsadmin**

This gate is a deterrent to keep casual visitors out of the editor UI - it is
not real security. Nothing on the admin page can change the live site; every
publish still goes through GitHub, which checks that your account has Write
access to this repository.

To change the password: hash the new password with SHA-256 (any "sha256
online" tool) and replace the `PW_HASH` value near the top of the script in
`admin.html`. Do this whenever someone leaves the staff.

## Manual data edits (fallback)

You can also edit `rankings.json` directly on GitHub (pencil icon → commit).
Season format:

```json
{
  "id": "fall-2026",
  "label": "Fall 2026",
  "divisions": {
    "combined": [
      { "school": "Example University", "points": 10, "medalPts": 1 }
    ],
    "men": [],
    "women": []
  }
}
```

Validate with https://jsonlint.com before committing — a stray comma will make the
public page show its "couldn't load data" state until fixed.

## Hosting

GitHub Pages: Settings → Pages → Deploy from branch `main`, root folder.
Custom domain (e.g. `rankings.cjlofficial.org`): add it in the Pages settings and
create a DNS CNAME record pointing the subdomain to `<org-name>.github.io`, then
enable **Enforce HTTPS**.

## Admin page configuration

`admin.html` has three constants near the top of its `<script>` block that must
match this repo:

```js
var OWNER  = "College-Jiu-Jitsu-League";
var REPO   = "cjl-rankings";
var BRANCH = "main";
```

## Automatic season snapshots

A GitHub Action (`.github/workflows/season-snapshot.yml`) pulls the current
standings from the website's database and opens a **pull request** adding them as
a new season. Nothing goes live until a person reviews the numbers and clicks
**Merge**.

- Runs automatically on **May 20** and **Dec 20** each year.
- Can be run any time: repo → **Actions** → **Season snapshot** → **Run workflow**
  (optionally type a season name; otherwise it auto-names by date).
- If the season already exists, the run does nothing — safe to re-run.
- Config lives in `snapshot.config.json` (Supabase URL, anon key, table and
  column names). The anon key is public by design; never put the service_role
  key in this repo.

One-time repo setting required: **Settings → Actions → General →
Workflow permissions** → allow GitHub Actions to **create pull requests**.

If a snapshot is ever wrong, fix it in the admin page (`admin.html`) — it edits
the same `rankings.json` and always wins.
