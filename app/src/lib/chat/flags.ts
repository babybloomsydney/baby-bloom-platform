/**
 * Env-level feature flags for Katie (client-facing name for BloomBot).
 * Read once at module load; typed accessors only.
 *
 * Most flags default to DISABLED so production is safe unless explicitly
 * enabled. The Latency:Efficiency build (2026-05-09) introduced
 * kill-switch-style flags (KATIE_PARALLEL_TOOLS_ENABLED,
 * KATIE_PRELOAD_PASSTHROUGH_ENABLED, KATIE_ALWAYS_ON_CONTEXT_ENABLED) that
 * default to TRUE — Bailey's directive is "speed by default; flag-off
 * if anything regresses." Each kill-switch flag's JSDoc says "Default: true".
 *
 * Set in `.env.local` (local dev) and in Vercel env (preview + production).
 * See system/APP/BLOOMBOT/IMPLEMENTATION-PLAN.md WU 0.10.
 */

function parseBool(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  // Trim before comparing — env vars added via `echo "true" | vercel env add`
  // pick up a trailing newline that would otherwise make `=== "true"` fail
  // and silently disable every Katie gate. Defensive against any env-setup
  // tool that surrounds the value with whitespace.
  const trimmed = value.trim();
  if (trimmed === "") return defaultValue;
  return trimmed.toLowerCase() === "true" || trimmed === "1";
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const trimmed = value.trim();
  if (trimmed === "") return defaultValue;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : defaultValue;
}

/**
 * Master switch — when false, `/api/chat` returns 404 and Katie UI is hidden.
 * Default: false (safe in production).
 *
 * Server-side: reads KATIE_ENABLED directly (never sent to the browser).
 * Client-side: reads NEXT_PUBLIC_KATIE_ENABLED so the UI can gate itself.
 * Both should typically be set together; server is the authoritative guard
 * for the API route.
 */
export const KATIE_ENABLED = parseBool(
  process.env.KATIE_ENABLED ?? process.env.NEXT_PUBLIC_KATIE_ENABLED,
  false,
);

/**
 * Gate for proactive messages (scheduler + action-triggered dispatches).
 * Implies KATIE_ENABLED. When false, only reactive chat works.
 * Default: false.
 */
export const PROACTIVE_ENABLED =
  KATIE_ENABLED && parseBool(process.env.PROACTIVE_ENABLED, false);

/**
 * Daily cost cap per bot, in USD. Applied server-side to Gemini calls.
 * Default: 0.65 USD (~ A$1 at 0.65 USD/AUD).
 */
export const KATIE_DAILY_LIMIT_USD = parseNumber(
  process.env.KATIE_DAILY_LIMIT_USD,
  0.65,
);

/**
 * Image-attach marker gate. When true, the chat client embeds
 * `[Image attached: <url>]` into user messages whenever the user
 * has uploaded an image via the action menu. Default: ON since
 * WU 9.1 — the system prompt now teaches Katie how to handle the
 * marker (logging_rules section, "Image attachments" subsection).
 *
 * The flag is preserved (not removed) as a kill-switch in case the
 * marker creates surprising replies in production — flip the env
 * var to false and the chat client suppresses the marker without
 * a code change.
 *
 * Server-side: reads KATIE_IMAGE_MARKER_ENABLED.
 * Client-side: reads NEXT_PUBLIC_KATIE_IMAGE_MARKER_ENABLED.
 */
export const KATIE_IMAGE_MARKER_ENABLED = parseBool(
  process.env.KATIE_IMAGE_MARKER_ENABLED ??
    process.env.NEXT_PUBLIC_KATIE_IMAGE_MARKER_ENABLED,
  true,
);

/**
 * F1 — parallel tool execution within a Gemini round (Latency:Efficiency
 * build, 2026-05-09). When true, the chat route's per-round tool loop
 * uses `Promise.all(roundCalls.map(runTool))` instead of awaiting each
 * tool sequentially. SSE event order is preserved by emitting
 * `tool_call` events upfront and `tool_result` events from the resolved
 * results in original order.
 *
 * Default: true. Server-only flag. Set `KATIE_PARALLEL_TOOLS_ENABLED=false`
 * to revert to the sequential path without a redeploy.
 */
export const KATIE_PARALLEL_TOOLS_ENABLED = parseBool(
  process.env.KATIE_PARALLEL_TOOLS_ENABLED,
  true,
);

/**
 * F2 — accept `body.preload` from the chat client (Latency:Efficiency
 * build, 2026-05-09). When true, the chat route accepts a
 * `PreloadedContext` slot in the request body, verifies each entry,
 * and embeds the verified slots in the runtime context block so Katie
 * can answer from already-loaded data instead of round-tripping through
 * tools.
 *
 * Server-side: drops `body.preload` silently when false (kill-switch
 * behaviour, no logs to avoid noise).
 * Client-side: when `NEXT_PUBLIC_KATIE_PRELOAD_PASSTHROUGH_ENABLED=false`,
 * the chat client omits `preload` from the request body — keeps the
 * wire payload small and prevents stale context if the server is
 * disabled.
 *
 * Default: true (both sides).
 */
