import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bonusProgramDisabled } from "@/lib/invite/flags";
import { AddChildOnboardingClient } from "./AddChildOnboardingClient";

// T-022 — onboarding contributions page. Wedged between the
// AccountSecured Step 0 interstitial and the verification work
// (Steps 1-4) at `/nanny/onboarding-verification`. Reads the
// `external_u3_position` qualifying signal (T-023) to drive a
// dynamic violet callout for nannies who aren't currently working
// with an under-3.
//
// The page itself works whether T-023 has shipped or not — if the
// signal is missing (`null` or `lead_signals` empty), defaults to
// the action-ready state (currentlyCaringForU3 = true).

export const dynamic = "force-dynamic";

export default async function Page() {
  // 1. Kill-switch gate — flag-off path bounces straight into the
  //    legacy onboarding-verification flow at Step 1 (Location). Runs
  //    BEFORE auth so that a flag-off direct visit doesn't even fetch
  //    cookies; cheap fallback.
  if (bonusProgramDisabled()) {
    redirect("/nanny/onboarding-verification?startAt=1");
  }

  // 2. Auth gate.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();

  // 3. Role gate — nannies only. Parents who land here (via a stale
  //    link or wrong account) get bounced to their own dashboard.
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "nanny") {
    redirect("/parent");
  }

  // 4. Fetch nanny lead_id, then JOIN through to nanny_leads.lead_signals
  //    to read the external_u3_position signal. Falls back gracefully if
  //    either lookup misses — the page should never crash on a fresh
  //    nanny without a lead, and should never crash before T-023 is built.
  //    Errors are logged but never propagated (silent default to action-
  //    ready is the right business default; observability via console.error).
  const { data: nannyRow, error: nannyErr } = await admin
    .from("nannies")
    .select("lead_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (nannyErr) {
    console.error(
      "[add-child/page] nannies fetch failed:",
      nannyErr.code,
      nannyErr.message,
    );
  }

  let currentlyCaringForU3 = true;
  if (nannyRow?.lead_id) {
    const { data: leadRow, error: leadErr } = await admin
      .from("nanny_leads")
      .select("lead_signals")
      .eq("id", nannyRow.lead_id)
      .maybeSingle();
    if (leadErr) {
      console.error(
        "[add-child/page] nanny_leads fetch failed:",
        leadErr.code,
        leadErr.message,
      );
    }
    // Narrow without an `as` cast — the JSONB Json type is a union; the
    // strict equality check at the leaf rejects null/undefined/non-boolean
    // values so only an explicit `false` flips currentlyCaringForU3.
    const raw = leadRow?.lead_signals;
    if (
      raw !== null &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      (raw as Record<string, unknown>).external_u3_position === false
    ) {
      currentlyCaringForU3 = false;
    }
  }

  return (
    <AddChildOnboardingClient currentlyCaringForU3={currentlyCaringForU3} />
  );
}
