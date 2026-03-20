"use client";

import { cn } from "@/lib/utils";

export function Tag({ children, variant = "default" }: { children: React.ReactNode; variant?: "violet" | "blue" | "green" | "default" }) {
  const styles = {
    violet: "bg-violet-100 text-violet-700",
    blue: "bg-sky-100 text-sky-700",
    green: "bg-green-100 text-green-700",
    default: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={cn("inline-flex items-center rounded-lg px-2 py-1.5 text-[clamp(8px,2.5vw,12px)] font-medium whitespace-nowrap", styles[variant])}>
      {children}
    </span>
  );
}
