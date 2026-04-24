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

const { data } = await admin.from("nanny_positions").select("status, stage").limit(1000);
const statuses = new Set();
const stages = new Set();
for (const r of data ?? []) {
  if (r.status !== null && r.status !== undefined) statuses.add(r.status);
  if (r.stage !== null && r.stage !== undefined) stages.add(r.stage);
}
console.log("nanny_positions.status values in prod:", [...statuses].sort());
console.log("nanny_positions.stage values in prod:", [...stages].sort());

// Probe which status values the CHECK accepts by trying each candidate on a sample row
const { data: rows } = await admin.from("nanny_positions").select("id, status").limit(1);
const sample = rows?.[0];
if (sample) {
  const candidates = ["draft", "open", "in_progress", "filled", "cancelled", "closed", "expired", "completed", "on_hold"];
  const accepted = [];
  const rejected = [];
  for (const v of candidates) {
    const { error } = await admin.from("nanny_positions").update({ status: v }).eq("id", sample.id).select("id");
    if (error && error.code === "23514") {
      rejected.push(v);
    } else if (error) {
      rejected.push(`${v} (${error.code})`);
    } else {
      accepted.push(v);
    }
  }
  // Restore
  await admin.from("nanny_positions").update({ status: sample.status }).eq("id", sample.id);
  console.log("status values accepted by CHECK:", accepted);
  console.log("status values rejected by CHECK:", rejected);
}
