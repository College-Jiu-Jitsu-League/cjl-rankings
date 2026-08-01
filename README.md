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

1. Open the admin page (`/admin.html` on the live site).
2. Paste your GitHub personal access token and click **Load rankings**.
3. Edit standings, add schools, or create a new season.
4. Click **Publish to live site**. The public page updates within ~1 minute.

Notes:
- Row order doesn't matter — the public page ranks by points (medal points break ties).
- Logo URL is optional. Without one, a monogram badge is shown.
- Every publish is a git commit, so all changes can be reviewed and reverted here on GitHub.

## Getting access (staff)

1. Accept the invite to the CJL GitHub organization (sent to your CJL email).
2. Create a fine-grained personal access token at
   https://github.com/settings/personal-access-tokens/new
   - **Resource owner:** the CJL organization
   - **Repository access:** only this repository
   - **Permissions:** Contents → Read and write
   - Set an expiration you're comfortable with (you can always make a new one).
3. Keep the token private. It is pasted into the admin page per session and never stored.

If publishing fails with "no write access," ask an org admin to add you to the repo
with **Write** permission.

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
