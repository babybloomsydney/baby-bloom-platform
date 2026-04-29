"use client";

/**
 * Shared helper for whole-tile click-through navigation.
 *
 * Returns props to spread onto the tile's outer `<article>` so the
 * entire tile becomes a navigable link to its main-deck surface.
 * Keyboard-accessible (Enter only — per ARIA APG, role="link" does
 * not respond to Space). Inner clickable elements (action buttons,
 * `tel:` links) need `e.stopPropagation()` on their own onClick to
 * avoid double-navigation.
 *
 * Why role="link" + tabIndex + handlers rather than a real <Link>
 * wrapper: nested anchors inside `<Link>` are invalid HTML. This
 * pattern is the canonical accessible workaround for "make a card
 * navigable".
 *
 * KNOWN A11Y DEBT (defer): for tiles with inner clickables (e.g.
 * ConnectionRequestTile's `tel:` link), this creates a nested
 * link in the a11y tree, which violates ARIA 1.2 ("links must not
 * contain interactive descendants"). Axe-core will flag this. Real
 * fix is the anchor-overlay pattern: outer is a real <a href>
 * positioned absolutely under the content, inner clickables sit
 * above with z-index. Refactor when a11y compliance is demanded.
 * For now we accept the warning in exchange for the simpler shape.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";

export interface TileNavigationProps {
  role: "link";
  tabIndex: 0;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}

export function useTileNavigation(href: string): TileNavigationProps {
  const router = useRouter();
  const navigate = useCallback(() => {
    router.push(href);
  }, [router, href]);
  // Per ARIA APG: role="link" responds to Enter ONLY (not Space). Space
  // activation is button semantics. Adding Space would also conflict
  // with the page-scroll default keyboard users expect.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        navigate();
      }
    },
    [navigate],
  );
  return {
    role: "link",
    tabIndex: 0,
    onClick: navigate,
    onKeyDown,
  };
}

/**
 * Stops a click event on an inner clickable from bubbling up to the
 * tile-wrapper navigation handler. Use on `tel:` links, in-tile action
 * buttons, etc. — anything that should do its own thing instead of
 * navigating to the tile's detail page.
 */
export function stopTileNav(
  e: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
): void {
  e.stopPropagation();
}
