/**
 * GET /api/chat/bot-info — returns the authenticated user's bot id + unread count.
 *
 * The client needs the bot id to subscribe to Realtime on chat_messages
 * filtered by bloombot_id. This endpoint is small and idempotent.
 *
 * Returns:
 *   { botId: string, unreadCount: number }  // 200
 *   { error: string }                         // 401 / 404 / 500
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

export async function GET() {
  if (!KATIE_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: bot } = await admin
    .from("bloombot")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!bot) {
    // No bot yet — unread is 0, bot id null. Client will create on first chat.
    return NextResponse.json({ botId: null, unreadCount: 0 });
  }

  const { count } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("bloombot_id", bot.id)
    .eq("is_read", false);

  return NextResponse.json({
    botId: bot.id,
    unreadCount: count ?? 0,
  });
}
