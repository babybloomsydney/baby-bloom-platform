/**
 * Render the verified pre-loaded context as a Markdown block for
 * Katie's runtime context.
 *
 * The block lands in the priming turn of every chat request that has
 * `BotContext.preload` populated. Per amendment 2026-05-09, child
 * data is the always-on focus — children_profiles + children_recent_feeds
 * appear FIRST, then memory + profile, then surface-scoped slots.
 *
 * Format choices:
 *   - Heading "## Already loaded for you" matches the convention used
 *     by the runtime header + memory + dev snapshot blocks.
 *   - Each sub-block has its own h3 with an inline "as of" timestamp
 *     so Katie can decide on freshness per slot. Per spec D-11.
 *   - Recent feed renders as a count + a 1-line summary per most
 *     recent entry — NOT a full JSON dump. Token-efficient and
 *     human-readable.
 *   - Returns null when nothing is populated, so the caller's
 *     `if (block) parts.push(block)` is a clean no-op.
 *
 * Spec: system/APP/BLOOMBOT/Latency:Efficiency/03-design-decisions.md D-11
 */

import type { PreloadedContext } from "./types";

export function renderPreloadBlock(
  preload: PreloadedContext | undefined,
): string | null {
  if (!preload) return null;
  if (!hasAnySlot(preload)) return null;

  const lines: string[] = [];
  lines.push("## Already loaded for you");
  lines.push(
    "(this data was loaded server-side or from the page the user opened — use it directly unless you need fresher data; the per-block timestamps tell you how recent each block is)",
  );

  const asOfRoot = preload.as_of ?? "(unknown)";

  // ── children_profiles (always-on; renders first) ──
  if (preload.children_profiles && preload.children_profiles.length > 0) {
    for (const entry of preload.children_profiles) {
      lines.push("");
      lines.push(
        `### Child profile — ${entry.profile.first_name} (as of ${asOfRoot})`,
      );
      lines.push(`Child ID: ${entry.profile.id}`);
      lines.push(`First name: ${entry.profile.first_name}`);
      lines.push(`DOB: ${entry.profile.date_of_birth}`);
      if (entry.profile.gender) lines.push(`Gender: ${entry.profile.gender}`);
      lines.push(`Under three: ${entry.profile.under_three ? "yes" : "no"}`);
      lines.push(`Status: ${entry.profile.status}`);
    }
  }

  // ── children_recent_feeds ──
  if (
    preload.children_recent_feeds &&
    preload.children_recent_feeds.length > 0
  ) {
    for (const entry of preload.children_recent_feeds) {
      lines.push("");
      lines.push(
        `### Recent feed — child ${entry.child_id} (${entry.items.length} entries, as of ${asOfRoot})`,
      );
      if (entry.items.length === 0) {
        lines.push("(no entries yet)");
      } else {
        for (const item of entry.items) {
          // One line per entry — date, type, brief gist.
          const date = item.created_at?.slice(0, 10) ?? "";
          const type = item.type ?? "?";
          const gist = summariseFeedItem(item);
          lines.push(`- ${date} [${type}] ${gist}`);
        }
      }
    }
  }

  // ── recent_agent_memory ──
  if (
    preload.recent_agent_memory &&
    preload.recent_agent_memory.items.length > 0
  ) {
    lines.push("");
    lines.push(`### Recent memory (as of ${asOfRoot})`);
    for (const m of preload.recent_agent_memory.items) {
      const scope = m.scope === "shared_child" ? `child ${m.child_id}` : "user";
      lines.push(`- [${scope}] ${m.key}: ${m.value}`);
    }
  }

  // ── my_profile_basics ──
  if (preload.my_profile_basics) {
    lines.push("");
    lines.push(`### Your profile (as of ${asOfRoot})`);
    const fn = preload.my_profile_basics.first_name;
    const ln = preload.my_profile_basics.last_name;
    lines.push(`Name: ${fn}${ln ? " " + ln : ""}`);
    lines.push(`Role: ${preload.my_profile_basics.role}`);
  }

  // ── my_placement (surface-scoped) ──
  if (preload.my_placement) {
    lines.push("");
    lines.push(`### Current placement (as of ${asOfRoot})`);
    lines.push(`Placement ID: ${preload.my_placement.placement_id}`);
    lines.push(`Partner: ${preload.my_placement.summary.partner_name}`);
    lines.push(`Started: ${preload.my_placement.summary.started_at}`);
    lines.push(`Your role here: ${preload.my_placement.summary.role}`);
  }

  // ── my_jobs ──
  if (preload.my_jobs) {
    lines.push("");
    lines.push(`### Open jobs (as of ${asOfRoot})`);
    lines.push(`Count: ${preload.my_jobs.open_positions_count}`);
    for (const s of preload.my_jobs.summaries) {
      lines.push(`- ${s.id} — ${s.suburb} (created ${s.created_at})`);
    }
  }

  // ── my_job_matches ──
  if (preload.my_job_matches) {
    lines.push("");
    lines.push(`### Job matches (as of ${asOfRoot})`);
    for (const m of preload.my_job_matches.matches) {
      lines.push(`- ${m.first_name} (id ${m.nanny_id}, score ${m.score})`);
    }
  }

  // ── connection_detail ──
  if (preload.connection_detail) {
    lines.push("");
    lines.push(`### Connection detail (as of ${asOfRoot})`);
    lines.push(`Connection ID: ${preload.connection_detail.connection_id}`);
    lines.push(`Partner: ${preload.connection_detail.summary.partner_name}`);
    lines.push(`Stage: ${preload.connection_detail.summary.stage}`);
    if (preload.connection_detail.summary.last_message_at) {
      lines.push(
        `Last message: ${preload.connection_detail.summary.last_message_at}`,
      );
    }
  }

  // ── connection_inbox (surface-scoped — only when on inbox page) ──
  if (preload.connection_inbox) {
    lines.push("");
    lines.push(`### Connection inbox (as of ${asOfRoot})`);
    lines.push(`Pending count: ${preload.connection_inbox.pending_count}`);
    if (preload.connection_inbox.recent) {
      for (const r of preload.connection_inbox.recent) {
        lines.push(`- ${r.partner_name} (received ${r.received_at})`);
      }
    }
  }

  // ── verification_status (surface-scoped — only when on verification page) ──
  if (preload.verification_status) {
    lines.push("");
    lines.push(`### Verification status (as of ${asOfRoot})`);
    lines.push(
      `Level ${preload.verification_status.level}, status_code ${preload.verification_status.status_code}, "${preload.verification_status.label}"`,
    );
    if (preload.verification_status.blocking_issues.length > 0) {
      lines.push("Blocking issues:");
      for (const issue of preload.verification_status.blocking_issues) {
        lines.push(`- ${issue}`);
      }
    } else {
      lines.push("No blocking issues.");
    }
  }

  return lines.join("\n");
}

