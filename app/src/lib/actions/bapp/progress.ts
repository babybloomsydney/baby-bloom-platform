"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProgressScore, DashboardData } from "@/types/bapp";
import { DOMAIN_CODES } from "@/lib/bapp-constants";

// ---------------------------------------------------------------------------
// recalculateProgress — scores only go up (max of existing vs new)
// ---------------------------------------------------------------------------

export async function recalculateProgress(
  childId: string,
  updates: { id: string; score: number }[]
): Promise<void> {
  const admin = createAdminClient();

  // Look up domains for each milestone ID
  const milestoneIds = updates.map((u) => u.id);
  const { data: milestones } = await admin
    .from("bapp_milestones")
    .select("id, domain")
    .in("id", milestoneIds);

  if (!milestones) return;

  const milestoneDomainMap = new Map<string, string>();
  for (const m of milestones) {
    milestoneDomainMap.set(m.id, m.domain);
  }

  // Group updates by domain
  const updatesByDomain = new Map<string, { id: string; score: number }[]>();
  for (const u of updates) {
    const domain = milestoneDomainMap.get(u.id);
    if (!domain) continue;
    const list = updatesByDomain.get(domain) ?? [];
    list.push(u);
    updatesByDomain.set(domain, list);
  }

  // For each affected domain, read → merge → upsert
  for (const [domain, domainUpdates] of Array.from(updatesByDomain)) {
    // Read current scores for this domain
    const { data: existing } = await admin
      .from("bapp_progress_scores")
      .select("*")
      .eq("child_client_id", childId)
      .eq("domain", domain)
      .maybeSingle();

    const scores: Record<string, number> = existing?.scores
      ? { ...(existing.scores as Record<string, number>) }
      : {};

    // Merge — scores only go up
    for (const u of domainUpdates) {
      scores[u.id] = Math.max(scores[u.id] || 0, u.score);
    }

    // Count total active milestones for this domain
    const { count } = await admin
      .from("bapp_milestones")
      .select("id", { count: "exact", head: true })
      .eq("domain", domain)
      .eq("is_active", true);

    const milestoneCount = count ?? 0;
    const sumScores = Object.values(scores).reduce((a, b) => a + b, 0);
    const percent =
      milestoneCount > 0
        ? Math.round((sumScores / (milestoneCount * 4)) * 100)
        : 0;

    // Upsert progress_scores
    if (existing) {
      await admin
        .from("bapp_progress_scores")
        .update({ scores, percent })
        .eq("id", existing.id);
    } else {
      await admin.from("bapp_progress_scores").insert({
        child_client_id: childId,
        domain,
        scores,
        percent,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// writeHistorySnapshot
// ---------------------------------------------------------------------------

export async function writeHistorySnapshot(
  childId: string,
  refLogId: string | null
): Promise<void> {
  const admin = createAdminClient();

  const { data: allScores } = await admin
    .from("bapp_progress_scores")
    .select("domain, scores")
    .eq("child_client_id", childId);

  const domainTotals: Record<string, number> = {};
  for (const code of DOMAIN_CODES) {
    domainTotals[code] = 0;
  }

  for (const row of allScores ?? []) {
    const scores = row.scores as Record<string, number>;
    domainTotals[row.domain] = Object.values(scores).reduce(
      (a, b) => a + b,
      0
    );
  }

  await admin.from("bapp_progress_history").insert({
    child_client_id: childId,
    ref_log_id: refLogId,
    cl_total: domainTotals.CL ?? 0,
    pse_total: domainTotals.PSE ?? 0,
    pd_total: domainTotals.PD ?? 0,
    lit_total: domainTotals.LIT ?? 0,
    num_total: domainTotals.NUM ?? 0,
    uw_total: domainTotals.UW ?? 0,
    ead_total: domainTotals.EAD ?? 0,
  });
}

// ---------------------------------------------------------------------------
// getProgressScores
// ---------------------------------------------------------------------------

export async function getProgressScores(childId: string): Promise<{
  success: boolean;
  error: string | null;
  data: ProgressScore[];
}> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("bapp_progress_scores")
      .select("*")
      .eq("child_client_id", childId);

    if (error) {
      console.error("getProgressScores error:", error);
      return { success: false, error: error.message, data: [] };
    }

    return {
      success: true,
      error: null,
      data: (data as ProgressScore[]) ?? [],
    };
  } catch (err) {
    console.error("getProgressScores unexpected error:", err);
    return { success: false, error: "Failed to fetch progress scores", data: [] };
  }
}

// ---------------------------------------------------------------------------
// getProgressMatrix — flat map of {milestoneId: score}
// ---------------------------------------------------------------------------

export async function getProgressMatrix(childId: string): Promise<{
  success: boolean;
  error: string | null;
  data: Record<string, number>;
}> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("bapp_progress_scores")
      .select("scores")
      .eq("child_client_id", childId);

    if (error) {
      console.error("getProgressMatrix error:", error);
      return { success: false, error: error.message, data: {} };
    }

    const matrix: Record<string, number> = {};
    for (const row of data ?? []) {
      const scores = row.scores as Record<string, number>;
      for (const [milestoneId, score] of Object.entries(scores)) {
        matrix[milestoneId] = score;
      }
    }

    return { success: true, error: null, data: matrix };
  } catch (err) {
    console.error("getProgressMatrix unexpected error:", err);
    return { success: false, error: "Failed to fetch progress matrix", data: {} };
  }
}

// ---------------------------------------------------------------------------
// getDashboardData
// ---------------------------------------------------------------------------

export async function getDashboardData(childId: string): Promise<{
  success: boolean;
  error: string | null;
  data: DashboardData | null;
}> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated", data: null };
    }

    const admin = createAdminClient();

    // Parallel: progress scores + log counts + first log date
    const [scoresRes, activityCount, obsCount, firstLogRes] = await Promise.all([
      admin
        .from("bapp_progress_scores")
        .select("domain, scores, percent")
        .eq("child_client_id", childId),
      admin
        .from("bapp_logs")
        .select("id", { count: "exact", head: true })
        .eq("child_client_id", childId)
        .eq("type", "activity"),
      admin
        .from("bapp_logs")
        .select("id", { count: "exact", head: true })
        .eq("child_client_id", childId)
        .eq("type", "observation")
        .eq("context", "adhoc"),
      admin
        .from("bapp_logs")
        .select("created_at")
        .eq("child_client_id", childId)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

    // Domain data
    const domains: Record<string, { score: number; total: number; percent: number }> = {};
    let strongestDomain = "";
    let highestPercent = -1;

    for (const row of scoresRes.data ?? []) {
      const scores = row.scores as Record<string, number>;
      const sumScores = Object.values(scores).reduce((a, b) => a + b, 0);
      domains[row.domain] = {
        score: sumScores,
        total: Object.keys(scores).length * 4,
        percent: row.percent ?? 0,
      };
      if ((row.percent ?? 0) > highestPercent) {
        highestPercent = row.percent ?? 0;
        strongestDomain = row.domain;
      }
    }

    // Days active
    const firstLog = firstLogRes.data?.[0];
    const daysActive = firstLog
      ? Math.max(
          1,
          Math.ceil(
            (Date.now() - new Date(firstLog.created_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

    return {
      success: true,
      error: null,
      data: {
        domains,
        stats: {
          totalActivities: activityCount.count ?? 0,
          totalObservations: obsCount.count ?? 0,
          daysActive,
          strongestDomain,
        },
      },
    };
  } catch (err) {
    console.error("getDashboardData unexpected error:", err);
    return { success: false, error: "Failed to fetch dashboard data", data: null };
  }
}
