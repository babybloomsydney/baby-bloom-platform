import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BAppLayout } from "@/components/bapp/BAppLayout";
import type { ChildClient } from "@/types/bapp";

export default async function ParentDevelopmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { childId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const admin = createAdminClient();

  // Fetch child and verify access
  const { data: child, error } = await admin
    .from("child_client")
    .select("*")
    .eq("id", params.childId)
    .single();

  if (error || !child) redirect("/parent");

  // Verify parent has access
  const c = child as ChildClient;
  if (c.parent_user_id !== user.id) {
    redirect("/parent");
  }

  return (
    <BAppLayout child={c} role="parent">
      {children}
    </BAppLayout>
  );
}
