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
 * Future interactive kinds follow this id-only shape. The rendering
 * component reads live data itself so we never diverge from the main page.
 *
 *   | { kind: "interview_request"; data: { id: string } }
 *   | { kind: "connection_request"; data: { id: string } }
 *   | { kind: "bsr_job"; data: { id: string; slot_id?: string } }
 *   | { kind: "nanny_profile_preview"; data: { nanny_id: string } }
 *   | { kind: "parent_position_preview"; data: { position_id: string } }
 *
 * Do NOT add them to the union until the matching module + tile component
 * actually ship. Stubbing breaks the "one kind ↔ one implementation"
 * invariant.
 */

export type ChatTile = KatieNoteTile;

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
  switch (obj.kind) {
    case "katie_note":
      return typeof data.body === "string" && data.body.length > 0;
    default:
      return false;
  }
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
