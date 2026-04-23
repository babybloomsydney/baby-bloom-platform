"use client";

/**
 * KatieContext — client-side state for the Katie deck.
 *
 * Tracks:
 *   - currentSurface (route + feature + viewing) derived from usePathname()
 *   - unread count (driven by Realtime in Phase 1D; simple counter for now)
 *   - carousel visible deck on narrow viewports
 *
 * Consumers: KatieDeck (reads currentSurface on every send), swap control
 * in DashboardNav (reads unreadCount), KatieShell (reads visibleDeck).
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────

export interface CurrentSurface {
  route: string;
  feature: string;
  viewing?: { type: string; id: string } | null;
}

export type VisibleDeck = "katie" | "main";

interface KatieContextValue {
  currentSurface: CurrentSurface;
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  visibleDeck: VisibleDeck;
  showKatie: () => void;
  showMain: () => void;
  toggleDeck: () => void;
}

// ── Feature derivation from pathname ───────────────────────────────────

/** Derive a coarse feature id from the route segment. Used by system prompt. */
function deriveFeature(pathname: string): string {
  // Strip leading slash + query/hash
  const clean = pathname.split("?")[0].split("#")[0];
  const parts = clean.split("/").filter(Boolean);

  // Role prefix ('nanny' | 'parent' | 'admin' | 'apply' | public route)
  const second = parts[1];

  if (!second) return "hub";
  if (second === "development") return "child-development";
  if (second === "jobs" || second === "positions") return "job-search";
  if (second === "babysitting") return "bsr";
  if (second === "verification" || second === "onboarding-verification")
    return "verification";
  if (second === "profile") return "profile";
  if (second === "connections") return "connections";
  if (second === "inbox") return "inbox";
  if (second === "interviews") return "interviews";
  if (second === "matches") return "matches";
  if (second === "browse") return "browse";
  return second;
}

/** Extract a `{type, id}` if the route has a dynamic segment we recognise. */
function deriveViewing(pathname: string): { type: string; id: string } | null {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  // Common patterns:
  //   /{role}/development/{childId}/...  → child / childId
  //   /{role}/positions/{id}             → position / id
  //   /{role}/jobs/{id}                  → job / id
  //   /{role}/babysitting/{id}/...       → bsr / id
  const feature = parts[1];
  const maybeId = parts[2];
  if (!maybeId || /^[a-z-]+$/i.test(maybeId) === false) {
    // heuristic: only treat as ID if it looks uuid-ish or contains digits
  }
  if (feature === "development" && maybeId)
    return { type: "child", id: maybeId };
  if (
    (feature === "positions" || feature === "jobs") &&
    maybeId &&
    isIdLike(maybeId)
  ) {
    return { type: "position", id: maybeId };
  }
  if (feature === "babysitting" && maybeId && isIdLike(maybeId)) {
    return { type: "bsr", id: maybeId };
  }
  return null;
}

function isIdLike(s: string): boolean {
  // UUIDs contain hyphens or are 20+ chars; skip short/human-readable segments
  return s.length > 10 || s.includes("-");
}

// ── Context ────────────────────────────────────────────────────────────

const KatieContext = createContext<KatieContextValue | null>(null);

export function KatieProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const [unreadCount, setUnreadCount] = useState(0);
  const [visibleDeck, setVisibleDeck] = useState<VisibleDeck>("main");

  const currentSurface = useMemo<CurrentSurface>(() => {
    return {
      route: pathname,
      feature: deriveFeature(pathname),
      viewing: deriveViewing(pathname),
    };
  }, [pathname]);

  const showKatie = useCallback(() => setVisibleDeck("katie"), []);
  const showMain = useCallback(() => setVisibleDeck("main"), []);
  const toggleDeck = useCallback(() => {
    setVisibleDeck((d) => (d === "katie" ? "main" : "katie"));
  }, []);

  const value = useMemo(
    () => ({
      currentSurface,
      unreadCount,
      setUnreadCount,
      visibleDeck,
      showKatie,
      showMain,
      toggleDeck,
    }),
    [currentSurface, unreadCount, visibleDeck, showKatie, showMain, toggleDeck],
  );

  return (
    <KatieContext.Provider value={value}>{children}</KatieContext.Provider>
  );
}

export function useKatie(): KatieContextValue {
  const ctx = useContext(KatieContext);
  if (!ctx) {
    throw new Error("useKatie must be used within a KatieProvider");
  }
  return ctx;
}

/** Safe variant that returns null when outside a provider — for pages where
 *  Katie isn't mounted (logged-out, auth flow). */
export function useKatieOptional(): KatieContextValue | null {
  return useContext(KatieContext);
}
