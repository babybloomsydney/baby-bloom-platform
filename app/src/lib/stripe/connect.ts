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

import type Stripe from "stripe";
import { getStripeClient } from "./client";
import { isValidABN } from "@/lib/payments/abn";
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

/** Parse YYYY-MM-DD into a {year, month, day} triple that Stripe expects.
 *  Returns null when the input is missing or unparseable so the caller
 *  can omit the field rather than send invalid data. */
function parseIsoDob(
  iso: string | null | undefined,
): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Normalise an AU phone number to E.164 (`+61…`). Stripe rejects
 *  local format like `0401510535` with "not a valid phone number".
 *  Handles both mobiles (0[4]...) and landlines (0[2|3|7|8]...).
 *  Returns null when we can't safely transform — caller omits the
 *  field rather than send something Stripe will reject.
 *
 *  H3 (2026-05-13): added landline support. Previously a nanny who
 *  entered a home phone got the field silently dropped. Stripe then
 *  asked them to type it again in the embedded onboarding flow. */
function normaliseAuPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+61")) return digits;
  if (digits.startsWith("61") && digits.length === 11) return `+${digits}`;
  // Local-format with leading 0: 04XX, 02XX, 03XX, 07XX, 08XX.
  // 10 digits total → 9 digits after the 0 → 11 digits total once
  // +61 is prepended.
  if (digits.startsWith("0") && digits.length === 10) {
    const trunk = digits.slice(1);
    if (/^[234578]/.test(trunk)) return `+61${trunk}`;
  }
  // No-leading-zero form, e.g. user typed "401510535" or "287654321".
  // 9 digits starting with a valid AU area / mobile prefix → keep.
  if (digits.length === 9 && /^[234578]/.test(digits)) return `+61${digits}`;
  return null;
}

export async function createExpressAccount(
  input: CreateExpressAccountInput,
): Promise<StripeResult<CreateExpressAccountOutput>> {
  const { email, country, metadata, nannyUserId, prefill } = input;

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
    // Idempotency salt: rounded to the minute so retries after a
    // failed-and-deleted-account scenario can succeed without a 24h
    // Stripe idempotency wait. Bailey bug 2026-05-13.
    const minuteSalt = Math.floor(Date.now() / 60000);
    // T-020 (2026-05-18, post-empirical verification): for AU sole
    // traders WITH an ABN, Stripe classifies them as
    // `business_type=company` + `company.structure=sole_proprietorship`.
    // The ABN goes in `company.tax_id`. The `individual.id_number`
    // field is the personal Government-ID slot (TFN/passport), NOT
    // the ABN — putting the ABN there is wrong (and trying to attach
    // it via `taxIds.create({type:"au_abn"})` creates an invoicing
    // tax ID + silently reclassifies the account to company anyway).
    //
    // When ABN is provided, switch to the company branch. Stripe
    // disallows `individual` parameters in that mode — the
    // representative's identity flows through the embed as a
    // Person on the account.
    //
    // Defense-in-depth: validate the ABN with the full ATO checksum
    // (not just digit-count). Client form already calls isValidABN
    // before save, but direct server-action calls bypass that.
    // Without this gate, an 11-digit garbage string would reach
    // Stripe as `company.tax_id` and fail at identity verification
    // with an opaque error.
    const hasAbn = isValidABN(prefill?.abn ?? "");
    const buildAddress = () => {
      const addr = prefill?.address;
      if (!addr) return null;
      if (!addr.line1 && !addr.city && !addr.postalCode && !addr.state)
        return null;
      return {
        ...(addr.line1 ? { line1: addr.line1 } : {}),
        ...(addr.line2 ? { line2: addr.line2 } : {}),
        ...(addr.city ? { city: addr.city } : {}),
        ...(addr.state ? { state: addr.state } : {}),
        ...(addr.postalCode ? { postal_code: addr.postalCode } : {}),
        country: addr.country ?? country,
      };
    };
    const businessProfile = {
      // MCC 8351 = Child Care Services. product_description satisfies
      // Stripe's transfers-capability requirement (avoids the
      // "your business website?" prompt for nannies without sites).
      mcc: "8351",
      product_description: "Private Childcare Services",
      support_email: email,
    };
    const baseParams: Stripe.AccountCreateParams = {
      type: "express",
      country,
      email,
      capabilities: { transfers: { requested: true } },
      business_profile: businessProfile,
      metadata: { ...metadata, user_id: nannyUserId },
    };

    let createParams: Stripe.AccountCreateParams;
    if (hasAbn) {
      const abnDigits = (prefill?.abn ?? "").replace(/\D/g, "");
      const companyName =
        [prefill?.firstName, prefill?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || email;
      const address = buildAddress();
      const company: Stripe.AccountCreateParams.Company = {
        structure: "sole_proprietorship",
        tax_id: abnDigits,
        name: companyName,
      };
      if (address) company.address = address;
      const normalisedPhone = normaliseAuPhone(prefill?.phone);
      if (normalisedPhone) company.phone = normalisedPhone;
      createParams = {
        ...baseParams,
        business_type: "company",
        company,
      };
    } else {
      // No ABN — Stripe individual branch. Representative info goes
      // directly under `individual`.
      const dob = parseIsoDob(prefill?.dateOfBirth);
      const individual: Stripe.AccountCreateParams.Individual = { email };
      if (prefill?.firstName) individual.first_name = prefill.firstName;
      if (prefill?.lastName) individual.last_name = prefill.lastName;
      const normalisedPhone = normaliseAuPhone(prefill?.phone);
      if (normalisedPhone) individual.phone = normalisedPhone;
      if (dob) individual.dob = dob;
      const address = buildAddress();
      if (address) individual.address = address;
      createParams = {
        ...baseParams,
        business_type: "individual",
        individual,
      };
    }

    const account = await stripe.accounts.create(createParams, {
      idempotencyKey: `connect-account-${nannyUserId}-${minuteSalt}`,
    });

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
