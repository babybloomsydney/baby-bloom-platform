"use client";

/**
 * PlacementTile — id-only interactive tile for the parent's active
 * placement (their hired nanny).
 *
 * Carries the placement id; fetches the live row on mount and on
 * window focus (visibility-gated, rate-limited) via
 * `useLiveTileData`. Renders the SHARED `<PlacementCard />` component
 * used on /parent/position in compact + read-only mode so the chat
 * view never drifts visually from the main page.
 *
 * Click navigates to /parent/position where the user can edit pay
 * and hours, view contact details, or end the placement.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import type { ParentPlacementChatTile } from "@/lib/chat/tiles";
import type { PlacementData } from "@/lib/types/placement";
import { PlacementCard } from "@/components/parent/PlacementCard";
import { useLiveTileData } from "./use-live-tile-data";

interface PlacementLiveData {
  id: string;
  placement: PlacementData;
}

function isLiveData(value: unknown): value is PlacementLiveData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { id?: unknown; placement?: unknown };
  if (typeof v.id !== "string") return false;
  if (typeof v.placement !== "object" || v.placement === null) return false;
  const p = v.placement as { id?: unknown; nannyName?: unknown };
  return typeof p.id === "string" && typeof p.nannyName === "string";
}

export function PlacementTile({ tile }: { tile: ParentPlacementChatTile }) {
  const router = useRouter();
  const { id } = tile.data;
  const validate = useCallback(isLiveData, []);
  const state = useLiveTileData<PlacementLiveData>(
    `/api/chat/placement/${id}`,
    validate,
    "Failed to load placement.",
  );

  if (state.kind === "loading") {
    return (
      <article
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        aria-busy="true"
      >
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading placement…
        </div>
      </article>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        role="alert"
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {state.message}
        </div>
      </div>
    );
  }

  const { placement } = state.data;

  return (
    <PlacementCard
      placement={placement}
      compact
      hideViewProfile
      onClick={() => router.push("/parent/position")}
    />
  );
}
