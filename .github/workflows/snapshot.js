/**
 * CJL season snapshot
 * Reads current standings from the Lovable site's Supabase database (read-only,
 * public anon key) and appends them as a new season in rankings.json.
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
  // Communicates results back to the GitHub Actions workflow.
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

async function fetchDivision(cfg, divisionValue) {
  const cols = [cfg.columns.school, cfg.columns.points, cfg.columns.medalPts];
  if (cfg.columns.logo) cols.push(cfg.columns.logo);

  let url = cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + encodeURIComponent(cfg.table) +
    "?select=" + encodeURIComponent(cols.join(","));
  if (cfg.divisionColumn && divisionValue !== null) {
    url += "&" + encodeURIComponent(cfg.divisionColumn) + "=eq." + encodeURIComponent(divisionValue);
  }

  const res = await fetch(url, {
    headers: {
      apikey: cfg.supabaseAnonKey,
      Authorization: "Bearer " + cfg.supabaseAnonKey
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail("Supabase request failed (HTTP " + res.status + ") for URL:\n" + url +
      "\nResponse: " + body.slice(0, 500) +
      "\nCheck the table and column names in snapshot.config.json.");
  }
  const rows = await res.json();

  return rows
    .map((r) => {
      const out = {
        school: String(r[cfg.columns.school] ?? "").trim(),
        points: Number(r[cfg.columns.points]) || 0,
        medalPts: Number(r[cfg.columns.medalPts]) || 0
      };
      if (cfg.columns.logo && r[cfg.columns.logo]) out.logo = String(r[cfg.columns.logo]);
      return out;
    })
    .filter((r) => r.school.length > 0)
    .sort((a, b) => (b.points - a.points) || (b.medalPts - a.medalPts) || a.school.localeCompare(b.school));
}

(async function main() {
  // --- Load and validate config ---
  if (!fs.existsSync(CONFIG_PATH)) fail("snapshot.config.json not found at repo root.");
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

  const unset = [];
  if (!cfg.supabaseUrl || /REPLACE-ME/.test(cfg.supabaseUrl)) unset.push("supabaseUrl");
  if (!cfg.supabaseAnonKey || /REPLACE-ME/.test(cfg.supabaseAnonKey)) unset.push("supabaseAnonKey");
  if (!cfg.table || /REPLACE-ME/.test(cfg.table)) unset.push("table");
  ["school", "points", "medalPts"].forEach((k) => {
    if (!cfg.columns || !cfg.columns[k] || /REPLACE-ME/.test(cfg.columns[k])) unset.push("columns." + k);
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

  // --- Fetch standings ---
  const divisions = {};
  if (cfg.divisionColumn) {
    for (const div of ["combined", "men", "women"]) {
      const value = (cfg.divisionValues || {})[div];
      divisions[div] = value === undefined || value === null || value === ""
        ? []
        : await fetchDivision(cfg, value);
    }
  } else {
    divisions.combined = await fetchDivision(cfg, null);
    divisions.men = [];
    divisions.women = [];
  }

  if (!divisions.combined.length && !divisions.men.length && !divisions.women.length) {
    fail("The website returned no standings rows, so no season was created. " +
      "This protects the archive from snapshotting an empty table. " +
      "Check the table/column names, or that the site has data right now.");
  }

  // --- Append and save ---
  data.seasons.push({ id, label, divisions });
  fs.writeFileSync(RANKINGS_PATH, JSON.stringify(data, null, 2) + "\n");

  const counts = ["combined", "men", "women"]
    .map((d) => d + ": " + divisions[d].length).join(", ");
  console.log('Added season "' + label + '" (' + counts + " teams).");
  setOutput("changed", "true");
  setOutput("label", label);
  setOutput("id", id);
})().catch((err) => fail(err.message || String(err)));
