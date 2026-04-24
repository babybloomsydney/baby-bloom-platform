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

const { data: rows } = await admin.from("connection_requests").select("id, status").limit(1);
const sample = rows?.[0];
if (!sample) { console.log("no rows in connection_requests"); process.exit(0); }
const candidates = ["pending", "accepted", "declined", "cancelled", "expired", "completed", "closed"];
const accepted = [], rejected = [];
for (const v of candidates) {
  const { error } = await admin.from("connection_requests").update({ status: v }).eq("id", sample.id).select("id");
  if (error && error.code === "23514") rejected.push(v);
  else if (error) rejected.push(`${v} (${error.code})`);
  else accepted.push(v);
}
await admin.from("connection_requests").update({ status: sample.status }).eq("id", sample.id);
console.log("connection_requests.status accepted:", accepted);
console.log("connection_requests.status rejected:", rejected);
