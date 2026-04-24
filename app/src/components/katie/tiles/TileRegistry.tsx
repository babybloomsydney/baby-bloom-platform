"use client";

/**
 * TileRegistry — the single point where Katie's chat-deck tiles are
 * dispatched by `kind`. Adding a new tile kind = one new branch here +
 * one new case in `isChatTile` in `src/lib/chat/tiles.ts`. No other
 * file touches the dispatch.
 *
 * Architectural commitment (from the Phase 4 plan): for INTERACTIVE
 * tiles (interview_request, connection_request, bsr_job, etc.), the
 * branch below imports the EXACT SAME component rendered on the main
 * page — not a chat-specific copy. The tile component handles its own
 * data fetch + Realtime subscription + action handlers, so Katie's
 * view and the rest of the site stay in lockstep.
 */

import type { ChatTile } from "@/lib/chat/tiles";
import { KatieNoteTile } from "./KatieNoteTile";

export function RenderTile({ tile }: { tile: ChatTile }) {
  switch (tile.kind) {
    case "katie_note":
      return <KatieNoteTile tile={tile} />;
    // Add future kinds here. Each new kind should:
    //   1. Import the SAME React component used on the main page.
    //   2. Pass the minimal id payload; component fetches live data.
    // e.g.:
    //   case "interview_request":
    //     return <InterviewRequestTile id={tile.data.id} />;
    default:
      // Once ChatTile has ≥2 members, reinstate the exhaustiveness guard
      // (`const _exhaustive: never = tile`). Single-member unions don't
      // narrow the default branch to `never`, so TS rejects the guard
      // today. Keep the explicit default return instead.
      return null;
  }
}
