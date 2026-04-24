/**
 * ChatTile — the shape of a tile Katie renders inline in her chat deck.
 *
 * Architectural contract for interactive Phase 4 modules (connections, BSR,
 * profile, etc.):
 *
 *   The tile rendered in Katie's chat IS the same React component rendered
 *   on the main page. Tiles don't freeze a snapshot at tile-creation time —
 *   they receive an id, read live data themselves (SWR / Realtime / server
 *   action), and update in place. Zero drift between Katie's view and the
 *   rest of the site.
 *
 *   The payload we put on `data` is therefore kept minimal — usually just
 *   the entity id (and any disambiguating context like a slot id for BSR).
 *   The component does the hard work of rendering + subscribing + acting.
 *
 *   The one exception is `katie_note`, which is a Katie-authored message
 *   tile with no underlying entity. Its `data` carries the content itself.
 */

// ── Kinds ─────────────────────────────────────────────────────────────────

export interface KatieNoteTile {
  kind: "katie_note";
  data: {
    /** Optional short badge (e.g. "Reminder", "Summary", "Tip"). */
    badge?: string;
    /** Short headline. */
    title?: string;
    /** Body text — plain markdown-lite (line breaks respected). */
    body: string;
    /** Optional image url. */
    image_url?: string;
    /** Optional one-click action (e.g. a link to a verification page). */
    action?: { label: string; href: string };
  };
}

/**
 * FeedItem-shaped snapshot used by every "bapp_logs tile" kind.
 *
 * Matches @/types/bapp#FeedItem but duplicated here to keep
 * @/lib/chat/tiles browser + server safe and dependency-light. The
 * TileRegistry branch casts back to FeedItem on render.
 *
 * Snapshot-style payload (not id-based) is safe for types that are
 * effectively append-only (`activity` goes pending → ready once during
 * OpenAI; `observation`, `diary`, `progress` never change after write).
 * When we get to interactive kinds (connections, BSR), those use an
 * id-only payload so the component subscribes to live updates.
 */
interface FeedItemSnapshot<T extends string> {
  id: string;
  child_client_id: string;
  author_id: string;
  author_name: string;
  type: T;
  status: "pending" | "ready" | "completed";
  context: string;
  parent_log_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Activity plan — wraps the existing ActivityTile. */
export interface ActivityChatTile {
  kind: "activity";
  data: { item: FeedItemSnapshot<"activity"> };
}

/** Observation — wraps the existing ObservationTile. */
export interface ObservationChatTile {
  kind: "observation";
  data: { item: FeedItemSnapshot<"observation"> };
}

/** Diary (food or sleep — the inner DiaryTile branches by subtype). */
export interface DiaryChatTile {
  kind: "diary";
  data: { item: FeedItemSnapshot<"diary"> };
}

/** Progress update — wraps the existing ProgressTile. */
export interface ProgressChatTile {
  kind: "progress";
  data: { item: FeedItemSnapshot<"progress"> };
}

/**
 * Verification status — wraps the existing VerificationProgress stepper.
 *
 * Pre-computed on the server so the tile renders without needing Katie's
 * verification pipeline in the browser. `steps` is passed directly to
 * VerificationProgress (same component the design system uses); the
 * step statuses use the verification vocabulary
 * (`verified` / `processing` / `review` / `failed` / `not_started`).
 *
 * Provisional UX rule still holds: for a level-3 nanny, all steps
 * render as `verified` and the pending-final-check note never appears
 * on the tile — that information lives in the VerificationSummary's
 * `only_if_asked` list, which Katie only surfaces when the user asks.
 */
export interface VerificationStatusChatTile {
  kind: "verification_status";
  data: {
    headline: string;
    steps: Array<{ label: string; status: string }>;
    action?: { label: string; href: string };
  };
}

/**
 * Connection request — id-only; the tile fetches live data itself.
 *
 * Connections change state over time (a parent schedules a time, a
 * nanny reports an outcome, the position moves to offered). If we
 * froze a snapshot at tile-creation time the chat view would drift
 * from the live state on /nanny/positions or /parent/inbox.
 *
 * Instead the tile carries just the connection id. ConnectionRequestTile
 * fetches fresh state via `/api/chat/connections/[id]` (role-aware,
 * RLS-scoped). When the user acts on the main page the tile revalidates.
 */
export interface ConnectionRequestChatTile {
  kind: "connection_request";
  data: {
    id: string;
  };
}

/**
 * Babysitting job — id-only. Same live-fetch pattern as
 * `connection_request`. BsrJobTile reads from
 * `/api/chat/bsr/[id]` (role-aware: nanny sees their invitation,
 * parent sees their own request). Expiry ticks visibly until the
 * user acts; buckets shift when the nanny / parent decides.
 */
export interface BsrJobChatTile {
  kind: "bsr_job";
  data: {
    id: string;
  };
}

/**
 * DFY-match notification — id-only. Nanny-only; job matches don't
 * have state equivalent to connections, but the details come from
 * a server action that resolves recent position data. The tile
 * fetches live from `/api/chat/job-matches/[id]`.
 */
export interface JobMatchChatTile {
  kind: "job_match";
  data: {
    id: string;
  };
}

/**
 * Future interactive kinds follow an id-only shape — the rendering
 * component reads live data itself so we never diverge from the main
 * page. e.g.
 *
 *   | { kind: "interview_request"; data: { id: string } }
 *   | { kind: "connection_request"; data: { id: string } }
 *   | { kind: "bsr_job"; data: { id: string; slot_id?: string } }
 *
 * Do NOT add them to the union until the matching module + tile
 * component actually ship.
 */

export type ChatTile =
  | KatieNoteTile
  | ActivityChatTile
  | ObservationChatTile
  | DiaryChatTile
  | ProgressChatTile
  | VerificationStatusChatTile
  | ConnectionRequestChatTile
  | BsrJobChatTile
  | JobMatchChatTile;

// ── Runtime validation ───────────────────────────────────────────────────

/**
 * Cheap runtime check that a value looks like a ChatTile. Used at trust
 * boundaries:
 *   - chat route, before emitting an SSE tile event
 *   - chat route, before persisting to chat_messages.tile
 *   - chat messages endpoint, before returning to the client
 */
export function isChatTile(value: unknown): value is ChatTile {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.kind !== "string") return false;
  if (!obj.data || typeof obj.data !== "object") return false;

