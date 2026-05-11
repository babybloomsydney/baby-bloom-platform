import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin route guard. Returns the authenticated admin's user.id when
 * the caller is admin/super_admin, otherwise redirects to /login.
 *
 * Centralised so per-page admin guards stay short + consistent. The
 * existing admin pages (e.g. /admin/viewer/[id]/layout.tsx) inlined
 * this; new admin pages prefer this helper.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const admin = createAdminClient();
  const { data: callerRole } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: string }>();

  if (!callerRole || !["admin", "super_admin"].includes(callerRole.role)) {
    redirect("/login");
  }

  return { userId: user.id };
}
