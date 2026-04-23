/**
 * Seed katie_prompt table from seed-data.ts.
 *
 * Idempotent: only inserts sections that don't already have an active row,
 * preserving any live edits made by admin Katie or manual updates.
 *
 * Run: `npx tsx scripts/seed-katie-prompt.ts`
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL +
 *      SUPABASE_SERVICE_ROLE_KEY) in .env.local
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
    "[seed-katie-prompt] Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(
    "Seeding katie_prompt — idempotent (skips sections with existing active row)",
  );
  console.log("=".repeat(80));

  let inserted = 0;
  let skipped = 0;

  for (const seed of SEED_SECTIONS) {
    // Check if this section already has an active row
    const { data: existing, error: selectErr } = await admin
      .from("katie_prompt")
      .select("id, version")
      .eq("section", seed.section)
      .eq("is_active", true)
      .maybeSingle();

    if (selectErr) {
      console.error(
        `  ✗ ${seed.section}: select failed — ${selectErr.message}`,
      );
      process.exit(1);
    }

    if (existing) {
      console.log(
        `  ⊙ ${seed.section.padEnd(28)} — exists (version ${existing.version}), skipping`,
      );
      skipped++;
      continue;
    }

    const { error: insertErr } = await admin.from("katie_prompt").insert({
      section: seed.section,
      content: seed.content,
      version: 1,
      is_active: true,
      protected: seed.protected ?? false,
      edit_reason: "Initial seed from seed-data.ts",
    });

    if (insertErr) {
      console.error(
        `  ✗ ${seed.section}: insert failed — ${insertErr.message}`,
      );
      process.exit(1);
    }

    console.log(`  ✓ ${seed.section.padEnd(28)} — inserted`);
    inserted++;
  }

  console.log("=".repeat(80));
  console.log(
    `Done — ${inserted} inserted, ${skipped} skipped (already active).`,
  );

  // Verify version hash bumped (proves trigger fired)
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
