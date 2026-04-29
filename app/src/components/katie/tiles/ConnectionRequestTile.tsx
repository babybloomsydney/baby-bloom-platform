"use client";

/**
 * ConnectionRequestTile — id-only interactive tile.
 *
 * Carries just the connection id; fetches the live record on mount
 * (and on window focus, debounced + visibility-gated) via
 * `useLiveTileData`. Renders the SHARED `<ConnectionTile />`
 * component so the chat view never drifts visually from the main
 * connections page (architectural commitment — see TileRegistry.tsx
 * leading comment).
 *
 * Click navigates to the role's connections deck:
 *   parent → /parent/connections
 *   nanny  → /nanny/inbox
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import type { ConnectionRequestChatTile } from "@/lib/chat/tiles";
import type { ConnectionRequestWithDetails } from "@/lib/actions/connection";
import {
  ConnectionTile,
  type ViewerRole,
} from "@/components/connections/ConnectionTile";
import { useLiveTileData } from "./use-live-tile-data";

interface ConnectionLiveData {
  id: string;
  role: ViewerRole;
  connection: ConnectionRequestWithDetails;
}

// Validates the API envelope and that the embedded connection has
// the minimum fields ConnectionTile reads at the top level.
// Deeper nested fields (nanny / parent objects) are checked at
// render time inside the shared component, which already handles
// missing data gracefully.
function isLiveData(value: unknown): value is ConnectionLiveData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { id?: unknown; role?: unknown; connection?: unknown };
  if (typeof v.id !== "string") return false;
  if (v.role !== "nanny" && v.role !== "parent") return false;
  if (typeof v.connection !== "object" || v.connection === null) return false;
  const c = v.connection as {
    id?: unknown;
    status?: unknown;
  };
  return typeof c.id === "string" && typeof c.status === "string";
}

export function ConnectionRequestTile({
  tile,
}: {
  tile: ConnectionRequestChatTile;
}) {
  const router = useRouter();
  const { id } = tile.data;
  const validate = useCallback(isLiveData, []);
  const state = useLiveTileData<ConnectionLiveData>(
    `/api/chat/connections/${id}`,
    validate,
    "Failed to load connection.",
  );

  if (state.kind === "loading") {
    return (
      <article
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        aria-busy="true"
      >
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading connection…
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

  const { connection, role } = state.data;
  const href = role === "parent" ? "/parent/connections" : "/nanny/inbox";

  return (
    <ConnectionTile
      request={connection}
      viewerRole={role}
      onClick={() => router.push(href)}
    />
  );
}
