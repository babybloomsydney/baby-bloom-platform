"use client";

import { cn } from "@/lib/utils";

export function Tag({ children, variant = "default" }: { children: React.ReactNode; variant?: "violet" | "blue" | "green" | "default" }) {
  const styles = {
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    blue: "bg-sky-50 border-sky-200 text-sky-700",
    green: "bg-green-50 border-green-200 text-green-700",
    default: "bg-slate-50 border-slate-200 text-slate-600",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", styles[variant])}>
      {children}
    </span>
  );
}
