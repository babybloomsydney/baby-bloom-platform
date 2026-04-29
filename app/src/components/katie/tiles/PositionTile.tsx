"use client";

/**
 * PositionTile — id-only interactive tile for the parent's active
 * position.
 *
 * Carries the position id; fetches the live row on mount and on
 * window focus (visibility-gated, rate-limited) via
 * `useLiveTileData`. Renders the SHARED `<PositionDetailView />`
 * component used on /parent/position in compact + read-only mode so
 * the chat view never drifts visually from the main page.
 *
 * Does NOT wrap the whole card in a `<button>` because
 * `PositionDetailView` contains its own tab triggers (`<button>`s) —
 * nesting buttons is invalid HTML and breaks assistive tech. Instead
 * a small "Open on main page" link sits at the bottom of the tile.
 */

import { useCallback } from "react";
import { Loader2, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ParentPositionChatTile } from "@/lib/chat/tiles";
import type { PositionWithChildren } from "@/lib/actions/parent";
import { PositionDetailView } from "@/app/parent/request/renderers/PositionDetailView";
import type { TypeformFormData } from "@/app/parent/request/questions";
import { useLiveTileData } from "./use-live-tile-data";

interface PositionLiveData {
  id: string;
  position: PositionWithChildren;
}

function isLiveData(value: unknown): value is PositionLiveData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { id?: unknown; position?: unknown };
  if (typeof v.id !== "string") return false;
  if (typeof v.position !== "object" || v.position === null) return false;
  const p = v.position as { id?: unknown };
  return typeof p.id === "string";
}

function extractFormData(
  position: PositionWithChildren,
): Partial<TypeformFormData> {
  // Defensive unwrap: position.details is `unknown`-ish on the row.
  // Verify it's an object, then verify form_data is also an object,
  // then accept the shape (PositionDetailView is fully Partial-tolerant).
  const details = position.details;
  if (!details || typeof details !== "object") return {};
  const formData = (details as Record<string, unknown>).form_data;
  if (!formData || typeof formData !== "object") return {};
  return formData as Partial<TypeformFormData>;
}

export function PositionTile({ tile }: { tile: ParentPositionChatTile }) {
  const { id } = tile.data;
  // Stable validator reference so the hook's effect doesn't re-run on every
  // render. Inline `(v) => isLiveData(v)` would change identity each render.
  const validate = useCallback(isLiveData, []);
  const state = useLiveTileData<PositionLiveData>(
    `/api/chat/position/${id}`,
    validate,
    "Failed to load position.",
  );

  if (state.kind === "loading") {
    return (
      <article
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        aria-busy="true"
      >
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading position…
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

  const { position } = state.data;
  const formData = extractFormData(position);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <PositionDetailView
        initialData={formData}
        editingExternal={false}
        hideClosePosition
        compact
      />
      <Link
        href="/parent/position"
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 rounded"
      >
        Open on main page
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
