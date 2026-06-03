import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const envPath = "./.env.local";
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m) continue;
  let [, k, v] = m;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await admin.from("nanny_payouts").select("id, nanny_user_id, status, amount_aud_cents, scheduled_release_at, period_start").in("status", ["held", "pending"]);
console.log("Held/pending nanny_payouts:");
for (const r of data ?? []) {
  console.log(`  ${r.status.padEnd(8)} ${r.id} nanny=${r.nanny_user_id} cents=${r.amount_aud_cents} release=${r.scheduled_release_at} period=${r.period_start}`);
}
