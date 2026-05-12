"use server";

/**
 * createConnectAccountSession — S13 v2 server action.
 *
 * Mints (or reuses) the nanny's Stripe Express account, then issues
 * a short-lived Account Session client secret for the embedded
 * `<ConnectAccountOnboarding />` component.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S13.
 *
 * Different from `startConnectOnboarding` (hosted v1): instead of
 * returning a redirect URL, this returns a client secret that the
 * embedded Connect component consumes. Same prerequisite — the
 * Express account must exist; we mint it on first call.
 *
 * Reuses the existing `createExpressAccount` wrapper which has
 * idempotency keyed on nannyUserId.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createExpressAccount } from "@/lib/stripe/connect";
import { getStripeClient } from "@/lib/stripe/client";
import { PAYMENTS_ENABLED } from "@/lib/payments/flags";

export type CreateConnectAccountSessionResult =
  | { success: true; data: { clientSecret: string } }
  | { success: false; error: string };

export async function createConnectAccountSession(): Promise<CreateConnectAccountSessionResult> {
  try {
    if (!PAYMENTS_ENABLED) {
      return { success: false, error: "payments_disabled" };
    }

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "not_authenticated" };
    }

    const admin = createAdminClient();
    const { data: nanny, error: nannyErr } = await admin
      .from("nannies")
      .select("id, stripe_connect_account_id")
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; stripe_connect_account_id: string | null }>();
    if (nannyErr || !nanny) {
      return { success: false, error: "nanny_record_not_found" };
    }

    let accountId = nanny.stripe_connect_account_id;
    if (!accountId) {
      const created = await createExpressAccount({
        email: user.email ?? "",
        country: "AU",
        nannyUserId: user.id,
        metadata: { onboarding_source: "embedded_connect_session" },
      });
      if (!created.success) {
        return { success: false, error: created.error };
      }
      accountId = created.data.accountId;
      const { error: updateErr } = await admin
        .from("nannies")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", nanny.id);
      if (updateErr) {
        console.error(
          "[createConnectAccountSession] failed to persist account id",
          updateErr,
        );
        return { success: false, error: "db_update_failed" };
      }
    }

    // Mint an Account Session — short-lived client secret for the
    // embedded onboarding component to consume. Single-use; mint a
    // fresh one each time the user enters the flow.
    const stripe = getStripeClient();
    try {
      const session = await stripe.accountSessions.create({
        account: accountId,
        components: {
          account_onboarding: {
            enabled: true,
            features: {
              external_account_collection: true,
            },
          },
        },
      });
      return {
        success: true,
        data: { clientSecret: session.client_secret },
      };
    } catch (err) {
      console.error(
        "[createConnectAccountSession] stripe.accountSessions.create failed",
        err,
      );
      return { success: false, error: "stripe_session_failed" };
    }
  } catch (err) {
    console.error("[createConnectAccountSession] unexpected", err);
    return { success: false, error: "unexpected_error" };
  }
}
