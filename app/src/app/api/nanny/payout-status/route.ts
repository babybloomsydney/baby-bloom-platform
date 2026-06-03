/**
 * GET /api/nanny/payout-status
 *
 * Lightweight polling endpoint for the onboarding page. The client
 * watches this while waiting for the Stripe webhook to flip the
 * nanny's `payout_application_status` to `verified`, then animates
 * the page from setup-mode to verified-mode without a hard reload.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("nannies")
    .select("payout_application_status")
    .eq("user_id", user.id)
    .maybeSingle<{ payout_application_status: string | null }>();

  // Surface DB failures rather than silently masquerading as
  // "not_applied" — otherwise a verified nanny would appear unverified
  // to the polling client during any transient Supabase failure.
  if (error) {
    console.error("[payout-status] read failed", error);
    return NextResponse.json(
      { error: "lookup_failed", message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: data?.payout_application_status ?? "not_applied",
  });
}
