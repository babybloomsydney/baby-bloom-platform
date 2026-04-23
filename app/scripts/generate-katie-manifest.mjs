#!/usr/bin/env node
/**
 * Generates public/katie-manifest.json — a static snapshot of the system
 * that admin Katie can read via the `read_system_inventory` tool.
 *
 * Covers:
 *   - HTTP routes (src/app/api/** /route.ts)
 *   - Page routes (src/app/** /page.tsx, excluding api/)
 *   - Cron schedules (vercel.json)
 *   - Supabase migrations (supabase/migrations/*.sql)
 *   - Server-action files (src/lib/actions/** /*.ts with "use server")
 *
 * Module + tool inventory lives in the runtime registry and is exposed
 * separately via read_module_registry — no reason to duplicate it here.
 *
 * Usage:
 *   node scripts/generate-katie-manifest.mjs
 */

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();

async function walk(dir, match) {
  const hits = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      hits.push(...(await walk(p, match)));
    } else if (match(p)) {
      hits.push(p);
    }
  }
  return hits;
}

function routePathFromFile(file) {
  // src/app/api/chat/route.ts -> /api/chat
  // src/app/admin/katie-proposals/page.tsx -> /admin/katie-proposals
  const rel = relative(join(ROOT, "src/app"), file).replace(/\\/g, "/");
  const parts = rel.split("/").slice(0, -1); // drop filename
  // Strip route-group parens ((public), (auth), etc.)
  const clean = parts.filter((p) => !(p.startsWith("(") && p.endsWith(")")));
  return "/" + clean.join("/");
}

function extractHttpMethods(source) {
  const methods = [];
  for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
    const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`);
    if (re.test(source)) methods.push(m);
  }
  return methods;
}

function extractServerActions(source) {
  if (!source.includes('"use server"') && !source.includes("'use server'")) {
    return [];
  }
  const actions = [];
  const re = /export\s+(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(source)) !== null) actions.push(m[1]);
  return actions;
}

async function main() {
  const generatedAt = new Date().toISOString();

  // ── API + page routes ─────────────────────────────────────────────────
  const appDir = join(ROOT, "src/app");
  const routeFiles = await walk(appDir, (p) => /route\.tsx?$/.test(p));
  const pageFiles = await walk(appDir, (p) => /page\.tsx?$/.test(p));

  const routes = [];
  for (const f of routeFiles) {
    const src = await readFile(f, "utf8");
    routes.push({
      path: routePathFromFile(f),
      methods: extractHttpMethods(src),
      file: relative(ROOT, f),
    });
  }
  const pages = pageFiles.map((f) => ({
    path: routePathFromFile(f),
    file: relative(ROOT, f),
  }));

  // ── Cron schedules ────────────────────────────────────────────────────
  let crons = [];
  try {
    const vj = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"));
    crons = vj.crons ?? [];
  } catch {
    // no vercel.json — ok
  }

  // ── Supabase migrations ───────────────────────────────────────────────
  const migDir = join(ROOT, "supabase/migrations");
  const migrations = [];
  try {
    const entries = await readdir(migDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".sql")) continue;
      const p = join(migDir, e.name);
      const st = await stat(p);
      migrations.push({
        filename: e.name,
        bytes: st.size,
        modified_at: st.mtime.toISOString(),
      });
    }
    migrations.sort((a, b) => a.filename.localeCompare(b.filename));
  } catch {
    // no migrations dir — ok
  }

  // ── Server actions ────────────────────────────────────────────────────
  const actionDir = join(ROOT, "src/lib/actions");
  const actionFiles = await walk(actionDir, (p) => /\.tsx?$/.test(p)).catch(
    () => [],
  );
  const serverActions = [];
  for (const f of actionFiles) {
    const src = await readFile(f, "utf8").catch(() => "");
    const fns = extractServerActions(src);
    if (fns.length > 0) {
      serverActions.push({ file: relative(ROOT, f), functions: fns });
    }
  }

  const manifest = {
    generated_at: generatedAt,
    summary: {
      route_count: routes.length,
      page_count: pages.length,
      cron_count: crons.length,
      migration_count: migrations.length,
      server_action_file_count: serverActions.length,
    },
    routes,
    pages,
    crons,
    migrations,
    server_actions: serverActions,
  };

  const outPath = join(ROOT, "public/katie-manifest.json");
  await writeFile(outPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`wrote ${relative(ROOT, outPath)}`);
  console.log(
    `  routes=${routes.length} pages=${pages.length} crons=${crons.length} migrations=${migrations.length} server_action_files=${serverActions.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
