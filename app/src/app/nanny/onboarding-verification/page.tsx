import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerificationData } from "@/lib/actions/verification";
import { applyStartAtFloor } from "@/lib/onboarding/resume-step";
import { OnboardingVerificationClient } from "./OnboardingVerificationClient";

export default async function OnboardingVerificationPage({
  searchParams,
}: {
  searchParams?: { startAt?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch verification state, user profile, and nanny data in parallel
  const admin = createAdminClient();

  const [verificationResult, profileResult, nannyResult] = await Promise.all([
    getVerificationData(),
    admin
      .from("user_profiles")
      .select(
        "first_name, last_name, date_of_birth, mobile_number, suburb, postcode, profile_picture_url",
      )
      .eq("user_id", user.id)
      .single(),
    admin
      .from("nannies")
      .select("nationality, ai_content")
      .eq("user_id", user.id)
      .single(),
  ]);

  const verification = verificationResult.data;
  const profile = profileResult.data;
  const nanny = nannyResult.data;

  // Extract headline from AI content JSONB and strip HTML tags
  const aiContent = nanny?.ai_content as Record<string, unknown> | null;
  const rawHeadline =
    typeof aiContent?.headline === "string" ? aiContent.headline : null;
  const headline = rawHeadline?.replace(/<[^>]*>/g, "").trim() || null;

  // Determine initial step based on existing verification state
  let initialStep = 0; // Default: Account Secured interstitial

  if (verification) {
    // Has a verifications record — at least identity was submitted once

    if (
      verification.contact_status === "saved" &&
      verification.identity_status === "not_started"
    ) {
      initialStep = 2; // Location done but identity not started — show identity
    }

    // Identity failed/rejected — redirect to existing verification page for retry
    if (
      verification.identity_status === "failed" ||
      verification.identity_status === "rejected"
    ) {
      redirect("/nanny/verification");
    }

    if (verification.identity_status !== "not_started") {
      initialStep = 3; // Identity submitted — show WWCC
    }

    // If identity is done but contact wasn't saved (edge case: contact submit failed)
    if (
      verification.identity_status !== "not_started" &&
      verification.contact_status !== "saved"
    ) {
      initialStep = 1; // Go back to location to re-submit
    }

    if (verification.wwcc_status !== "not_started") {
      initialStep = 4; // WWCC submitted — show processing
    }

    // WWCC failed — redirect to existing verification page for retry
    if (verification.wwcc_status === "failed") {
      redirect("/nanny/verification");
    }

    // Check for full completion
    const allDone =
      verification.identity_status === "verified" &&
      (verification.wwcc_status === "doc_verified" ||
        verification.wwcc_status === "review") &&
      verification.cross_check_status === "passed" &&
      verification.contact_status === "saved";

    if (allDone) {
      redirect("/nanny");
    }
  }

  // T-022 — Honour `?startAt=N` from upstream navigators (the new
  // contributions page sends `?startAt=1` to skip AccountSecured and
  // land at Step 1 Location). Floor semantics — a returning user at
  // Step 3 (WWCC) is NEVER downgraded by a stale URL. Pure helper
  // covers the NaN / negative / float / out-of-range edge cases.
  initialStep = applyStartAtFloor(initialStep, searchParams?.startAt);

  return (
    <OnboardingVerificationClient
      initialStep={initialStep}
      verification={verification}
      profile={{
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        dateOfBirth: profile?.date_of_birth ?? "",
        mobileNumber: profile?.mobile_number ?? "",
        suburb: profile?.suburb ?? "",
        postcode: profile?.postcode ?? "",
        profilePictureUrl: profile?.profile_picture_url ?? null,
        bioSnippet: headline,
        nationality: nanny?.nationality ?? null,
      }}
      userId={user.id}
    />
  );
}
