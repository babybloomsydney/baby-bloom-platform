"use client";

/**
 * Shared fetch + revalidate plumbing for id-only chat tiles.
 *
 * The pattern: a chat tile carries an id, fetches the live row from
 * `/api/chat/<kind>/[id]` on mount, and refetches on window focus so
 * actions taken on the main page are reflected in the chat. Three
 * tiles use this — `ConnectionRequestTile`, `PositionTile`,
 * `PlacementTile` — and a fourth (`BsrJobTile`) and fifth
 * (`JobMatchTile`) likely will once they're audited.
 *
 * Centralising the plumbing here avoids drift in:
 *   - the cancellation flag pattern across rapid id changes
 *   - the visibility gate (don't fetch when the tab is backgrounded)
 *   - the rate-limit window (don't storm the API on every focus event)
 *
 * The runtime guard (`validate`) is the per-tile contract — the hook
 * doesn't know what shape each kind returns.
 */

import { useEffect, useRef, useState } from "react";

const FOCUS_REFETCH_MIN_INTERVAL_MS = 5_000;

export type LiveTileState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "error"; message: string };

interface ApiError {
  error: string;
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

/**
 * Fetches `/api/chat/<endpoint>` once on mount, then again on window
 * focus (visibility-gated, rate-limited at 5 s).
 *
 * @param url       the absolute path to fetch (caller builds it from
 *                  the tile id)
 * @param validate  a runtime type guard; if it returns false, the
 *                  hook surfaces an "Unexpected payload" error rather
 *                  than handing over corrupt data
 * @param fallback  user-facing message when the network or fetch
 *                  itself errors (component-specific)
 */
export function useLiveTileData<T>(
  url: string,
  validate: (value: unknown) => value is T,
  fallback: string,
): LiveTileState<T> {
  const [state, setState] = useState<LiveTileState<T>>({ kind: "loading" });
  const lastFocusFetchRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        const body: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          const msg = isApiError(body) ? body.error : fallback;
          setState({ kind: "error", message: msg });
          return;
        }
        if (!validate(body)) {
          setState({ kind: "error", message: "Unexpected payload." });
          return;
        }
        setState({ kind: "ready", data: body });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : fallback,
        });
      }
    };

    void load();

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
  }, [url, validate, fallback]);

  return state;
}
