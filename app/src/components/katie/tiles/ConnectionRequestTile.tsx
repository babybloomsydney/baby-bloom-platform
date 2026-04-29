"use client";

/**
 * ConnectionRequestTile — id-only interactive tile.
 *
 * Carries just the connection id; fetches the live record on mount
 * (and on window focus, debounced + visibility-gated) from
 * `/api/chat/connections/[id]`. Renders the SHARED `<ConnectionTile />`
 * component so the chat view never drifts visually from the main
 * connections page (architectural commitment — see TileRegistry.tsx
 * leading comment).
 *
 * Click navigates to the role's connections deck:
 *   parent → /parent/connections
 *   nanny  → /nanny/inbox
 *
 * Action buttons (accept / decline / schedule / cancel) are NOT
 * inline — the user lands on the main page where the modal handles
 * the action with the existing flow.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import type { ConnectionRequestChatTile } from "@/lib/chat/tiles";
import type { ConnectionRequestWithDetails } from "@/lib/actions/connection";
import {
  ConnectionTile,
  type ViewerRole,
} from "@/components/connections/ConnectionTile";

const FOCUS_REFETCH_MIN_INTERVAL_MS = 5_000;

interface ConnectionLiveData {
  id: string;
  role: ViewerRole;
  connection: ConnectionRequestWithDetails;
}

interface ApiError {
  error: string;
}

function isError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
  );
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
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: ConnectionLiveData }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const lastFocusFetchRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/chat/connections/${id}`, {
          cache: "no-store",
        });
        const body: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          const msg = isError(body) ? body.error : "Failed to load connection.";
          setState({ kind: "error", message: msg });
          return;
        }
        if (!isLiveData(body)) {
          setState({
            kind: "error",
            message: "Unexpected connection payload.",
          });
          return;
        }
        setState({ kind: "ready", data: body });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            err instanceof Error ? err.message : "Failed to load connection.",
        });
      }
    };

    load();

    // Refetch on window focus so the chat view catches up after the
    // user acts on the main page (accept / schedule / decline).
    // Visibility-gated and rate-limited so a wall of connection tiles
    // doesn't trigger a request storm on every tab switch.
    const handleFocus = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }
      const now = Date.now();
      if (now - lastFocusFetchRef.current < FOCUS_REFETCH_MIN_INTERVAL_MS) {
        return;
      }
      lastFocusFetchRef.current = now;
      void load();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Loading connection…
        </div>
      </article>
    );
  }

  if (state.kind === "error") {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {state.message}
        </div>
      </article>
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
