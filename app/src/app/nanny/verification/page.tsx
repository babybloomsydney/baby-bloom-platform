import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerificationData } from "@/lib/actions/verification";
import { VerificationPageClient } from "./VerificationPageClient";

export default async function NannyVerificationPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: verification } = await getVerificationData();

  // Fetch profile data for pre-filling identity fields
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("first_name, last_name, date_of_birth")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <VerificationPageClient
      initialData={verification}
      profileData={profile ? {
        firstName: profile.first_name ?? "",
        lastName: profile.last_name ?? "",
        dateOfBirth: profile.date_of_birth ?? "",
      } : null}
    />
  );
}
