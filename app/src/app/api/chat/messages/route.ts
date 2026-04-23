/**
 * GET /api/chat/messages?limit=20 — returns recent messages for the
 * authenticated user's bot (chronological — oldest first).
 */

import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
  if (!KATIE_ENABLED) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit")) || 30),
  );

  const admin = createAdminClient();

  const { data: bot } = await admin
    .from("bloombot")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!bot) {
    return NextResponse.json({ messages: [] });
  }

  const { data, error } = await admin
    .from("chat_messages")
    .select("id, role, content, trigger_source, is_read, created_at, metadata")
    .eq("bloombot_id", bot.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[api/chat/messages]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return chronological (oldest first) for the client to render top→bottom
  const messages = (data ?? []).reverse();

  return NextResponse.json({ messages });
}
