import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VerificationPageClient } from "@/app/nanny/verification/VerificationPageClient";
import { ParentVerificationPageClient } from "@/app/parent/verification/ParentVerificationPageClient";

export default async function AdminViewerVerificationPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const targetUserId = params.id;

  // Determine role
  const { data: roleData } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .single();

  if (!roleData) redirect("/admin/users");

  const role = roleData.role as string;

  if (role === "nanny") {
    // Fetch nanny verification data
    const { data: verification } = await admin
      .from("verifications")
      .select(`
        id,
        identity_status, wwcc_status, contact_status, cross_check_status,
        verification_status,
        surname, given_names, date_of_birth, passport_country,
        passport_upload_url, identification_photo_url,
        identity_verified, identity_rejection_reason, identity_user_guidance,
        extracted_passport_number, extracted_nationality,
        wwcc_verification_method, wwcc_number, wwcc_expiry_date,
        wwcc_grant_email_url, wwcc_service_nsw_screenshot_url,
        wwcc_doc_verified, wwcc_verified, wwcc_rejection_reason, wwcc_user_guidance,
        phone_number, address_line, city, state, postcode, country,
        cross_check_reasoning,
        created_at, updated_at
      `)
      .eq("user_id", targetUserId)
      .maybeSingle();

    // Fetch profile for pre-filling
    const { data: profile } = await admin
      .from("user_profiles")
      .select("first_name, last_name, date_of_birth")
      .eq("user_id", targetUserId)
      .maybeSingle();

    return (
      <VerificationPageClient
        initialData={verification}
        profileData={
          profile
            ? {
                firstName: profile.first_name ?? "",
                lastName: profile.last_name ?? "",
                dateOfBirth: profile.date_of_birth ?? "",
              }
            : null
        }
      />
    );
  }

  if (role === "parent") {
    // Fetch parent verification data
    const { data: verification } = await admin
      .from("parent_verifications")
      .select(`
        id,
        document_type, issuing_country,
        identity_status, contact_status, cross_check_status,
        verification_status,
        surname, given_names, date_of_birth,
        document_upload_url, identification_photo_url,
        identity_verified, identity_rejection_reason, identity_user_guidance,
        selfie_confidence,
        extracted_surname, extracted_given_names, extracted_dob,
        extracted_nationality, extracted_passport_number, extracted_passport_expiry,
        extracted_license_number, extracted_license_expiry,
        extracted_license_state, extracted_license_class,
        phone_number, address_line, city, state, postcode, country,
        cross_check_reasoning,
        created_at, updated_at
      `)
      .eq("user_id", targetUserId)
      .maybeSingle();

    return <ParentVerificationPageClient initialData={verification} />;
  }

  return (
    <div className="p-6 text-center text-slate-500">
      Verification viewer not available for role: {role}
    </div>
  );
}
