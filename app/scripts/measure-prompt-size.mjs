#!/usr/bin/env node
/**
 * Measure assembled-prompt size by section.
 *
 * Reads the seed prompt sections from the DB (via the same path the
 * runtime loader uses) and dumps a per-section byte breakdown so the
 * latency report can quote real numbers, not estimates.
 *
 * Read-only. No API spend.
 */

import path from "node:path";
import url from "node:url";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}
loadEnv(path.join(APP_ROOT, ".env.local"));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Pull the active prompt sections — same query as loadActiveSections().
const { data, error } = await supabase
  .from("katie_prompt")
  .select("section, content")
  .eq("is_active", true);

if (error) {
  console.error(error);
  process.exit(1);
}

// Approximate token count: 1 token ≈ 4 chars for English. Crude but
// good enough for relative section sizing — Gemini's actual tokenizer
// will differ a bit but the ratios hold.
function approxTokens(s) {
  return Math.round(s.length / 4);
}

const out = {
  total_sections: data.length,
  sections: {},
  totals: { bytes: 0, approx_tokens: 0 },
  by_kind: {
    role: { bytes: 0, approx_tokens: 0, sections: [] },
    module: { bytes: 0, approx_tokens: 0, sections: [] },
    common: { bytes: 0, approx_tokens: 0, sections: [] },
  },
};

for (const row of data) {
  const bytes = Buffer.byteLength(row.content, "utf8");
  const tok = approxTokens(row.content);
  out.sections[row.section] = { bytes, approx_tokens: tok };
  out.totals.bytes += bytes;
  out.totals.approx_tokens += tok;
  const kind = row.section.startsWith("role_")
    ? "role"
    : row.section.startsWith("module.")
      ? "module"
      : "common";
  out.by_kind[kind].bytes += bytes;
  out.by_kind[kind].approx_tokens += tok;
  out.by_kind[kind].sections.push(row.section);
}

// Top 10 largest sections — useful pointer for "what dominates the prompt".
const sortedBySize = Object.entries(out.sections)
  .sort((a, b) => b[1].approx_tokens - a[1].approx_tokens)
  .slice(0, 10);
out.top_10_largest = Object.fromEntries(sortedBySize);

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
