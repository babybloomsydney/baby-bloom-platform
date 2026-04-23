/**
 * Three pulsing dots beside a sparkle, left-aligned. No container.
 * Respects prefers-reduced-motion via Tailwind motion-safe utilities.
 */

import { SparkleIcon } from "./SparkleIcon";

export function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-2 px-1 py-1"
      aria-label="Katie is writing"
    >
      <SparkleIcon className="h-3.5 w-3.5 text-violet-500" />
      <div className="flex gap-1">
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-pulse"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-pulse"
          style={{ animationDelay: "200ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-pulse"
          style={{ animationDelay: "400ms" }}
        />
      </div>
    </div>
  );
}
