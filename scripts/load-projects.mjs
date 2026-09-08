/**
 * Loads the extracted MoSPI rows into Supabase.
 *
 * Separate from the extraction on purpose. Extraction is the risky, changeable
 * part and its output is reviewed as a diff; this step only takes a file that
 * has already been looked at and puts it in the database. Keeping them apart
 * means a parser change can never quietly rewrite live data, and a bad load can
 * be re-run from the same file without hitting mospi.gov.in again.
 *
 * Upserts on external_ref, so running it twice updates rather than duplicates.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/load-projects.mjs
 *   node scripts/load-projects.mjs --dry-run     # print what it would send
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "data", "mospi", "projects.json");

// PostgREST rejects unknown keys, and these are extraction bookkeeping rather
// than columns: the source URL and page belong on project_sources, not here.
const NOT_COLUMNS = new Set(["source_url", "source_page"]);

// Large payloads time out; small ones make too many round trips.
const BATCH = 200;

const dryRun = process.argv.includes("--dry-run");
const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!dryRun && (!url || !key)) {
  console.error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n" +
      "The service role key bypasses row level security, so it belongs in a\n" +
      "repository secret or your shell — never in the repo.",
  );
  process.exit(1);
}

const rows = JSON.parse(await readFile(DATA, "utf8"));
if (!Array.isArray(rows) || rows.length === 0) {
  console.error(`No rows in ${DATA}. Refusing to run.`);
  process.exit(1);
}

/** Drops bookkeeping keys and anything undefined, which PostgREST will not take. */
function toColumns(row) {
  return Object.fromEntries(
    Object.entries(row).filter(([column, value]) => !NOT_COLUMNS.has(column) && value !== undefined),
  );
}

const payload = rows.map(toColumns);

// A quick sanity pass before anything is sent. These are the invariants the
// extraction is supposed to guarantee; if one is broken the file is wrong and
// loading it would put something indefensible on the site.
const problems = [];
for (const row of payload) {
  if (!row.external_ref?.startsWith("mospi:")) problems.push(`bad ref: ${row.external_ref}`);
  if (!row.name || row.name.length < 8) problems.push(`bad name: ${row.name}`);
  if (row.status === "completed" || row.status === "finished_early") {
    problems.push(`claims completion: ${row.external_ref}`);
  }
  if (row.budget_inr === 0) problems.push(`zero budget, should be null: ${row.external_ref}`);
  if ((row.latitude == null) !== (row.longitude == null)) {
    problems.push(`half a coordinate: ${row.external_ref}`);
  }
}
if (problems.length > 0) {
  console.error(`${problems.length} rows failed the checks:`);
  for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
  process.exit(1);
}

const placed = payload.filter((row) => row.latitude != null).length;
console.log(
  `${payload.length} rows, ${placed} with coordinates, ` +
    `${payload.filter((row) => row.status === "delayed").length} running late`,
);

if (dryRun) {
  console.log("\n--dry-run, sending nothing. First row:");
  console.log(JSON.stringify(payload[0], null, 2));
  process.exit(0);
}

let done = 0;
for (let index = 0; index < payload.length; index += BATCH) {
  const batch = payload.slice(index, index + BATCH);
  const response = await fetch(`${url}/rest/v1/projects?on_conflict=external_ref`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // merge-duplicates makes this an upsert; without it a re-run fails on the
      // unique index instead of updating what changed.
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });

  if (!response.ok) {
    console.error(`Batch at ${index} failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }
  done += batch.length;
  console.log(`  upserted ${done}/${payload.length}`);
}

console.log(`Loaded ${done} projects.`);