function hasAnySlot(p: PreloadedContext): boolean {
  return Boolean(
    (p.children_profiles && p.children_profiles.length > 0) ||
    (p.children_recent_feeds && p.children_recent_feeds.length > 0) ||
    p.recent_agent_memory ||
    p.my_profile_basics ||
    p.my_placement ||
    p.my_jobs ||
    p.my_job_matches ||
    p.connection_detail ||
    p.connection_inbox ||
    p.verification_status,
  );
}

/**
 * One-line gist of a feed item — used in the recent_feeds rendering
 * so Katie sees the most relevant text per entry without consuming
 * tokens for full JSON. Tries a sequence of well-known fields; falls
 * back to "(no description)".
 */
function summariseFeedItem(item: { data?: unknown }): string {
  if (!item.data || typeof item.data !== "object") return "(no description)";
  const d = item.data as Record<string, unknown>;
  // Heuristic order matches the most-common feed-item shapes.
  const candidate =
    (typeof d.title === "string" && d.title) ||
    (typeof d.note === "string" && d.note) ||
    (typeof d.body === "string" && d.body) ||
    (typeof d.heading === "string" && d.heading) ||
    null;
  if (!candidate) return "(no description)";
  // Cap to ~80 chars so a long entry doesn't bloat the runtime context.
  return candidate.length > 80 ? candidate.slice(0, 77) + "..." : candidate;
}
