"use client";

/**
 * KatieNoteTile — the simplest possible inline chat tile.
 *
 * Katie-authored content with no underlying platform entity. Title +
 * markdown-lite body + optional image + optional single-action link.
 *
 * For INTERACTIVE tiles (InterviewRequest, ConnectionRequest, BsrJob,
 * ProfilePreview, etc.) the pattern is different — those wrap the
 * existing tile component from `src/components/bapp/tiles/` or their
 * own feature folder, receive an id, and subscribe to their own live
 * data. KatieNoteTile is not that — it's the trivial case for
 * Katie-authored narrative tiles.
 */

import Image from "next/image";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import type { KatieNoteTile as KatieNoteTileData } from "@/lib/chat/tiles";

export function KatieNoteTile({ tile }: { tile: KatieNoteTileData }) {
  const { badge, title, body, image_url, action } = tile.data;

  return (
    <article className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-3 shadow-sm">
      <header className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100">
          <Sparkles className="h-3.5 w-3.5 text-violet-600" />
        </div>
        <span className="text-xs font-medium text-violet-700">
          {badge ?? "Katie"}
        </span>
      </header>

      <div className="mt-3 space-y-2">
        {image_url ? (
          <div className="relative h-40 w-full overflow-hidden rounded-lg bg-slate-100">
            <Image
              src={image_url}
              alt={title ?? "Katie tile image"}
              fill
              sizes="(max-width: 768px) 100vw, 336px"
              className="object-cover"
            />
          </div>
        ) : null}
        {title ? (
          <p className="text-sm font-semibold text-slate-900">{title}</p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {body}
        </p>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-violet-700 hover:text-violet-900"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
