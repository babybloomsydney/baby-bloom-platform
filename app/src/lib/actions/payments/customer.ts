"use server";

/**
 * Parent-side server action: ensure a Stripe Customer exists for the
 * authenticated parent and return its id. Lazily creates on first call,
 * returns the cached id thereafter.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §5a
 *      `system/APP/PAYMENTS/09-server-actions.md` (Parent-payment actions)
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateCustomer } from "@/lib/stripe/customers";

export interface EnsureStripeCustomerResult {
  success: boolean;
  data: { stripeCustomerId: string } | null;
  error: string | null;
}

/**
 * Returns the Stripe Customer id for the current parent, creating one
 * if needed.
 *
 * Behaviour (per spec §5a):
 * 1. Auth check.
 * 2. Test-user bypass — `is_test_user = TRUE` returns success with a
 *    `null` customer id wrapper. Test users are never minted in Stripe.
 *    Callers that consume the id MUST treat null as "skip Stripe".
 * 3. Look up `parents.stripe_customer_id`.
 * 4. If present, return it.
 * 5. Otherwise call the Phase-2 wrapper, persist, and return.
 */
export async function ensureStripeCustomer(): Promise<EnsureStripeCustomerResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      data: null,
      error: "not_authenticated",
    };
  }

  const admin = createAdminClient();

  // Test-user bypass — never touch Stripe for flagged accounts.
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("is_test_user, first_name, last_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "[ensureStripeCustomer] user_profiles read failed",
      profileError,
    );
    return {
      success: false,
      data: null,
      error: "profile_lookup_failed",
    };
  }

  if (profile?.is_test_user) {
    // Test users never get a Stripe Customer. Callers must check
    // `is_test_user` before invoking this action; this is defence in
    // depth — if reached, fail loud rather than minting a record.
    return {
      success: false,
      data: null,
      error: "test_users_cannot_pay",
    };
  }

  // Existing customer id?
  const { data: parentRow, error: parentReadError } = await admin
    .from("parents")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (parentReadError) {
    console.error(
      "[ensureStripeCustomer] parents read failed",
      parentReadError,
    );
    return {
      success: false,
      data: null,
      error: "parent_lookup_failed",
    };
  }

  if (!parentRow) {
    return {
      success: false,
      data: null,
      error: "not_a_parent",
    };
  }

  if (parentRow.stripe_customer_id) {
    return {
      success: true,
      data: { stripeCustomerId: parentRow.stripe_customer_id },
      error: null,
    };
  }

  // Mint a new Stripe Customer. Idempotency in the wrapper keys off
  // userId so a partial-failure retry returns the original record.
  if (!user.email) {
    return {
      success: false,
      data: null,
      error: "missing_email",
    };
  }

  const displayName = [profile?.first_name, profile?.last_name]
    .filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    )
    .join(" ")
    .trim();

  let customerId: string;
  try {
    const result = await getOrCreateCustomer({
      email: user.email,
      name: displayName.length > 0 ? displayName : undefined,
      userId: user.id,
    });
    if (!result.success) {
      return { success: false, data: null, error: result.error };
    }
    customerId = result.data.customerId;
  } catch (err) {
    console.error("[ensureStripeCustomer] Stripe create failed", err);
    return {
      success: false,
      data: null,
      error: getErrorMessage(err),
    };
  }

  // Persist. If this UPDATE races with another request the unique index
  // on parents.stripe_customer_id surfaces as an error — we treat that
  // as a benign race and re-read.
  const { error: updateError } = await admin
    .from("parents")
    .update({ stripe_customer_id: customerId })
    .eq("user_id", user.id);

  if (updateError) {
    console.error("[ensureStripeCustomer] parents update failed", updateError);
    return {
      success: false,
      data: null,
      error: "customer_persist_failed",
    };
  }

  return {
    success: true,
    data: { stripeCustomerId: customerId },
    error: null,
  };
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unknown_error";
}
