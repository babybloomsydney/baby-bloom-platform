/**
 * Draft accept dispatch (WU 8.22c).
 *
 * The chat client POSTs to /api/chat/drafts/accept when the user
 * clicks Accept on a draft tile. That route builds an `ApplyContext`
 * (auth + children + supabase) and forwards to `applyDraft` here,
 * which switches by toolName to the right module's apply function.
 *
 * The `apply_X` functions live next to their `propose_X` counterparts
 * inside each module file (e.g., `applyLogFood` in diary.ts) so the
 * shared prepare-the-data logic doesn't duplicate. They are NOT
 * registered as LLM-callable tools — Katie only ever calls the
 * propose path. Apply runs server-side from the user's button click.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatTile } from "@/lib/chat/tiles";
import type { ChildSummary } from "@/lib/chat/modules/types";
import { applyLogFood, applyLogSleep } from "@/lib/chat/modules/diary";

export interface ApplyContext {
  userId: string;
  children: ChildSummary[];
  supabase: SupabaseClient;
}

export type ApplyResult =
  | { ok: true; tile: ChatTile; data: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Merge the user-supplied imageUrl (uploaded via the draft tile's
 * Add Image button) into args before dispatch. We do this in one
 * place so each apply function doesn't need to know whether the
 * URL came from the original propose call or was added later.
 *
 * `null` clears the field; `undefined` leaves it untouched (in
 * case the propose path already set it from a Plus-button image).
 */
function mergeImageUrl(
  args: Record<string, unknown>,
  imageUrl: string | null | undefined,
): Record<string, unknown> {
  if (imageUrl === undefined) return args;
  if (imageUrl === null) {
    // Strip any pre-existing image_url from args.
    const next = { ...args };
    delete next.image_url;
    return next;
  }
  return { ...args, image_url: imageUrl };
}

export async function applyDraft(
  toolName: string,
  args: Record<string, unknown>,
  imageUrl: string | null | undefined,
  ctx: ApplyContext,
): Promise<ApplyResult> {
  const merged = mergeImageUrl(args, imageUrl);
  switch (toolName) {
    case "log_food":
      return applyLogFood(merged, ctx);
    case "log_sleep":
      return applyLogSleep(merged, ctx);
    // Subsequent tools land in 8.22d. Any unrecognised toolName
    // surfaces here as a 400 to the caller — it shouldn't happen
    // unless the chat client and the server are out of sync about
    // which propose tools are wired.
    default:
      return {
        ok: false,
        error: `Unknown draft toolName: ${toolName}`,
      };
  }
}
