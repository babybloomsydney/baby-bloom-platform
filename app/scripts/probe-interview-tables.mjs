#!/usr/bin/env node
// Verify: does `interview_requests` still exist as a live table in prod?
// Does `connection_requests` exist? Is one a view of the other?

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

for (const t of ["interview_requests", "connection_requests"]) {
  const { data, error, count } = await admin
    .from(t)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.log(`${t}:  MISSING  (${error.code} ${error.message})`);
  } else {
    console.log(`${t}:  present, ${count ?? 0} row(s)`);
  }
}

// Peek structures
for (const t of ["interview_requests", "connection_requests"]) {
  const { data, error } = await admin.from(t).select("*").limit(1);
  if (!error && data && data[0]) {
    console.log(`\n${t} columns:`, Object.keys(data[0]).join(", "));
  }
}
