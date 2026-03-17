"use client";

import { cn } from "@/lib/utils";

export function GlanceItem({ icon: Icon, label, variant = "default" }: { icon: React.ElementType; label: string; variant?: "default" | "green" }) {
  return (
    <div className={cn(
      "flex items-center gap-2.5 rounded-lg px-3 py-2.5",
      variant === "green" ? "bg-green-50" : "bg-slate-50",
    )}>
      <Icon className={cn("h-4 w-4 shrink-0", variant === "green" ? "text-green-600" : "text-violet-500")} />
      <span className={cn("text-sm", variant === "green" ? "text-green-700" : "text-slate-700")}>{label}</span>
    </div>
  );
}
