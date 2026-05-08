/**
 * Env-level feature flags for Katie (client-facing name for BloomBot).
 * Read once at module load; typed accessors only.
 *
 * All flags default to DISABLED so production is safe unless explicitly enabled.
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
 * Summary of flags — useful for admin debugging and health endpoints.
 * Never exposed to user-facing APIs.
 */
export function getKatieFlags() {
  return {
    KATIE_ENABLED,
    PROACTIVE_ENABLED,
    KATIE_DAILY_LIMIT_USD,
    KATIE_IMAGE_MARKER_ENABLED,
    KATIE_STREAM_DIAGNOSTICS,
  };
}
