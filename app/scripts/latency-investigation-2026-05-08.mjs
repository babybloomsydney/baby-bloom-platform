#!/usr/bin/env node
/**
 * Latency-investigation analyser — V1.1 side fix 3.
 *
 * Five sections, all written as JSON to stdout so the report can
 * embed real numbers rather than estimates:
 *
 *   1. cache-stats     — % cache_hit, miss reasons, TTL behaviour from
 *                        chat_messages.metadata over the last 30 days.
 *   2. prompt-size     — measured by importing the real prompt builder
 *                        and dumping byte counts per section.
 *   3. tool-rounds     — per-turn tool_calls count + duration_ms
 *                        distribution from chat_messages.metadata.
 *   4. model-compare   — runs N representative prompts through both
 *                        Flash and Pro, captures TTFT + total + outputs.
 *   5. ttft-vs-total   — for live runs, distinguishes time-to-first-text
 *                        from total wall-time. Falls back to
 *                        duration_ms-only summary when only telemetry
 *                        is available.
 *
 * Usage:
 *   node scripts/latency-investigation-2026-05-08.mjs <section>
 *
 * Sections: cache-stats | prompt-size | tool-rounds | model-compare | ttft | all
 *
 * Read-only against prod Supabase. Write-only against Gemini for the
 * model-compare path (10 prompts × 2 models = ~$0.30 expected).
 */

import path from "node:path";
import url from "node:url";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");

// Minimal .env.local loader — avoids the dotenv dependency so the
// script can run from anywhere with the app's local node_modules.
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}
loadEnv(path.join(APP_ROOT, ".env.local"));

function need(envName) {
  const v = process.env[envName];
  if (!v) {
    console.error(`[latency-investigation] missing env: ${envName}`);
    process.exit(1);
  }
  return v;
}

