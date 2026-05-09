/**
 * Stripe Connect wrappers — Express account creation + onboarding link.
 *
 * Spec: `system/APP/PAYMENTS/04-stripe-integration.md` §6a (Application
 * start) + §6b (Embedded onboarding option).
 *
 * Idempotency:
 * - `connect-account-${nannyUserId}` for `createExpressAccount` — guards
 *   against duplicate Connect accounts if the API call retries after a
 *   partial failure.
 * - Account links are short-lived single-use URLs and do NOT need an
 *   idempotency key (Stripe explicitly recommends fresh links per session).
 */

import { getStripeClient } from "./client";
import type {
  CreateAccountLinkInput,
  CreateAccountLinkOutput,
  CreateExpressAccountInput,
  CreateExpressAccountOutput,
} from "./types";
import type { StripeResult } from "@/types/payments";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown Stripe error";
}

export async function createExpressAccount(
  input: CreateExpressAccountInput,
): Promise<StripeResult<CreateExpressAccountOutput>> {
  const { email, country, metadata, nannyUserId } = input;

  if (!email || !nannyUserId) {
    return {
      success: false,
      error: "createExpressAccount requires email + nannyUserId",
    };
  }
  if (country !== "AU") {
    return {
      success: false,
      error: 'createExpressAccount only supports country="AU" in v1',
    };
  }

  try {
    const stripe = getStripeClient();
    const account = await stripe.accounts.create(
      {
        type: "express",
        country,
        email,
        business_type: "individual",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          // MCC 8351 = Child Care Services. Per §6a.
          mcc: "8351",
        },
        metadata: { ...metadata, user_id: nannyUserId },
      },
      {
        idempotencyKey: `connect-account-${nannyUserId}`,
      },
    );

    return {
      success: true,
      data: { accountId: account.id },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}

export async function createAccountLink(
  input: CreateAccountLinkInput,
): Promise<StripeResult<CreateAccountLinkOutput>> {
  const { accountId, refreshUrl, returnUrl, type } = input;

  if (!accountId || !refreshUrl || !returnUrl) {
    return {
      success: false,
      error: "createAccountLink requires accountId, refreshUrl, returnUrl",
    };
  }

  try {
    const stripe = getStripeClient();
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type,
      collection_options: {
        fields: "eventually_due",
        future_requirements: "include",
      },
    });

    return {
      success: true,
      data: { url: link.url, expiresAt: link.expires_at },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err),
    };
  }
}