  // Per-kind shape check. Add a branch when adding a new kind.
  const data = obj.data as Record<string, unknown>;
  // Cast to the union's `kind` literal so the exhaustiveness guard on
  // the default branch catches missing cases at compile time. Runtime
  // values that don't match any case land in default → false, as before.
  const kind = obj.kind as ChatTile["kind"];
  switch (kind) {
    case "katie_note":
      return typeof data.body === "string" && data.body.length > 0;
    case "activity":
      return isFeedItemSnapshot(data.item, "activity");
    case "observation":
      return isFeedItemSnapshot(data.item, "observation");
    case "diary":
      return isFeedItemSnapshot(data.item, "diary");
    case "progress":
      return isFeedItemSnapshot(data.item, "progress");
    case "verification_status": {
      if (typeof data.headline !== "string" || data.headline.length === 0)
        return false;
      if (!Array.isArray(data.steps)) return false;
      return data.steps.every(
        (raw): raw is { label: string; status: string } => {
          if (!raw || typeof raw !== "object") return false;
          const step = raw as Record<string, unknown>;
          return (
            typeof step.label === "string" && typeof step.status === "string"
          );
        },
      );
    }
    case "connection_request":
      return typeof data.id === "string" && data.id.length > 0;
    case "bsr_job":
      return typeof data.id === "string" && data.id.length > 0;
    case "job_match":
      return typeof data.id === "string" && data.id.length > 0;
    default: {
      // Exhaustiveness guard: if a new ChatTile kind is added without
      // extending this switch, TS complains here at compile time.
      const _exhaustive: never = kind;
      void _exhaustive;
      return false;
    }
  }
}

function isFeedItemSnapshot(raw: unknown, expectedType: string): boolean {
  if (!raw || typeof raw !== "object") return false;
  const item = raw as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.child_client_id === "string" &&
    item.type === expectedType &&
    typeof item.status === "string" &&
    item.data != null &&
    typeof item.data === "object"
  );
}

/**
 * Narrow a DB row's `tile` JSONB field to a ChatTile or null. Swallows
 * malformed persistence gracefully (old schema, manual edits, rogue
 * writers) — rather than throwing and breaking the whole chat view.
 */
export function readPersistedTile(raw: unknown): ChatTile | null {
  if (raw == null) return null;
  return isChatTile(raw) ? raw : null;
}
