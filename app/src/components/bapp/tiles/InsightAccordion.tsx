"use client";

/**
 * Expandable insight panel rendered inside Observation, Progress and
 * Report tiles.
 *
 * Collapsed (default): shows the first paragraph (text before the
 * first `\n\n` break) with a chevron-down on the right.
 *
 * Expanded: shows every paragraph; chevron flips to chevron-up.
 *
 * Single-paragraph insights render the full text with no chevron —
 * there's nothing to expand and the toggle would only confuse.
 *
 * Visual chrome (amber-50 panel, sparkle icon, italic amber text)
 * is preserved exactly as the prior inline blocks rendered, so the
 * tile-level look does not regress.
 */

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SparkleIcon } from "@/components/katie/messages/SparkleIcon";
import { cn } from "@/lib/utils";

interface InsightAccordionProps {
  /** Full insight text. Paragraphs separated by `\n\n` per the AI
   *  contract in `src/lib/actions/bapp/insights.ts`. */
  insight: string;
}

export function InsightAccordion({ insight }: InsightAccordionProps) {
  const paragraphs = insight.split("\n\n").filter((p) => p.trim().length > 0);
  const isExpandable = paragraphs.length > 1;
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  if (paragraphs.length === 0) return null;

  // Pre-tag with a stable-across-render index BEFORE slicing for the
  // collapsed view. Using the position-in-full-list as the React key
  // means a paragraph's key doesn't change when the list shrinks
  // (collapsed → just paragraph 0) or grows (expanded → 0…N), so
  // future stateful / animated children won't churn on toggle.
  const indexedParagraphs = paragraphs.map((p, i) => ({ p, i }));
  const visibleParagraphs =
    expanded || !isExpandable
      ? indexedParagraphs
      : indexedParagraphs.slice(0, 1);

  return (
    // Visual chrome matches Katie's `CustomTile` (violet-50/80 →
    // white diagonal gradient, violet sparkle, violet text accents).
    // Per user feedback 2026-05-07: tile-insights and Katie-authored
    // tiles share the same visual family so the user reads them as
    // one continuous AI surface (rather than the prior amber/yellow
    // chip that felt like a different system).
    <div className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white px-2.5 py-2">
      <div className="flex items-start gap-1.5">
        <SparkleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <div id={panelId} className="flex-1 space-y-1.5">
          {visibleParagraphs.map(({ p, i }) => (
            <p key={i} className="text-xs italic text-slate-700">
              {p}
            </p>
          ))}
        </div>
        {isExpandable && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={expanded ? "Collapse insight" : "Show full insight"}
            className="ml-1 flex-shrink-0 rounded text-violet-500 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
    </div>
  );
}
