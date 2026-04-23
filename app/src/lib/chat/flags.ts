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
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === "") return defaultValue;
  const n = Number(value);
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
 * Summary of flags — useful for admin debugging and health endpoints.
 * Never exposed to user-facing APIs.
 */
export function getKatieFlags() {
  return {
    KATIE_ENABLED,
    PROACTIVE_ENABLED,
    KATIE_DAILY_LIMIT_USD,
  };
}
