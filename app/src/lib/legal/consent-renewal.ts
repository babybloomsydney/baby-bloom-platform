"use server";

/**
 * Consent renewal + decline cascade actions.
 *
 * Bailey 2026-05-14:
 *   - T-7d in-app modal: when consent for a user on a child is ≤7d
 *     from expiry, a modal pops up on that child's dev page.
 *   - Renew: records a fresh consent_records row (new 12-month TTL).
 *   - Decline (parent): deletes the child + cascades + cancels sub.
 *   - Decline (nanny): unlinks the nanny from the child; the parent
 *     keeps the child entity.
 *
 * Each decline returns success/failure envelope so the client UI can
 * surface a clear two-step confirm + error toast.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordConsent } from "./record-consent";
import type { AgreementId } from "./types";

interface ActionResult {
  success: boolean;
  error: string | null;
}

/**
 * Records a fresh consent row of the same agreement, resetting the
 * 12-month TTL. Caller picks the AgreementId based on the user's
 * role (parent → PARENT-APP-CONSENT, nanny → NANNY-ATTESTATION).
 */
export async function renewChildConsent(input: {
  childId: string;
  agreementId: Extract<AgreementId, "PARENT-APP-CONSENT" | "NANNY-ATTESTATION">;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { success: false, error: "not_authenticated" };
  }

  try {
    const result = await recordConsent(
      [
        {
          agreementId: input.agreementId,
          checkpointId: "annual-renewal",
          checkpointText:
            input.agreementId === "PARENT-APP-CONSENT"
              ? "I confirm my consent to Baby Bloom continuing to collect and process data for this child for another 12 months."
              : "I confirm my agreement to Baby Bloom's professional terms for this engagement for another 12 months.",
        },
      ],
      input.childId,
    );
    if (!result.success) {
      return { success: false, error: result.error ?? "consent_insert_failed" };
    }
    return { success: true, error: null };
  } catch (err) {
    console.error("[renewChildConsent] unexpected:", err);
    return { success: false, error: "renew_failed" };
  }
}

/**
 * Parent decline at T-7d modal. CASCADES the child deletion +
 * subscription cancellation per Bailey's product call.
 *
 * Cascade order:
 *   1. Record the decline as a consent_given=false row (audit trail).
 *   2. Cancel any active parent_subscription (Stripe-side cancel
 *      uses the existing cancelSubscription server action's logic —
 *      we call into it).
 *   3. Delete the child_client row → ON DELETE CASCADE wipes
 *      child_client_events, bapp_logs, bapp_progress_*, child_invites,
 *      earnings_events. nanny_payouts (paid rows) survive (no FK).
 *   4. activity_logs row for admin trail.
 */
export async function declineParentConsentAndDeleteChild(input: {
  childId: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { success: false, error: "not_authenticated" };
  }

  const admin = createAdminClient();

  // 1. Confirm caller is the parent on this child.
  const { data: child } = await admin
    .from("child_client")
    .select("id, parent_user_id, nanny_user_id, first_name")
    .eq("id", input.childId)
    .maybeSingle<{
      id: string;
      parent_user_id: string | null;
      nanny_user_id: string | null;
      first_name: string | null;
    }>();
  if (!child) {
    return { success: false, error: "child_not_found" };
  }
  if (child.parent_user_id !== user.id) {
    return { success: false, error: "not_authorised" };
  }

  // 2. Audit trail — record the decline.
  try {
    await recordConsent(
      [
        {
          agreementId: "PARENT-APP-CONSENT",
          checkpointId: "annual-renewal-declined",
          checkpointText:
            "I do NOT consent to Baby Bloom continuing to collect and process data for this child. I understand this will permanently delete the child and history and cancel my subscription.",
          consentGiven: false,
        },
      ],
      input.childId,
    );
  } catch (err) {
    console.warn(
      "[declineParentConsentAndDeleteChild] consent decline write failed (non-fatal):",
      err,
    );
  }

  // 3. Cancel subscription (best-effort, before delete so the FK
  // doesn't cascade-remove the audit reference).
  try {
    const { data: sub } = await admin
      .from("parent_subscriptions")
      .select("id, status, stripe_subscription_id")
      .eq("parent_user_id", user.id)
      .maybeSingle<{
        id: string;
        status: string;
        stripe_subscription_id: string | null;
      }>();
    if (
      sub &&
      (sub.status === "active_monthly" ||
        sub.status === "active_upfront" ||
        sub.status === "trial" ||
        sub.status === "past_due")
    ) {
      // Mark cancelled in our DB; the existing Stripe-side cancel
      // handler is best-effort. Avoid hard-coupling to that here
      // since the customer is being deleted regardless.
      await admin
        .from("parent_subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: "consent_withdrawn",
        })
        .eq("id", sub.id);
      // Stripe-side cancel: best-effort. If the user has a stripe
      // subscription, cancel it immediately. Avoid throwing from
      // this branch — the child delete must still proceed.
      if (sub.stripe_subscription_id) {
        try {
          const { getStripeClient } = await import("@/lib/stripe/client");
          const stripe = getStripeClient();
          await stripe.subscriptions.cancel(sub.stripe_subscription_id);
        } catch (stripeErr) {
          console.warn(
            "[declineParentConsentAndDeleteChild] stripe cancel failed (non-fatal):",
            stripeErr,
          );
          // Make the failure recoverable: durable record so admin
          // can manually close the Stripe subscription.
          await admin.from("activity_logs").insert({
            user_id: user.id,
            action_type: "stripe_cancel_failed_manual_required",
            action_details: {
              stripe_subscription_id: sub.stripe_subscription_id,
              parent_subscription_id: sub.id,
              child_id: input.childId,
              reason:
                stripeErr instanceof Error
                  ? stripeErr.message
                  : String(stripeErr),
            },
          });
        }
      }
    }
  } catch (err) {
    console.warn(
      "[declineParentConsentAndDeleteChild] subscription cancel failed (non-fatal):",
      err,
    );
  }

  // 4. Delete the child. FK cascades take care of bapp_logs,
  // bapp_progress_*, child_client_events, child_invites,
  // earnings_events.
  const { error: deleteErr } = await admin
    .from("child_client")
    .delete()
    .eq("id", input.childId);
  if (deleteErr) {
    console.error(
      "[declineParentConsentAndDeleteChild] child delete failed:",
      deleteErr,
    );
    return { success: false, error: "delete_failed" };
  }

  // 5. Admin audit log. Wrapped in try/catch — the child is already
  // deleted; an audit-log write failure must NOT turn into a
  // `success:false` for the client (which would re-trigger the
  // delete attempt on a now-missing child and lock the user out of
  // the flow). Audit gaps are flagged via console.error for the
  // admin trail.
  try {
    await admin.from("activity_logs").insert({
      user_id: user.id,
      action_type: "child_deleted_consent_declined",
      action_details: {
        child_id: input.childId,
        child_first_name: child.first_name,
        former_nanny_user_id: child.nanny_user_id,
        reason: "parent_consent_withdrawn_at_renewal",
      },
    });
  } catch (logErr) {
    console.error(
      "[declineParentConsentAndDeleteChild] audit log write failed AFTER delete:",
      logErr,
    );
  }

  return { success: true, error: null };
}

