"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { recalculateProgress, writeHistorySnapshot } from "./progress";
import { generateTileInsight, getChildContext } from "./insights";
import { MASTERY_LABELS } from "@/lib/bapp-constants";
import type { MasteryScore } from "@/lib/bapp-constants";
import { requireChildFamilyAccess } from "@/lib/payments/access-gate";

/**
 * submitReport — Report Cascade
 *
 * Creates 2-3 log entries + recalculates progress + writes history snapshot
 * + marks the parent activity as completed.
 *
 * Cascade:
 * 1. INSERT report log (parent_log_id = activityId)
 * 2. INSERT progress log (parent_log_id = reportId, context='activity' → hidden from "All")
 * 3. IF feedback: INSERT observation log (parent_log_id = reportId, context='activity')
 * 4. recalculateProgress(childId, ratings)
 * 5. writeHistorySnapshot(childId, reportId)
 * 6. UPDATE activity log → status='completed'
 */
export async function submitReport(
  activityId: string,
  childId: string,
  ratings: { id: string; score: number }[],
  feedback: string | null,
  imageUrl: string | null,
): Promise<{
  success: boolean;
  error: string | null;
}> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Paywall gate — block writes when the family's subscription has lapsed.
    const gate = await requireChildFamilyAccess(childId);
    if (!gate.hasAccess) {
      return { success: false, error: "subscription_required" };
    }

    const admin = createAdminClient();

    // 1. INSERT report log
    const { data: reportRow, error: reportError } = await admin
      .from("bapp_logs")
      .insert({
        child_client_id: childId,
        author_id: user.id,
        type: "report",
        status: "completed",
        context: "adhoc",
        parent_log_id: activityId,
        data: {
          feedback: feedback || null,
          rating_count: ratings.length,
          title: "Activity Report",
          image_url: imageUrl,
        },
      })
      .select("id")
      .single();

    if (reportError) {
      console.error("submitReport report insert error:", reportError);
      return { success: false, error: reportError.message };
    }

    const reportId = reportRow!.id;

    // 2. INSERT progress log (context='activity' → hidden from "All" feed)
    await admin.from("bapp_logs").insert({
      child_client_id: childId,
      author_id: user.id,
      type: "progress",
      status: "completed",
      context: "activity",
      parent_log_id: reportId,
      data: {
        updates: ratings,
        title: "Skills Update",
        note: null,
        image_url: null,
      },
    });

    // 3. IF feedback: INSERT observation log (context='activity' → hidden from "All")
    if (feedback && feedback.trim()) {
      await admin.from("bapp_logs").insert({
        child_client_id: childId,
        author_id: user.id,
        type: "observation",
        status: "completed",
        context: "activity",
        parent_log_id: reportId,
        data: {
          note: feedback,
          domain: null,
          milestone_id: null,
          score: null,
          title: "Activity Note",
          image_url: null,
        },
      });
    }

    // 4. Recalculate progress scores
    await recalculateProgress(childId, ratings);

    // 5. Write history snapshot
    await writeHistorySnapshot(childId, reportId);

    // 6. Mark parent activity as completed
    await admin
      .from("bapp_logs")
      .update({ status: "completed" })
      .eq("id", activityId);

    // 7. Generate insight for the report tile
    {
      const childCtx = await getChildContext(childId);
      const milestoneIds = ratings.map((r) => r.id);
      const { data: milestones } = await admin
        .from("bapp_milestones")
        .select("description, domain")
        .in("id", milestoneIds);
      const descriptions = milestones?.map((m) => m.description) ?? [];
      const domains = [...new Set(milestones?.map((m) => m.domain) ?? [])].join(
        ", ",
      );

      const levels = ratings
        .map((r) => MASTERY_LABELS[r.score as MasteryScore])
        .filter(Boolean);
      const levelSummary = [...new Set(levels)].join(", ");

      await generateTileInsight(reportId, childId, {
        ...childCtx,
        entryType: "report",
        domain: domains || null,
        note: feedback,
        milestoneDescriptions: descriptions,
        masteryLevel: levelSummary || null,
      });
    }

    revalidatePath(`/nanny/development/${childId}`);
    revalidatePath(`/parent/development/${childId}`);
    return { success: true, error: null };
  } catch (err) {
    console.error("submitReport unexpected error:", err);
    return { success: false, error: "Failed to submit report" };
  }
}