const supabaseUrl = need("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = need("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─────────────────────────────────────────────────────────────────────
// Section 1 — cache-stats
// ─────────────────────────────────────────────────────────────────────
async function cacheStats() {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data, error } = await supabase
    .from("chat_messages")
    .select("metadata, created_at")
    .eq("role", "assistant")
    .eq("trigger_source", "assistant_reply")
    .gte("created_at", since.toISOString())
    .limit(5000);
  if (error) throw error;

  const rows = (data ?? [])
    .map((r) => r.metadata ?? {})
    .filter((m) => typeof m === "object" && m);

  const total = rows.length;
  const cacheHits = rows.filter((m) => m.cache_hit === true).length;
  const cacheMisses = rows.filter((m) => m.cache_hit === false).length;
  const cacheUnknown = total - cacheHits - cacheMisses;

  const promptVersions = new Map();
  for (const m of rows) {
    const k = m.prompt_version_hash ?? "none";
    promptVersions.set(k, (promptVersions.get(k) ?? 0) + 1);
  }

  const cachedTokensSum = rows.reduce(
    (s, m) => s + (typeof m.cached_tokens === "number" ? m.cached_tokens : 0),
    0,
  );
  const inputTokensSum = rows.reduce(
    (s, m) => s + (typeof m.input_tokens === "number" ? m.input_tokens : 0),
    0,
  );

  return {
    window_days: 30,
    total_assistant_turns: total,
    cache_hits: cacheHits,
    cache_misses: cacheMisses,
    cache_unknown: cacheUnknown,
    cache_hit_rate: total > 0 ? +((cacheHits / total) * 100).toFixed(1) : null,
    cached_tokens_total: cachedTokensSum,
    input_tokens_total: inputTokensSum,
    cached_token_share: inputTokensSum > 0
      ? +((cachedTokensSum / inputTokensSum) * 100).toFixed(1)
      : null,
    prompt_version_distribution: Object.fromEntries(promptVersions),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Section 3 — tool-rounds + duration distribution
// ─────────────────────────────────────────────────────────────────────
async function toolRounds() {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data, error } = await supabase
    .from("chat_messages")
    .select("metadata, created_at")
    .eq("role", "assistant")
    .eq("trigger_source", "assistant_reply")
    .gte("created_at", since.toISOString())
    .limit(5000);
  if (error) throw error;

  const rows = (data ?? [])
    .map((r) => r.metadata ?? {})
    .filter((m) => typeof m === "object" && m);

  // duration_ms percentiles
  const durations = rows
    .map((m) => (typeof m.duration_ms === "number" ? m.duration_ms : null))
    .filter((d) => d !== null)
    .sort((a, b) => a - b);

  function pct(p) {
    if (durations.length === 0) return null;
    const i = Math.floor((p / 100) * (durations.length - 1));
    return durations[i];
  }

  // tool-calls per turn
  const toolCallCounts = rows
    .map((m) => (Array.isArray(m.tool_calls) ? m.tool_calls.length : 0));
  const turnsByToolCount = new Map();
  for (const c of toolCallCounts) {
    turnsByToolCount.set(c, (turnsByToolCount.get(c) ?? 0) + 1);
  }

  // duration vs tool-count correlation — average duration in each bucket
  const buckets = new Map();
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    const c = Array.isArray(m.tool_calls) ? m.tool_calls.length : 0;
    if (typeof m.duration_ms !== "number") continue;
    if (!buckets.has(c)) buckets.set(c, []);
    buckets.get(c).push(m.duration_ms);
  }
  const durationByToolCount = {};
  for (const [c, arr] of buckets.entries()) {
    arr.sort((a, b) => a - b);
    durationByToolCount[c] = {
      n: arr.length,
      p50: arr[Math.floor(arr.length / 2)],
      p95: arr[Math.floor(arr.length * 0.95)],
    };
  }

  // Tool name frequency — what's actually being called
  const toolNameCounts = new Map();
  for (const m of rows) {
    if (!Array.isArray(m.tool_calls)) continue;
    for (const tc of m.tool_calls) {
      if (typeof tc?.name === "string") {
        toolNameCounts.set(tc.name, (toolNameCounts.get(tc.name) ?? 0) + 1);
      }
    }
  }
  const topTools = [...toolNameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  return {
    n_turns: rows.length,
    duration_ms: {
      p50: pct(50),
      p75: pct(75),
      p90: pct(90),
      p95: pct(95),
      p99: pct(99),
    },
    turns_by_tool_count: Object.fromEntries(turnsByToolCount),
    duration_by_tool_count: durationByToolCount,
    top_tools_called: Object.fromEntries(topTools),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Section 4 — model-compare (live API spend)
// ─────────────────────────────────────────────────────────────────────
const REPRESENTATIVE_PROMPTS = [
  // 1. Simple greeting — no tool use, short answer
  "Hi Katie! How are you?",
  // 2. Single-tool read — should call read_child_profile
  "What do you know about my child?",
  // 3. Activity request — common path
  "Suggest a 10-minute activity for an 18-month-old.",
  // 4. Schedule check — multi-tool potential
  "What does my schedule look like this week?",
  // 5. Memory write — write tool
  "Remember that my child loves puzzles.",
  // 6. Onboarding-style question
  "What can you help me with?",
  // 7. Verification status — domain-specific
  "What's my verification level?",
  // 8. Complex reasoning — likely multi-round
  "Plan an activity that hits both gross motor and language milestones.",
  // 9. Job search — different module
  "Are there any new jobs near me?",
  // 10. Connections — different module
  "Have I got any new connection requests?",
];

async function modelCompare() {
  const apiKey = need("GOOGLE_AI_API_KEY");
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const results = {
    flash: [],
    pro: [],
    summary: {},
  };

  // Cap each call at 30s — Pro can hang on long prompts; we want
  // partial data over hangs.
  const PER_CALL_TIMEOUT_MS = 30_000;
  // Bound output to short answers — the comparison is about TTFT and
  // model speed, not response length. The system prompt nudges Katie
  // to be terse anyway.
  const SYSTEM = "You are a terse assistant. Answer in 1-2 sentences.";

  async function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms),
      ),
    ]);
  }

  // Incremental snapshot path — write to disk after each call so even
  // if Pro hangs on a prompt we keep the prior data.
  const snapshotPath = path.join(APP_ROOT, "scripts/_run-output/model-compare-2026-05-08.json");
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  function snapshot() {
    fs.writeFileSync(snapshotPath, JSON.stringify(results, null, 2));
  }

  for (const variant of [
    { id: "gemini-3-flash-preview", name: "flash" },
    { id: "gemini-3-pro-preview", name: "pro" },
  ]) {
    for (const prompt of REPRESENTATIVE_PROMPTS) {
      process.stderr.write(`  ▸ ${variant.name} :: ${prompt.slice(0, 50)}…\n`);
      const t0 = Date.now();
      let firstTextAt = null;
      let outputText = "";
      let usage = null;
      const result = { prompt: prompt.slice(0, 60) };
      try {
        const stream = await withTimeout(
          ai.models.generateContentStream({
            model: variant.id,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { systemInstruction: SYSTEM, maxOutputTokens: 200 },
          }),
          PER_CALL_TIMEOUT_MS,
        );
        const consume = (async () => {
          for await (const chunk of stream) {
            if (chunk.text && firstTextAt === null) firstTextAt = Date.now();
            if (chunk.text) outputText += chunk.text;
            if (chunk.usageMetadata) usage = chunk.usageMetadata;
          }
        })();
        await withTimeout(consume, PER_CALL_TIMEOUT_MS);
        const t1 = Date.now();
        Object.assign(result, {
          ttft_ms: firstTextAt ? firstTextAt - t0 : null,
          total_ms: t1 - t0,
          output_chars: outputText.length,
          input_tokens: usage?.promptTokenCount ?? null,
          output_tokens: usage?.candidatesTokenCount ?? null,
          output_preview: outputText.slice(0, 240),
        });
      } catch (err) {
        Object.assign(result, {
          error: err instanceof Error ? err.message : String(err),
          ttft_ms: firstTextAt ? firstTextAt - t0 : null,
          partial_total_ms: Date.now() - t0,
          output_chars: outputText.length,
          output_preview: outputText.slice(0, 240),
        });
      }
      results[variant.name].push(result);
      snapshot();
    }
  }

  // Summary stats per variant
  for (const v of ["flash", "pro"]) {
    const ttfts = results[v].map((r) => r.ttft_ms).filter((x) => typeof x === "number");
    const totals = results[v].map((r) => r.total_ms).filter((x) => typeof x === "number");
    ttfts.sort((a, b) => a - b);
    totals.sort((a, b) => a - b);
    results.summary[v] = {
      n: results[v].length,
      ttft_p50: ttfts[Math.floor(ttfts.length / 2)] ?? null,
      ttft_p95: ttfts[Math.floor(ttfts.length * 0.95)] ?? null,
      total_p50: totals[Math.floor(totals.length / 2)] ?? null,
      total_p95: totals[Math.floor(totals.length * 0.95)] ?? null,
      ttft_mean: ttfts.length
        ? +(ttfts.reduce((s, x) => s + x, 0) / ttfts.length).toFixed(0)
        : null,
      total_mean: totals.length
        ? +(totals.reduce((s, x) => s + x, 0) / totals.length).toFixed(0)
        : null,
    };
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────
const section = process.argv[2] ?? "all";

const sections = {
  "cache-stats": cacheStats,
  "tool-rounds": toolRounds,
  "model-compare": modelCompare,
};

(async () => {
  if (section === "all") {
    const out = {};
    for (const [name, fn] of Object.entries(sections)) {
      try {
        process.stderr.write(`▶ running ${name}…\n`);
        out[name] = await fn();
      } catch (err) {
        out[name] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else if (sections[section]) {
    const out = await sections[section]();
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  } else {
    console.error(`Unknown section: ${section}`);
    console.error(`Sections: ${Object.keys(sections).join(", ")}, all`);
    process.exit(1);
  }
})();
