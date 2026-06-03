/**
 * Server-side data fetch for the nanny payout onboarding view.
 * Returns the status + the Stripe-connected bank summary (if any) so
 * both the standalone `/nanny/payouts/onboarding` page AND the
 * "Payout Settings" leaf inside settings can render the verified-state
 * UI without re-querying.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/client";
import {
  isPayoutVerified,
  toPayoutApplicationStatus,
  type PayoutApplicationStatus,
} from "./payout-application-status";

export interface PayoutOnboardingViewData {
  status: PayoutApplicationStatus;
  bankSummary: { last4: string | null; bankName: string | null } | null;
}

export async function fetchPayoutOnboardingViewData(
  nannyUserId: string,
): Promise<PayoutOnboardingViewData> {
  const admin = createAdminClient();
  const { data: nanny } = await admin
    .from("nannies")
    .select("payout_application_status, stripe_connect_account_id")
    .eq("user_id", nannyUserId)
    .maybeSingle<{
      payout_application_status: string | null;
      stripe_connect_account_id: string | null;
    }>();

  const status = toPayoutApplicationStatus(nanny?.payout_application_status);
  const accountId = nanny?.stripe_connect_account_id ?? null;

  let bankSummary: PayoutOnboardingViewData["bankSummary"] = null;
  if (isPayoutVerified(status) && accountId) {
    try {
      const stripe = getStripeClient();
      const account = await stripe.accounts.retrieve(accountId);
      const ext = account.external_accounts?.data?.[0];
      if (ext && ext.object === "bank_account") {
        bankSummary = {
          last4: ext.last4 ?? null,
          bankName: ext.bank_name ?? null,
        };
      }
    } catch (err) {
      // Best-effort — falling back to status-only display when Stripe
      // is unreachable is preferable to a 500 here. Severity is warn
      // (not error) to match the intent.
      console.warn("[payout-onboarding-data] account.retrieve failed", err);
    }
  }

  return { status, bankSummary };
}
