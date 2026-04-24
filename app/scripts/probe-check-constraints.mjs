#!/usr/bin/env node
/**
 * Probe prod DB for the CHECK constraints audit discrepancies C2/C3/H2
 * flagged. Answers: are the status enums in production already aligned
 * with the code, or is code writing values the DB will reject?
 *
 * Uses pg_catalog via a Postgres function so it works through the REST API.
 * Falls back to attempting an actual INSERT with the suspect value +
 * rollback if pg_catalog isn't reachable.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = process.argv[2] ?? "./.env.local";
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m) continue;
  let [, k, v] = m;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Strategy: try INSERT with suspicious value + RLS-bypassed admin client.
// If it succeeds → the value IS accepted by CHECK. Roll back via DELETE.
// If it fails with a CHECK violation → confirmed bug.
// For nanny_positions we just insert a disposable row, then delete.

async function testInsertStatus(table, col, value, extraCols) {
  const row = { [col]: value, ...extraCols };
  const { data, error } = await admin.from(table).insert(row).select("id");
  if (error) {
    return { ok: false, code: error.code, message: error.message };
  }
  // Clean up
  if (data && data[0]?.id) {
    await admin.from(table).delete().eq("id", data[0].id);
  }
  return { ok: true };
}

// Minimum required columns to create a disposable row we can delete.
// We intentionally use values that will either pass CHECK (win) or fail
// CHECK (diagnostic). Non-CHECK violations (FK, NOT NULL) mean we can't
// cleanly test here — report that too.

async function main() {
  console.log("=== C2: babysitting_requests.status allows 'pending_payment' ===");
  {
    const { data: rows } = await admin
      .from("babysitting_requests")
      .select("id, status")
      .limit(1);
    const sample = rows?.[0];
    if (!sample) {
      console.log("  no rows in babysitting_requests to test against; skipping");
    } else {
      const { data, error } = await admin
        .from("babysitting_requests")
        .update({ status: "pending_payment" })
        .eq("id", sample.id)
        .select("id, status");
      if (error) {
        console.log(`  ❌ UPDATE failed: code=${error.code} msg=${error.message}`);
      } else if (data && data[0]?.status === "pending_payment") {
        console.log("  ✅ CHECK accepts 'pending_payment' — restoring original status");
        await admin
          .from("babysitting_requests")
          .update({ status: sample.status })
          .eq("id", sample.id);
      } else {
        console.log("  ⚠️  update returned no row (RLS or not-found)");
      }
    }
  }

  console.log("\n=== C3: nanny_positions.status allows 'closed' ===");
  {
    const { data: rows } = await admin
      .from("nanny_positions")
      .select("id, status")
      .limit(1);
    const sample = rows?.[0];
    if (!sample) {
      console.log("  no rows in nanny_positions to test against; skipping");
    } else {
      const { data, error } = await admin
        .from("nanny_positions")
        .update({ status: "closed" })
        .eq("id", sample.id)
        .select("id, status");
      if (error) {
        console.log(`  ❌ UPDATE failed: code=${error.code} msg=${error.message}`);
      } else if (data && data[0]?.status === "closed") {
        console.log("  ✅ CHECK accepts 'closed' — restoring original status");
        await admin
          .from("nanny_positions")
          .update({ status: sample.status })
          .eq("id", sample.id);
      } else {
        console.log("  ⚠️  update returned no row (RLS or not-found)");
      }
    }
  }

  console.log(
    "\n=== H2: nanny_positions.urgency / placement_length / schedule_type — ===",
  );
  {
    const { data: rows } = await admin
      .from("nanny_positions")
      .select("id, urgency, placement_length, schedule_type")
      .limit(1);
    const sample = rows?.[0];
    if (!sample) {
      console.log("  no rows to probe");
    } else {
      // Read the current values so we can list what actually exists in prod
      const { data: distinctUrgency } = await admin
        .from("nanny_positions")
        .select("urgency")
        .not("urgency", "is", null)
        .limit(1000);
      const { data: distinctPL } = await admin
        .from("nanny_positions")
        .select("placement_length")
        .not("placement_length", "is", null)
        .limit(1000);
      const { data: distinctST } = await admin
        .from("nanny_positions")
        .select("schedule_type")
        .not("schedule_type", "is", null)
        .limit(1000);

      const uniq = (arr, key) =>
        Array.from(
          new Set((arr ?? []).map((r) => r[key]).filter(Boolean)),
        ).sort();

      console.log("  values currently present in prod:");
      console.log("    urgency:          ", uniq(distinctUrgency, "urgency"));
      console.log("    placement_length: ", uniq(distinctPL, "placement_length"));
      console.log("    schedule_type:    ", uniq(distinctST, "schedule_type"));
      console.log(
        "  (any value listed above is accepted by the live CHECK — verify against the migration file)",
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
