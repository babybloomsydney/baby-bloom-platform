"use client";

/**
 * Context that lets the deeply-nested `<DraftTile />` (rendered
 * inside MessageRow → AssistantMessage → RenderTile) communicate
 * back up to KatieDeck without prop-drilling through 4 layers.
 *
 * Three actions:
 *   - onAccept(draftId, args, imageUrl?)
 *       Commit the draft. Frontend POSTs to /api/chat/drafts/accept
 *       in the parent component; this provider just pipes the call.
 *   - onAmend(draftId, toolName)
 *       Tell Katie the user wants changes. The parent typically
 *       sends a synthetic user message ("Please amend that — what
 *       would you like to change?") and Katie responds with a new
 *       propose_X call that replaces the draft tile.
 *   - onDismiss(draftId)
 *       Remove the draft tile (and its host chat message) from the
 *       deck. Nothing is persisted on Dismiss.
 *
 * Default values are no-ops so accidentally rendering a DraftTile
 * outside the deck doesn't crash. The DraftTile component reports
 * a console warning if asked to act on a default-handler context.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface DraftActionsContextValue {
  onAccept: (
    draftId: string,
    toolName: string,
    args: Record<string, unknown>,
    imageUrl: string | null,
  ) => void | Promise<void>;
  /**
   * Triggered when the user submits an amendment from the inline
   * textbox on the draft tile. `changeText` is the user's typed
   * description of what to change — the parent forwards it to
   * Katie as a synthetic user message so she can re-propose with
   * revised args. Empty/undefined means the user hit Amend with no
   * change text (treated as a generic "what to change?" prompt for
   * back-compat).
   */
  onAmend: (
    draftId: string,
    toolName: string,
    changeText?: string,
  ) => void | Promise<void>;
  onDismiss: (draftId: string) => void;
  /**
   * True when the parent has supplied real handlers. When false
   * the DraftTile renders the buttons disabled to make the missing
   * wiring obvious in tests / orphaned mounts.
   */
  isWired: boolean;
}

const FALLBACK: DraftActionsContextValue = {
  onAccept: () => {},
  onAmend: () => {},
  onDismiss: () => {},
  isWired: false,
};

const DraftActionsContext = createContext<DraftActionsContextValue>(FALLBACK);

export function DraftActionsProvider({
  value,
  children,
}: {
  value: Omit<DraftActionsContextValue, "isWired">;
  children: ReactNode;
}) {
  return (
    <DraftActionsContext.Provider value={{ ...value, isWired: true }}>
      {children}
    </DraftActionsContext.Provider>
  );
}

export function useDraftActions(): DraftActionsContextValue {
  return useContext(DraftActionsContext);
}
