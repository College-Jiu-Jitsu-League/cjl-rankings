/**
 * CJL season snapshot
 * Reads current standings from the website's public /api/standings endpoint
 * and appends them as a new season in rankings.json. No database keys needed.
 *
 * Expected endpoint response:
 *   { "men": [ { school_name, points, medal_pts }, ... ],
 *     "women": [ ... ] }
 * (Also accepts "school"/"medalPts" key spellings, and an optional
 * "combined" array; if absent, combined is computed by summing points and
 * medal points per school across men + women, matching the website's logic.)
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

function normalizeRow(r) {
  return {
    school: String(r.school_name ?? r.school ?? "").trim(),
    points: Number(r.points) || 0,
    medalPts: Number(r.medal_pts ?? r.medalPts ?? r.medal_points) || 0
  };
}

function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  return sortStandings(list.map(normalizeRow).filter((r) => r.school.length > 0));
}

function sortStandings(rows) {
  return rows.sort((a, b) =>
    (b.points - a.points) || (b.medalPts - a.medalPts) || a.school.localeCompare(b.school)
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
      bySchool.set(row.school, { ...row });
    }
  }
  return sortStandings(Array.from(bySchool.values()));
}

(async function main() {
  // --- Load config ---
  if (!fs.existsSync(CONFIG_PATH)) fail("snapshot.config.json not found at repo root.");
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  if (!cfg.standingsEndpoint || !/^https?:\/\//.test(cfg.standingsEndpoint)) {
    fail("Set standingsEndpoint in snapshot.config.json to the website's standings API URL.");
  }

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

  // --- Fetch standings from the website ---
  const res = await fetch(cfg.standingsEndpoint, {
    headers: { Accept: "application/json" }
  }).catch((e) => fail("Couldn't reach " + cfg.standingsEndpoint + " (" + (e.cause?.code || e.message) + ")."));
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail("The standings endpoint returned HTTP " + res.status + ".\nURL: " + cfg.standingsEndpoint +
      "\nResponse: " + body.slice(0, 500) +
      "\nIf the site's API route changed, update standingsEndpoint in snapshot.config.json.");
  }
  let payload;
  try {
    payload = await res.json();
  } catch (e) {
    fail("The standings endpoint didn't return valid JSON. Check " + cfg.standingsEndpoint + " in a browser.");
  }

  const men = normalizeList(payload.men);
  const women = normalizeList(payload.women);
  const combined = payload.combined ? normalizeList(payload.combined) : computeCombined(men, women);

  if (!combined.length) {
    fail("The endpoint returned no standings rows, so no season was created. " +
      "This protects the archive from snapshotting empty data. " +
      "Open " + cfg.standingsEndpoint + " in a browser to see what it returns.");
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