export const KATIE_PRELOAD_PASSTHROUGH_ENABLED = parseBool(
  process.env.KATIE_PRELOAD_PASSTHROUGH_ENABLED ??
    process.env.NEXT_PUBLIC_KATIE_PRELOAD_PASSTHROUGH_ENABLED,
  true,
);

/**
 * F3 — server-side always-on context fetches (Latency:Efficiency
 * build, 2026-05-09). When true, the chat route runs
 * `buildAlwaysOnContext` alongside `buildMemoryTable` and
 * `buildDevelopmentalSnapshots` in the pre-flight `Promise.all`. The
 * builder pre-fetches all-children profiles + recent feeds + recent
 * agent memory + my-profile-basics so Katie can answer about any
 * accessible child without a tool round.
 *
 * Slots populated when this flag is true: `children_profiles`,
 * `children_recent_feeds`, `recent_agent_memory`, `my_profile_basics`.
 *
 * NOT populated by this builder (per amendment 2026-05-09):
 * `connection_inbox` and `verification_status` are surface-scoped —
 * published per-page in WU8 (only on the inbox / verification pages),
 * not by always-on.
 *
 * Default: true. Server-only flag.
 */
export const KATIE_ALWAYS_ON_CONTEXT_ENABLED = parseBool(
  process.env.KATIE_ALWAYS_ON_CONTEXT_ENABLED,
  true,
);

/**
 * Typewriter spoof on the streaming path. When true, Katie's deck
 * smooths the SSE delta stream into a steady char-by-char visible
 * trickle (V1.1 side fix 2b). Defensive UX layer that addresses the
 * "3-dots → block of text" symptom regardless of root cause (Gemini
 * chunking vs HTTP buffering vs React batching). Default: true since
 * V1.1 ships the spoof as the chosen outcome of the side-fix-2 fork.
 *
 * Set NEXT_PUBLIC_KATIE_TYPEWRITER_ENABLED=false to disable from the
 * client side (e.g. once a real streaming fix lands and the spoof
 * is no longer needed).
 */
export const KATIE_TYPEWRITER_ENABLED = parseBool(
  process.env.NEXT_PUBLIC_KATIE_TYPEWRITER_ENABLED,
  true,
);

/**
 * Diagnostic instrumentation for the streaming path. When true, both
 * the server SSE encode boundary and the client SSE parse boundary
 * log per-chunk timestamps + length so we can attribute the
 * "3-dots → block of text" symptom to one of: (a) Gemini emitting
 * large chunks, (b) HTTP buffering between Gemini and the client,
 * (c) React render batching the deltas. Default: false.
 *
 * Server-side: reads KATIE_STREAM_DIAGNOSTICS.
 * Client-side: reads NEXT_PUBLIC_KATIE_STREAM_DIAGNOSTICS.
 *
 * Logs are intentionally noisy (one line per text chunk) — only
 * enable for short diagnostic windows, never as a steady state.
 */
export const KATIE_STREAM_DIAGNOSTICS = parseBool(
  process.env.KATIE_STREAM_DIAGNOSTICS ??
    process.env.NEXT_PUBLIC_KATIE_STREAM_DIAGNOSTICS,
  false,
);

/**
 * Aggregate of every flag's resolved boolean / numeric value. Useful
 * for admin debugging + health endpoints. Never exposed to user-facing
 * APIs (would leak internal kill-switch state).
 *
 * Explicit return type so call sites get a typed contract without
 * having to read the body — consumed by the admin Katie inspection
 * surface and a future health endpoint.
 */
export interface KatieFlags {
  KATIE_ENABLED: boolean;
  PROACTIVE_ENABLED: boolean;
  KATIE_DAILY_LIMIT_USD: number;
  KATIE_IMAGE_MARKER_ENABLED: boolean;
  KATIE_STREAM_DIAGNOSTICS: boolean;
  KATIE_TYPEWRITER_ENABLED: boolean;
  KATIE_PARALLEL_TOOLS_ENABLED: boolean;
  KATIE_PRELOAD_PASSTHROUGH_ENABLED: boolean;
  KATIE_ALWAYS_ON_CONTEXT_ENABLED: boolean;
}

export function getKatieFlags(): KatieFlags {
  return {
    KATIE_ENABLED,
    PROACTIVE_ENABLED,
    KATIE_DAILY_LIMIT_USD,
    KATIE_IMAGE_MARKER_ENABLED,
    KATIE_STREAM_DIAGNOSTICS,
    KATIE_TYPEWRITER_ENABLED,
    KATIE_PARALLEL_TOOLS_ENABLED,
    KATIE_PRELOAD_PASSTHROUGH_ENABLED,
    KATIE_ALWAYS_ON_CONTEXT_ENABLED,
  };
}
