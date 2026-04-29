"use client";

/**
 * Shared PlacementCard — the parent's "my nanny" tile.
 *
 * Architectural commitment (TileRegistry leading comment): the chat
 * version of this card is the SAME component rendered on /parent/position
 * — no chat-specific copy. This file is the source of truth for the
 * visual.
 *
 * The main page needs inline editing (rate, hours) and a 3-dot menu
 * (edit / contact / remove). Those affordances aren't part of the
 * read-only chat tile, so they're injected via slot props:
 *
 *   - `rateNode`  — replaces the rate text with an inline input on edit
 *   - `hoursNode` — same, for weekly hours
 *   - `menuSlot`  — top-right block (3-dot menu + save tick)
 *
 * The chat tile passes none of those, hides the View Profile button
 * (whole-card click navigates instead), and provides `onClick` so the
 * card renders as a button.
 *
 * Carve-out: the "Remove nanny" dialog and "Contact" popover stay in
 * `PositionPageClient.tsx` because they own state (removeStep,
 * showContactPopup) above this component. Only the read-only visual
 * layer lives here.
 */

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Calendar,
  Clock,
  DollarSign,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlacementData } from "@/lib/types/placement";

export interface PlacementCardProps {
  placement: PlacementData;
  /**
   * Compact density — slightly smaller padding and avatar. Used by
   * Katie's chat tile so the placement fits the chat row height.
   */
  compact?: boolean;
  /**
   * Override for the rate display (right column, top). Defaults to
   * read-only formatted text. Main page passes an `<input>` when
   * editing.
   */
  rateNode?: React.ReactNode;
  /** Override for the weekly hours display. Defaults to read-only text. */
  hoursNode?: React.ReactNode;
  /**
   * Absolute top-right block — 3-dot menu, save tick, etc. Omitted
   * means no menu (chat tile).
   */
  menuSlot?: React.ReactNode;
  /** Suppress the View Profile button at the bottom (chat tile uses onClick). */
  hideViewProfile?: boolean;
  /**
   * When provided, the entire card becomes a `<button>` so a click
   * anywhere navigates. Used by the chat tile.
   */
  onClick?: () => void;
}

function computeAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function StartDateLine({ startDate }: { startDate: string | null }) {
  if (!startDate) return null;
  if (startDate === "tbc") {
    return (
      <div className="flex items-center justify-end gap-1 text-sm text-amber-600">
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        Start TBC
      </div>
    );
  }
  const startMon = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(startMon.getTime())) return null;
  const isPast = startMon <= new Date();
  const label = startMon.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
  return (
    <div className="flex items-center justify-end gap-1 text-sm text-slate-500">
      <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      {isPast ? `Started ${label}` : `Starting ${label}`}
    </div>
  );
}

function defaultRateNode(placement: PlacementData) {
  const value = placement.hourlyRate
    ? `$${placement.hourlyRate}/hr`
    : placement.nannyHourlyRate
      ? `$${placement.nannyHourlyRate}/hr`
      : "Rate not set";
  return (
    <div className="flex items-center justify-end gap-1">
      <DollarSign className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      <span className="text-sm text-slate-600 font-medium">{value}</span>
    </div>
  );
}

function defaultHoursNode(placement: PlacementData) {
  const value = placement.weeklyHours
    ? `${placement.weeklyHours}hrs/wk`
    : "Hours not set";
  return (
    <div className="flex items-center justify-end gap-1">
      <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      <span className="text-sm text-slate-600">{value}</span>
    </div>
  );
}

export function PlacementCard({
  placement,
  compact = false,
  rateNode,
  hoursNode,
  menuSlot,
  hideViewProfile = false,
  onClick,
}: PlacementCardProps) {
  const age = computeAge(placement.nannyDateOfBirth);
  const interactive = typeof onClick === "function";

  // Nested-interactive guard. The interactive variant wraps the body
  // in a `<button>`. Menu slot + visible View Profile link both
  // contain `<button>` / `<a>` elements — nesting them inside the
  // outer button is invalid HTML and breaks assistive tech. The chat
  // tile passes `hideViewProfile` and no menu, so this is safe today.
  // Surface the misuse loudly in dev rather than silently rendering
  // a broken card.
  if (
    interactive &&
    process.env.NODE_ENV !== "production" &&
    (menuSlot || !hideViewProfile)
  ) {
    console.error(
      "[PlacementCard] `onClick` cannot combine with `menuSlot` or a visible View Profile link " +
        "— would nest interactive elements inside an outer <button>. Pass `hideViewProfile` and " +
        "drop `menuSlot` when using the interactive variant.",
    );
  }

  const avatarSize = compact ? "w-14 h-14" : "w-20 h-20";
  const avatarInitialClass = compact ? "text-lg" : "text-2xl";
  const nameClass = compact ? "font-semibold text-base" : "font-bold text-xl";
  const cardPadding = compact ? "px-4 py-3" : "px-5 py-4";

  const body = (
    <CardContent className={cardPadding}>
      <div className="flex items-start gap-4 relative">
        {/* Photo */}
        <div className="shrink-0">
          {placement.nannyPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={placement.nannyPhoto}
              alt=""
              className={cn(avatarSize, "rounded-full object-cover")}
            />
          ) : (
            <div
              className={cn(
                avatarSize,
                "rounded-full bg-violet-100 flex items-center justify-center",
              )}
            >
              <span
                className={cn(
                  avatarInitialClass,
                  "font-semibold text-violet-500",
                )}
              >
                {placement.nannyName.charAt(0)}
              </span>
            </div>
          )}
        </div>

        {/* Info — left */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className={cn(nameClass, "text-slate-900 truncate")}>
              {placement.nannyName.split(" ")[0]}
            </h3>
            {age != null && (
              <span className="text-base text-slate-400 shrink-0">{age}</span>
            )}
          </div>

          {placement.nannySuburb && (
            <div className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {placement.nannySuburb}
            </div>
          )}

          {placement.wwccVerified && (
            <div className="flex items-center gap-1 text-green-600 text-xs font-medium mt-1">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Verified
            </div>
          )}
        </div>

        {/* Right column — rate / hours / start date */}
        <div className="shrink-0 text-right space-y-1.5 mr-14">
          {rateNode ?? defaultRateNode(placement)}
          {hoursNode ?? defaultHoursNode(placement)}
          <StartDateLine startDate={placement.startDate} />
        </div>

        {/* Top-right slot — menu / save tick (main page only) */}
        {menuSlot && (
          <div className="absolute top-0 right-0 flex items-center gap-0.5">
            {menuSlot}
          </div>
        )}
      </div>

      {/* View Profile — main page only; chat tile uses whole-card click */}
      {!hideViewProfile && (
        <div className="mt-4">
          <Button asChild variant="outline" className="w-full">
            <Link href={`/nannies/${placement.nannyId}`}>
              View Profile
              <ArrowRight className="ml-1.5 w-4 h-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </CardContent>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2"
      >
        <Card className="hover:shadow-md transition-all hover:border-violet-200 overflow-hidden">
          {body}
        </Card>
      </button>
    );
  }

  return (
    <Card className="hover:shadow-md transition-all hover:border-violet-200 overflow-hidden">
      {body}
    </Card>
  );
}
