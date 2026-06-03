import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = fs.readFileSync(".env.local", "utf8").split("\n").filter(l=>l&&!l.startsWith("#")).reduce((a,l)=>{const i=l.indexOf("=");if(i>-1)a[l.slice(0,i).trim()]=l.slice(i+1).trim();return a;},{});
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log("=== T-018 PRE-FLIGHT AUDIT ===\n");

const { data: dist } = await admin.from("nanny_payouts").select("status");
const byStatus = (dist ?? []).reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
console.log("Q1: Status distribution across all nanny_payouts:");
Object.entries(byStatus).sort().forEach(([s,c]) => console.log(`  ${s.padEnd(12)} ${c}`));

const { data: frozen } = await admin.from("nanny_payouts").select("*").eq("status", "frozen");
console.log(`\nQ2: Frozen rows to migrate to 'cancelled': ${(frozen??[]).length}`);
for (const r of (frozen ?? []).slice(0, 5)) {
  console.log(`  ${r.id.slice(0,8)} sub=${r.parent_subscription_id.slice(0,8)} amount=A$${(r.amount_aud_cents/100).toFixed(2)} period=${r.period_start} frozen_at=${r.frozen_at?.slice(0,16) ?? '—'} reason=${r.failure_reason ?? '—'}`);
}

const { data: heldRows } = await admin
  .from("nanny_payouts")
  .select("id, nanny_user_id, amount_aud_cents, scheduled_release_at, period_start, parent_subscription_id")
  .eq("status", "held");

let wakeUpCount = 0;
const wakeUpSample = [];
for (const r of (heldRows ?? [])) {
  const { data: nanny } = await admin
    .from("nannies")
    .select("payout_application_status, payouts_enabled")
    .eq("user_id", r.nanny_user_id)
    .maybeSingle();
  if (nanny?.payout_application_status === "verified" && nanny?.payouts_enabled === true) {
    wakeUpCount++;
    if (wakeUpSample.length < 10) wakeUpSample.push({ ...r, ...nanny });
  }
}
console.log(`\nQ3: Held rows that will WAKE UP after approved→verified fix: ${wakeUpCount}`);
for (const r of wakeUpSample) {
  console.log(`  ${r.id.slice(0,8)} nanny=${r.nanny_user_id.slice(0,8)} amount=A$${(r.amount_aud_cents/100).toFixed(2)} release=${r.scheduled_release_at?.slice(0,16) ?? '—'} period=${r.period_start}`);
}

const { data: subDist } = await admin.from("parent_subscriptions").select("status");
const subByStatus = (subDist ?? []).reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
console.log("\nQ4: parent_subscriptions status distribution:");
Object.entries(subByStatus).sort().forEach(([s,c]) => console.log(`  ${s.padEnd(20)} ${c}`));

const trialCount = subByStatus.trial ?? 0;
console.log(`\nQ5: Active trial subscriptions: ${trialCount}`);
console.log("\n=== END AUDIT ===");
