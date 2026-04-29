/**
 * Human-friendly relative time strings for prefixing history messages
 * fed to Gemini. Tells the model when each prior turn happened so it
 * can reason about freshness — e.g. "the user was here 3 days ago and
 * now they're back, my prior tool results may be stale".
 *
 * Buckets are coarse on purpose (not minute-level granularity) — Gemini
 * doesn't need second precision to make freshness judgements, and
 * coarse strings cost fewer tokens.
 */

export function formatRelativeTime(isoString: string, now: Date): string {
  const ts = new Date(isoString).getTime();
  if (!Number.isFinite(ts)) return "earlier";
  const diffMs = now.getTime() - ts;
  if (diffMs < 0) return "just now"; // future timestamp — clock skew

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;

  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/**
 * Three-tier classification for the gap from the most-recent prior
 * message. Drives the strength of the freshness warning in the
 * runtime system-prompt header.
 *
 *   - "fresh" (< 15 min) — same-session continuous chat. No warning;
 *     state probably hasn't moved.
 *   - "warming" (15 min – 4 h) — user might have stepped away. Soft
 *     warning: prefer fresh tool calls but don't make a fuss.
 *   - "stale" (>= 4 h) — meaningful gap. Strong warning: any state-
 *     dependent answer must come from a fresh tool call, not history.
 *
 * Connection stages can advance in seconds, but most real-life gaps
 * either side of the 4h boundary correlate with "left + came back",
 * which is what we care about.
 */
export type GapTier = "fresh" | "warming" | "stale";

const FRESH_THRESHOLD_MS = 15 * 60 * 1000; //  15 min
const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; //  4 h

export function classifyGap(
  lastMessageIso: string | null | undefined,
  now: Date,
): GapTier {
  if (!lastMessageIso) return "fresh"; // first chat ever — no gap
  const ts = new Date(lastMessageIso).getTime();
  if (!Number.isFinite(ts)) return "fresh";
  const diff = now.getTime() - ts;
  if (diff < FRESH_THRESHOLD_MS) return "fresh";
  if (diff < STALE_THRESHOLD_MS) return "warming";
  return "stale";
}