/**
 * Nanny decline at T-7d modal. UNLINKS the nanny from the child;
 * the child entity + the parent's relationship to it survive.
 */
export async function declineNannyConsentAndUnlink(input: {
  childId: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { success: false, error: "not_authenticated" };
  }

  const admin = createAdminClient();

  // 1. Confirm caller is the nanny on this child.
  const { data: child } = await admin
    .from("child_client")
    .select("id, parent_user_id, nanny_user_id, first_name")
    .eq("id", input.childId)
    .maybeSingle<{
      id: string;
      parent_user_id: string | null;
      nanny_user_id: string | null;
      first_name: string | null;
    }>();
  if (!child) {
    return { success: false, error: "child_not_found" };
  }
  if (child.nanny_user_id !== user.id) {
    return { success: false, error: "not_authorised" };
  }

  // 2. Audit trail — record the decline.
  try {
    await recordConsent(
      [
        {
          agreementId: "NANNY-ATTESTATION",
          checkpointId: "annual-renewal-declined",
          checkpointText:
            "I do NOT agree to renew my professional terms for this engagement. I understand this removes me from the child.",
          consentGiven: false,
        },
      ],
      input.childId,
    );
  } catch (err) {
    console.warn(
      "[declineNannyConsentAndUnlink] consent decline write failed (non-fatal):",
      err,
    );
  }

  // 3. Unlink: clear nanny_user_id on the child. Also end any active
  // nanny_placement row. bapp_logs by the nanny stay (the parent
  // keeps access to the historical record).
  const { error: updateErr } = await admin
    .from("child_client")
    .update({ nanny_user_id: null, status: "trial_ended" })
    .eq("id", input.childId);
  if (updateErr) {
    console.error("[declineNannyConsentAndUnlink] unlink failed:", updateErr);
    return { success: false, error: "unlink_failed" };
  }

  // 4. End any active nanny_placement row for this nanny + child.
  try {
    await admin
      .from("nanny_placements")
      .update({
        ended_at: new Date().toISOString(),
        end_reason: "consent_withdrawn",
      })
      .eq("nanny_user_id", user.id)
      .eq("child_client_id", input.childId)
      .is("ended_at", null);
  } catch (err) {
    console.warn(
      "[declineNannyConsentAndUnlink] placement end failed (non-fatal):",
      err,
    );
  }

  // 5. Admin audit log.
  await admin.from("activity_logs").insert({
    user_id: user.id,
    action_type: "nanny_unlinked_consent_declined",
    action_details: {
      child_id: input.childId,
      child_first_name: child.first_name,
      former_parent_user_id: child.parent_user_id,
      reason: "nanny_consent_withdrawn_at_renewal",
    },
  });

  return { success: true, error: null };
}
