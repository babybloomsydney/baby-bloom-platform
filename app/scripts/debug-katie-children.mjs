#!/usr/bin/env node
/**
 * Verifies getUserChildren() by running the exact same query shape against
 * prod for a given email. Re-run after edits to bot.ts to confirm the
 * result matches expectations.
 *
 * Usage: node scripts/debug-katie-children.mjs [.env.local] [email]
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
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const EMAIL = process.argv[3] ?? "baileywright.eu@gmail.com";

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const user = list.users.find(
  (u) => (u.email ?? "").toLowerCase() === EMAIL.toLowerCase(),
);
if (!user) {
  console.error(`no auth.users row for ${EMAIL}`);
  process.exit(1);
}
console.log(`user: ${user.email}  id=${user.id}`);

// Mirror getUserChildren verbatim
const { data: direct } = await admin
  .from("child_client")
  .select("id, first_name, gender, date_of_birth")
  .eq("nanny_user_id", user.id)
  .eq("under_three", true);

const { data: placements } = await admin
  .from("nanny_placements")
  .select(
    "id, child_client:child_client!inner(id, first_name, gender, date_of_birth, under_three), nannies:nannies!inner(user_id), parents:parents!inner(user_id)",
  )
  .eq("status", "active");

const viaPlacement = (placements ?? []).filter(
  (p) => p.nannies?.user_id === user.id || p.parents?.user_id === user.id,
);

const set = new Map();
for (const r of direct ?? []) set.set(r.id, r);
for (const p of viaPlacement) {
  const cc = p.child_client;
  if (cc && cc.under_three) set.set(cc.id, cc);
}

console.log(
  "getUserChildren result:",
  JSON.stringify(Array.from(set.values()), null, 2),
);
