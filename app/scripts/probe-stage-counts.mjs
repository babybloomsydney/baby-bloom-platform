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

// Distribution of (stage, status) across nanny_positions
const { data } = await admin.from("nanny_positions").select("stage, status").limit(5000);
const dist = new Map();
for (const r of data ?? []) {
  const k = `stage=${r.stage} status=${r.status}`;
  dist.set(k, (dist.get(k) ?? 0) + 1);
}
console.log("nanny_positions (stage, status) distribution:");
for (const [k, v] of [...dist.entries()].sort((a,b) => b[1]-a[1])) {
  console.log(`  ${v.toString().padStart(4)}  ${k}`);
}
