/**
 * Applies updated prompt sections from seed-data.ts to the live
 * `katie_prompt` table.
 *
 * Difference vs. scripts/seed-katie-prompt.ts:
 *   - seed-katie-prompt.ts is IDEMPOTENT: skips sections that already
 *     have an active row. Used for first-time deploys.
 *   - apply-prompt-updates.ts is an UPSERT: deactivates the current
 *     active row for each specified section and inserts a fresh row
 *     at version+1 with the content from seed-data.ts. Logs a row in
 *     katie_prompt_edits for audit parity with apply_prompt_edit.
 *
 * Run: `npx tsx scripts/apply-prompt-updates.ts section1 section2 ...`
 * Or:  `npx tsx scripts/apply-prompt-updates.ts --all`
 *
 * Env: .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { SEED_SECTIONS } from "../src/lib/chat/prompts/seed-data";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[apply-prompt-updates] Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function lineDiffCount(
  a: string,
  b: string,
): { added: number; removed: number } {
  const al = a.split("\n");
  const bl = b.split("\n");
  const shared = new Set(al.filter((l) => bl.includes(l)));
  return {
    added: bl.filter((l) => !shared.has(l)).length,
    removed: al.filter((l) => !shared.has(l)).length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: npx tsx scripts/apply-prompt-updates.ts <section1> [<section2> ...]",
    );
    console.error("       npx tsx scripts/apply-prompt-updates.ts --all");
    process.exit(1);
  }

  const targets =
    args[0] === "--all" ? SEED_SECTIONS.map((s) => s.section) : args;

  console.log(`Applying prompt updates: ${targets.join(", ")}`);
  console.log("=".repeat(80));

  let applied = 0;
  let inserted = 0;
  let skipped = 0;

  for (const sectionId of targets) {
    const seed = SEED_SECTIONS.find((s) => s.section === sectionId);
    if (!seed) {
      console.log(`  ✗ ${sectionId}: not found in seed-data.ts, skipping`);
      skipped++;
      continue;
    }

    // Fetch current active row
    const { data: current } = await admin
      .from("katie_prompt")
      .select("id, version, content, protected")
      .eq("section", sectionId)
      .eq("is_active", true)
      .maybeSingle();

    if (!current) {
      // No active row → INSERT new at version 1 (first time deploy)
      const { error: insertErr } = await admin.from("katie_prompt").insert({
        section: seed.section,
        content: seed.content,
        version: 1,
        is_active: true,
        protected: seed.protected ?? false,
        edit_reason: "Initial insert via apply-prompt-updates.ts",
      });
      if (insertErr) {
        console.error(`  ✗ ${sectionId}: insert failed — ${insertErr.message}`);
        process.exit(1);
      }
      console.log(`  ✓ ${sectionId.padEnd(28)} — inserted at v1 (was missing)`);
      inserted++;
      continue;
    }

    if (current.content === seed.content) {
      console.log(
        `  ⊙ ${sectionId.padEnd(28)} — unchanged (v${current.version}), skipping`,
      );
      skipped++;
      continue;
    }

    // Deactivate current, insert new at version+1
    const { error: deactErr } = await admin
      .from("katie_prompt")
      .update({ is_active: false })
      .eq("id", current.id);
    if (deactErr) {
      console.error(
        `  ✗ ${sectionId}: deactivate failed — ${deactErr.message}`,
      );
      process.exit(1);
    }

    const nextVersion = current.version + 1;
    const { error: insertErr } = await admin.from("katie_prompt").insert({
      section: seed.section,
      content: seed.content,
      version: nextVersion,
      is_active: true,
      protected: seed.protected ?? false,
      edit_reason: "Bulk update via apply-prompt-updates.ts (foundation WU)",
    });
    if (insertErr) {
      // Attempt recovery — reactivate the old row.
      await admin
        .from("katie_prompt")
        .update({ is_active: true })
        .eq("id", current.id);
      console.error(`  ✗ ${sectionId}: insert failed — ${insertErr.message}`);
      process.exit(1);
    }

    const diff = lineDiffCount(current.content, seed.content);
    console.log(
      `  ✓ ${sectionId.padEnd(28)} — v${current.version} → v${nextVersion} (+${diff.added}/-${diff.removed})`,
    );
    applied++;
  }

  console.log("=".repeat(80));
  console.log(
    `Done — ${applied} updated, ${inserted} inserted fresh, ${skipped} skipped.`,
  );

  const { data: version } = await admin
    .from("katie_prompt_version")
    .select("version_hash, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (version) {
    console.log(
      `katie_prompt_version: ${version.version_hash} (updated ${version.updated_at})`,
    );
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
