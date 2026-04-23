/**
 * POST /api/chat/mark-read — mark all unread proactive messages as read.
 *
 * Called by the Katie Deck client when:
 *   - User opens Katie's deck (carousel swap to Katie)
 *   - On desktop, a proactive message enters viewport for ≥2s
 *
 * Returns { updated: number }.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { KATIE_ENABLED } from "@/lib/chat/flags";

export const runtime = "nodejs";

async function getAuthUser() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST() {
  if (!KATIE_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find the user's bot
  const { data: bot } = await admin
    .from("bloombot")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!bot) {
    return NextResponse.json({ updated: 0 });
  }

  // Update all unread messages to read
  const { data, error } = await admin
    .from("chat_messages")
    .update({ is_read: true })
    .eq("bloombot_id", bot.id)
    .eq("is_read", false)
    .select("id");

  if (error) {
    console.error("[api/chat/mark-read] update failed", error);
    return NextResponse.json(
      { error: "failed to mark messages read" },
      { status: 500 },
    );
  }

  return NextResponse.json({ updated: data?.length ?? 0 });
}
