/**
 * Merge two PreloadedContext payloads — typically the verified
 * client-supplied passthrough + the server-side always-on builder.
 *
 * Per `Latency:Efficiency/06-implementation-plan.md §WU5` merge rule:
 *
 *   For singleton slots (my_placement, my_jobs, etc.):
 *     server wins (no overlap expected — pages typically don't ship
 *     these as preload).
 *
 *   For array slots (children_profiles, children_recent_feeds):
 *     merge by child_id. CLIENT wins per-child on overlap (the page
 *     just rendered with that child's data, fresher than the
 *     server's just-fetched copy).
 *
 * Returns a new PreloadedContext; does not mutate inputs.
 *
 * Spec: system/APP/BLOOMBOT/Latency:Efficiency/06-implementation-plan.md §WU5
 */

import type { PreloadedContext } from "./types";

export interface MergeInput {
  /** Verified pre-load from `body.preload` (post `verifyPreload`). */
  client: PreloadedContext | undefined;
  /** Server-built always-on context. */
  server: PreloadedContext | undefined;
}

/**
 * Merges two PreloadedContext payloads. Either may be undefined.
 * Returns undefined when both are undefined / empty.
 */
export function mergePreloads(input: MergeInput): PreloadedContext | undefined {
  const { client, server } = input;
  if (!client && !server) return undefined;

  const out: PreloadedContext = {};

  // as_of: prefer the most recent timestamp (server is freshly built;
  // client may have been rendered seconds ago).
  const asOf = pickFreshestAsOf(client?.as_of, server?.as_of);
  if (asOf) out.as_of = asOf;

  // ── children_profiles: per-child merge, client wins ──
  // Only assign when we actually have entries — don't add the key
  // with `undefined` value (would inflate Object.keys checks).
  const profilesMerged = mergeChildArray(
    client?.children_profiles,
    server?.children_profiles,
  );
  if (profilesMerged && profilesMerged.length > 0) {
    out.children_profiles = profilesMerged;
  }

  // ── children_recent_feeds: per-child merge, client wins ──
  const feedsMerged = mergeChildArray(
    client?.children_recent_feeds,
    server?.children_recent_feeds,
  );
  if (feedsMerged && feedsMerged.length > 0) {
    out.children_recent_feeds = feedsMerged;
  }

  // ── singleton slots: server wins ──
  if (server?.recent_agent_memory) {
    out.recent_agent_memory = server.recent_agent_memory;
  } else if (client?.recent_agent_memory) {
    out.recent_agent_memory = client.recent_agent_memory;
  }
  if (server?.my_profile_basics) {
    out.my_profile_basics = server.my_profile_basics;
  } else if (client?.my_profile_basics) {
    out.my_profile_basics = client.my_profile_basics;
  }
  if (server?.my_placement) {
    out.my_placement = server.my_placement;
  } else if (client?.my_placement) {
    out.my_placement = client.my_placement;
  }
  if (server?.my_jobs) {
    out.my_jobs = server.my_jobs;
  } else if (client?.my_jobs) {
    out.my_jobs = client.my_jobs;
  }
  if (server?.my_job_matches) {
    out.my_job_matches = server.my_job_matches;
  } else if (client?.my_job_matches) {
    out.my_job_matches = client.my_job_matches;
  }
  if (server?.connection_detail) {
    out.connection_detail = server.connection_detail;
  } else if (client?.connection_detail) {
    out.connection_detail = client.connection_detail;
  }
  if (server?.connection_inbox) {
    out.connection_inbox = server.connection_inbox;
  } else if (client?.connection_inbox) {
    out.connection_inbox = client.connection_inbox;
  }
  if (server?.verification_status) {
    out.verification_status = server.verification_status;
  } else if (client?.verification_status) {
    out.verification_status = client.verification_status;
  }

  return Object.keys(out).filter((k) => k !== "as_of").length > 0
    ? out
    : undefined;
}

interface ChildArrayEntry {
  child_id: string;
}

/**
 * Merges two arrays keyed by child_id. CLIENT entries take precedence
 * on overlap. Returns a new array (or undefined when both inputs are
 * absent).
 */
function mergeChildArray<T extends ChildArrayEntry>(
  client: T[] | undefined,
  server: T[] | undefined,
): T[] | undefined {
  if (!client && !server) return undefined;
  const byChild = new Map<string, T>();
  // Server first (lower priority).
  for (const e of server ?? []) byChild.set(e.child_id, e);
  // Then client (overwrites).
  for (const e of client ?? []) byChild.set(e.child_id, e);
  return Array.from(byChild.values());
}

function pickFreshestAsOf(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}
