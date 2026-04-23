/**
 * Bot lifecycle helpers — lazy creation + children fetch.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { BotRole } from "@/lib/ai/model-selector";
import type { ChildSummary } from "@/lib/chat/context";

export interface BotRecord {
  id: string;
  user_id: string;
  role: BotRole;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

/**
 * Gets the user's bot, creating it lazily on first access.
 * One bot per user — UNIQUE(user_id) enforces this at DB level.
 */
export async function getOrCreateBot(
  userId: string,
  role: BotRole,
): Promise<BotRecord> {
  const admin = createAdminClient();

  // Try read first
  const { data: existing, error: selectErr } = await admin
    .from("bloombot")
    .select("id, user_id, role, settings, is_active, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectErr) {
    throw new Error(`bloombot select failed: ${selectErr.message}`);
  }

  if (existing) {
    return existing as BotRecord;
  }

  // Lazy create
  const { data: created, error: insertErr } = await admin
    .from("bloombot")
    .insert({
      user_id: userId,
      role,
      settings: {
        waking_hours: {
          start: "07:00",
          end: "22:00",
          timezone: "Australia/Sydney",
        },
      },
    })
    .select("id, user_id, role, settings, is_active, created_at")
    .single();

  if (insertErr || !created) {
    // Edge case: concurrent insert raced us. Try read again.
    const { data: racer } = await admin
      .from("bloombot")
      .select("id, user_id, role, settings, is_active, created_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (racer) return racer as BotRecord;
    throw new Error(
      `bloombot create failed: ${insertErr?.message ?? "no row returned"}`,
    );
  }

  // First-visit templated intro. Non-blocking — log and carry on on failure.
  try {
    await admin.from("chat_messages").insert({
      bloombot_id: created.id,
      role: "assistant",
      content: firstVisitIntro(role),
      trigger_source: "proactive_template",
      proactive_trigger_id: "bloombot.first_visit",
      is_read: false,
    });
  } catch (e) {
    console.warn("[bloombot] first-visit intro insert failed", e);
  }

  return created as BotRecord;
}

/** Role-specific first-visit intro message (template tier, zero cost). */
function firstVisitIntro(role: BotRole): string {
  if (role === "parent") {
    return `Hi — I'm Katie.

I'll help you follow your child's development, manage the people in your care circle, and stay on top of your schedule — usually before you have to ask.

Try me: "show me this week's progress".`;
  }
  if (role === "admin") {
    return `Hi — I'm Katie (admin mode).

You can inspect my prompts, propose edits, and see what's deployed. I'll show diffs before applying anything. Protected sections need a second confirmation.`;
  }
  // nanny (default)
  return `Hi — I'm Katie.

I'll help you across all of Baby Bloom. Logging meals, tracking progress, planning activities, browsing jobs — I can handle it from here.

Try: "log Oliver's breakfast — banana and yogurt, 8am".`;
}

/**
 * Calculates child age in whole months from date_of_birth.
 */
function ageMonths(dob: string | null): number {
  if (!dob) return 0;
  const birth = new Date(dob);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12;
  months += now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}

function ageBracket(months: number): string {
  if (months < 3) return "0-3 months";
  if (months < 6) return "3-6 months";
  if (months < 12) return "6-12 months";
  if (months < 18) return "12-18 months";
  if (months < 24) return "18-24 months";
  if (months < 32) return "24-32 months";
  return "32+ months";
}

/**
 * Fetches children the user has access to. Mirrors user_has_child_access():
 * direct nanny ownership OR placement-based access for both nannies and
 * parents. Scoped to under_three children (Katie is the under-three UI).
 *
 * `child_client.status` is not filtered: the canonical PG function
 * doesn't filter it either, and real values are multi-state
 * ('created_auto', 'created_manual', 'setup', 'active_nanny', …) with
 * no single literal meaning "live". A prior version filtered on
 * status='active' which never matched any real row. See PROGRESS.md
 * B-03 diagnosis (2026-04-23) for the incident.
 *
 * Returns ChildSummary[] ready for ModuleContext.children.
 */
export async function getUserChildren(userId: string): Promise<ChildSummary[]> {
  const admin = createAdminClient();

  // Step 1: child_client rows where the user is the direct nanny owner
  const { data: direct } = await admin
    .from("child_client")
    .select("id, first_name, gender, date_of_birth")
    .eq("nanny_user_id", userId)
    .eq("under_three", true);

  // Step 2: placement-based access — children linked to placements where
  // the user is either the nanny (via nannies.user_id) or the parent
  // (via parents.user_id). nanny_placements.status = 'active' is a real
  // literal value (see user_has_child_access() PG function).
  const { data: placements } = await admin
    .from("nanny_placements")
    .select(
      "id, child_client:child_client!inner(id, first_name, gender, date_of_birth, under_three), nannies:nannies!inner(user_id), parents:parents!inner(user_id)",
    )
    .eq("status", "active");

  const viaPlacement = (placements ?? []).filter((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nannyUid = (p.nannies as any)?.user_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parentUid = (p.parents as any)?.user_id;
    return nannyUid === userId || parentUid === userId;
  });

  // Deduplicate by child_client.id
  const all = new Map<
    string,
    {
      id: string;
      first_name: string;
      gender: string | null;
      date_of_birth: string | null;
    }
  >();
  for (const row of direct ?? []) {
    all.set(row.id as string, row);
  }
  for (const p of viaPlacement) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cc = p.child_client as any;
    if (cc && cc.under_three) {
      all.set(cc.id as string, cc);
    }
  }

  return Array.from(all.values()).map((row) => {
    const months = ageMonths(row.date_of_birth);
    return {
      id: row.id,
      firstName: row.first_name,
      ageMonths: months,
      ageBracket: ageBracket(months),
      gender: row.gender,
    };
  });
}

/** Get the user's stored role from user_roles. */
export async function getUserRole(userId: string): Promise<BotRole | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const role = data?.role as string | undefined;
  if (role === "nanny" || role === "parent") return role;
  if (role === "admin" || role === "super_admin") return "admin";
  return null;
}
