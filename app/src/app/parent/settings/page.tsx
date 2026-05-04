import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ParentSettingsClient } from "./ParentSettingsClient";
import type { ChildClient } from "@/types/bapp";

export default async function ParentSettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const admin = createAdminClient();

  const [profileRes, childrenRes] = await Promise.all([
    admin
      .from("user_profiles")
      .select(
        "first_name, last_name, email, mobile_number, date_of_birth, suburb, postcode",
      )
      .eq("user_id", user.id)
      .single(),
    admin
      .from("child_client")
      .select("*")
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  return (
    <ParentSettingsClient
      profile={{
        first_name: profileRes.data?.first_name || "",
        last_name: profileRes.data?.last_name || "",
        email: profileRes.data?.email || "",
        mobile_number: profileRes.data?.mobile_number || "",
        date_of_birth: profileRes.data?.date_of_birth || "",
        suburb: profileRes.data?.suburb || "",
        postcode: profileRes.data?.postcode || "",
      }}
      managedChildren={(childrenRes.data ?? []) as ChildClient[]}
    />
  );
}
