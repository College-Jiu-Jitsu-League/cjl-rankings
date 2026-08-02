/**
 * CJL season snapshot
 * Reads current standings from the website's database (read-only, public anon
 * key) and appends them as a new season in rankings.json.
 *
 * Schema: men's and women's standings are separate tables with identical
 * columns. "Combined" is computed here by summing points and medal points per
 * school across both tables - the same way the website computes it.
 *
 * Run by .github/workflows/season-snapshot.yml. Can also be run locally:
 *   node scripts/snapshot.js
 * Optional env: SEASON_LABEL="Fall 2026" to override the auto-generated name.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "snapshot.config.json");
const RANKINGS_PATH = path.join(ROOT, "rankings.json");

function fail(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, key + "=" + value + "\n");
  }
}

function slugify(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function autoLabel(now) {
  // Jan-Jun = Spring season, Jul-Dec = Fall season.
  const year = now.getUTCFullYear();
  return (now.getUTCMonth() < 6 ? "Spring " : "Fall ") + year;
}

function sortStandings(rows) {
  return rows.sort((a, b) =>
    (b.points - a.points) || (b.medalPts - a.medalPts) || a.school.localeCompare(b.school)
  );
}

async function fetchTable(cfg, table) {
  const cols = [cfg.columns.school, cfg.columns.points, cfg.columns.medalPts];
  const url = cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + encodeURIComponent(table) +
    "?select=" + encodeURIComponent(cols.join(","));

  const res = await fetch(url, {
    headers: {
      apikey: cfg.supabaseAnonKey,
      Authorization: "Bearer " + cfg.supabaseAnonKey
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail("Request for table \"" + table + "\" failed (HTTP " + res.status + ").\nURL: " + url +
      "\nResponse: " + body.slice(0, 500) +
      "\nCheck the table and column names in snapshot.config.json.");
  }
  const rows = await res.json();

  return sortStandings(
    rows
      .map((r) => ({
        school: String(r[cfg.columns.school] ?? "").trim(),
        points: Number(r[cfg.columns.points]) || 0,
        medalPts: Number(r[cfg.columns.medalPts]) || 0
      }))
      .filter((r) => r.school.length > 0)
  );
}

function computeCombined(men, women) {
  // Sum points and medal points per school across both divisions,
  // mirroring the website's getSeasonStandings logic.
  const bySchool = new Map();
  for (const row of [...men, ...women]) {
    const existing = bySchool.get(row.school);
    if (existing) {
      existing.points += row.points;
      existing.medalPts += row.medalPts;
    } else {
      bySchool.set(row.school, { school: row.school, points: row.points, medalPts: row.medalPts });
    }
  }
  return sortStandings(Array.from(bySchool.values()));
}

(async function main() {
  // --- Load and validate config ---
  if (!fs.existsSync(CONFIG_PATH)) fail("snapshot.config.json not found at repo root.");
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

  const unset = [];
  if (!cfg.supabaseUrl || /REPLACE-ME/.test(cfg.supabaseUrl)) unset.push("supabaseUrl");
  if (!cfg.supabaseAnonKey || /REPLACE-ME/.test(cfg.supabaseAnonKey)) unset.push("supabaseAnonKey");
  if (!cfg.tables || !cfg.tables.men) unset.push("tables.men");
  if (!cfg.tables || !cfg.tables.women) unset.push("tables.women");
  ["school", "points", "medalPts"].forEach((k) => {
    if (!cfg.columns || !cfg.columns[k]) unset.push("columns." + k);
  });
  if (unset.length) fail("Fill in these values in snapshot.config.json first: " + unset.join(", "));

  // --- Work out the season name ---
  const label = (process.env.SEASON_LABEL || "").trim() || autoLabel(new Date());
  const id = slugify(label);
  if (!id) fail("Season label produced an empty id.");

  // --- Load existing rankings ---
  if (!fs.existsSync(RANKINGS_PATH)) fail("rankings.json not found at repo root.");
  const data = JSON.parse(fs.readFileSync(RANKINGS_PATH, "utf8"));
  if (!Array.isArray(data.seasons)) fail("rankings.json has an unexpected format.");

  if (data.seasons.some((s) => s.id === id)) {
    console.log('Season "' + label + '" already exists in rankings.json - nothing to do.');
    setOutput("changed", "false");
    return;
  }

  // --- Fetch both division tables, compute combined ---
  const men = await fetchTable(cfg, cfg.tables.men);
  const women = await fetchTable(cfg, cfg.tables.women);
  const combined = computeCombined(men, women);

  if (!combined.length) {
    fail("Both standings tables came back empty, so no season was created. " +
      "This protects the archive from snapshotting an empty database. " +
      "Check the table/column names, or that the site has standings data right now.");
  }

  // --- Append and save ---
  data.seasons.push({ id, label, divisions: { combined, men, women } });
  fs.writeFileSync(RANKINGS_PATH, JSON.stringify(data, null, 2) + "\n");

  console.log('Added season "' + label + '" (combined: ' + combined.length +
    ", men: " + men.length + ", women: " + women.length + " teams).");
  setOutput("changed", "true");
  setOutput("label", label);
  setOutput("id", id);
})().catch((err) => fail(err.message || String(err)));
