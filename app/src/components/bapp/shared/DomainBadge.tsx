"use client";

import { DOMAINS, type DomainCode } from "@/lib/bapp-constants";
import { cn } from "@/lib/utils";

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  pink: "bg-pink-100 text-pink-700",
  green: "bg-green-100 text-green-700",
  purple: "bg-purple-100 text-purple-700",
  orange: "bg-orange-100 text-orange-700",
  teal: "bg-teal-100 text-teal-700",
  amber: "bg-amber-100 text-amber-700",
};

interface DomainBadgeProps {
  domain: string;
  className?: string;
}

export function DomainBadge({ domain, className }: DomainBadgeProps) {
  // Handle "General" domain
  if (domain === "General") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600",
          className
        )}
      >
        General
      </span>
    );
  }

  // Handle comma-separated domains (focused observations)
  if (domain.includes(",")) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {domain.split(",").map((d) => (
          <DomainBadge key={d.trim()} domain={d.trim()} className={className} />
        ))}
      </span>
    );
  }

  const domainInfo = DOMAINS[domain as DomainCode];
  if (!domainInfo) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600",
          className
        )}
      >
        {domain}
      </span>
    );
  }

  const colors = COLOR_MAP[domainInfo.color] ?? "bg-slate-100 text-slate-600";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colors,
        className
      )}
    >
      {domainInfo.short}
    </span>
  );
}
