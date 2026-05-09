/**
 * Client-side preload publisher (Latency:Efficiency build, WU7 — F2 client).
 *
 * Pages set their server-loaded data into this context via
 * `setPreloadSlots`; KatieDeck reads `usePreloadOptional()` and
 * threads the merged slots into `/api/chat`'s request body. The
 * route's `verifyPreload` then re-checks ownership + freshness on
 * every slot before any of it touches the LLM context.
 *
 * Reset on route change so child A's data doesn't leak to child B.
 *
 * Spec: `Latency:Efficiency/04-data-contracts.md §6`.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { PreloadedContext } from "@/lib/chat/preload/types";

export interface PreloadContextValue {
  preload: PreloadedContext;
  /** Merge slots into the current preload. Slots not provided stay
   *  unchanged. `as_of` is auto-stamped when the caller doesn't
   *  supply one (consistent with the verifier's freshness gate). */
  setPreloadSlots: (slots: Partial<PreloadedContext>) => void;
  /** Drop everything. Called automatically on pathname change so
   *  navigating from child A's page to child B's page doesn't
   *  carry over A's slots. */
  clearPreload: () => void;
}

const Ctx = createContext<PreloadContextValue | null>(null);

export function PreloadProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [preload, setPreload] = useState<PreloadedContext>({});

  const setPreloadSlots = useCallback((slots: Partial<PreloadedContext>) => {
    setPreload((prev) => {
      // Multiple publishers may call `setPreloadSlots` on the
      // same surface (e.g. one for child profile, another for the
      // recent feed). The verifier reads `as_of` as the age of
      // the WHOLE payload, so the safest semantics is "earliest
      // wins" — never report the payload as fresher than its
      // oldest constituent. Per code-reviewer HIGH on WU7.
      const incoming = slots.as_of ?? new Date().toISOString();
      const merged: PreloadedContext = {
        ...prev,
        ...slots,
        as_of: prev.as_of && prev.as_of < incoming ? prev.as_of : incoming,
      };
      return merged;
    });
  }, []);

  const clearPreload = useCallback(() => setPreload({}), []);

  useEffect(() => {
    clearPreload();
  }, [pathname, clearPreload]);

  return (
    <Ctx.Provider value={{ preload, setPreloadSlots, clearPreload }}>
      {children}
    </Ctx.Provider>
  );
}

/** Throws when called outside `<PreloadProvider>`. */
export function usePreload(): PreloadContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("usePreload must be used inside <PreloadProvider>");
  }
  return v;
}

/**
 * Returns null when the provider isn't mounted. Used by code that
 * may render in test environments or in a tree branch that doesn't
 * want a hard dependency on the provider (e.g. KatieDeck, which
 * still needs to work even if its layout doesn't wrap the provider).
 */
export function usePreloadOptional(): PreloadContextValue | null {
  return useContext(Ctx);
}
