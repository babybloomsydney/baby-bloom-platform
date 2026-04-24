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
import type { FeedItem } from "@/types/bapp";
import { KatieNoteTile } from "./KatieNoteTile";
import { ActivityTile } from "@/components/bapp/tiles/ActivityTile";
import { ObservationTile } from "@/components/bapp/tiles/ObservationTile";
import { DiaryTile } from "@/components/bapp/tiles/DiaryTile";

export function RenderTile({ tile }: { tile: ChatTile }) {
  switch (tile.kind) {
    case "katie_note":
      return <KatieNoteTile tile={tile} />;
    case "activity":
      // Same component the child feed uses. No `onViewActivity` handler
      // here — the "View Activity →" button only renders when a handler
      // is supplied, so Katie's inline version stays compact. Users who
      // want the full sheet can open the child's development page.
      return <ActivityTile item={tile.data.item as FeedItem} />;
    case "observation":
      return <ObservationTile item={tile.data.item as FeedItem} />;
    case "diary":
      return <DiaryTile item={tile.data.item as FeedItem} />;
    // Future kinds — add here, importing the SAME component used on the
    // main page. e.g.:
    //   case "interview_request":
    //     return <InterviewRequestTile id={tile.data.id} />;
    default: {
      const _exhaustive: never = tile;
      void _exhaustive;
      return null;
    }
  }
}
