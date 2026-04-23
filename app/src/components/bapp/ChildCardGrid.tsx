"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Baby } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChildClient } from "@/types/bapp";
import { AddChildSheet } from "./AddChildSheet";
import { OnboardSheet } from "./OnboardSheet";

function calculateAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (months < 1) return "Newborn";
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) return `${years}yr`;
  return `${years}yr ${remainingMonths}mo`;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  created_auto: { label: "New", color: "bg-slate-100 text-slate-600" },
  created_manual: { label: "New", color: "bg-slate-100 text-slate-600" },
  setup: { label: "Ready", color: "bg-blue-50 text-blue-700" },
  active_nanny: { label: "Active", color: "bg-emerald-50 text-emerald-700" },
  trial: { label: "Trial", color: "bg-amber-50 text-amber-700" },
  trial_ended: { label: "Trial Ended", color: "bg-orange-50 text-orange-700" },
  active: { label: "Active", color: "bg-emerald-50 text-emerald-700" },
  closed: { label: "Closed", color: "bg-red-50 text-red-600" },
};

interface ChildCardGridProps {
  children: ChildClient[];
  role: "nanny" | "parent";
}

export function ChildCardGrid({ children, role }: ChildCardGridProps) {
  const router = useRouter();
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [onboardChild, setOnboardChild] = useState<ChildClient | null>(null);

  function handleCardClick(child: ChildClient) {
    if (!child.onboarded) {
      setOnboardChild(child);
    } else {
      router.push(`/${role}/development/${child.id}`);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {children.map((child, index) => {
          const badge = STATUS_BADGE[child.status] ?? STATUS_BADGE.created_auto;
          const isShell = !child.onboarded;

          return (
            <button
              key={child.id}
              onClick={() => handleCardClick(child)}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-emerald-200",
                isShell
                  ? "border-dashed border-slate-300"
                  : "border-slate-200"
              )}
            >
              {/* Avatar */}
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold",
                  isShell
                    ? "bg-slate-100 text-slate-400"
                    : "bg-emerald-50 text-emerald-600"
                )}
              >
                {isShell ? (
                  <Baby className="h-6 w-6" />
                ) : (
                  child.first_name?.[0]?.toUpperCase() ?? "?"
                )}
              </div>

              {/* Name + age */}
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-900">
                  {isShell
                    ? `Child ${index + 1}`
                    : child.first_name}
                </p>
                <p className="text-xs text-slate-500">
                  {child.date_of_birth
                    ? calculateAge(child.date_of_birth)
                    : child.age_months_approx
                      ? `~${child.age_months_approx}mo`
                      : ""}
                </p>
              </div>

              {/* Status badge or "Set up" prompt */}
              {isShell ? (
                <span className="text-xs font-medium text-emerald-600">
                  Set up
                </span>
              ) : (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    badge.color
                  )}
                >
                  {badge.label}
                </span>
              )}
            </button>
          );
        })}

        {/* Add New button — nanny only */}
        {role === "nanny" && (
          <button
            onClick={() => setAddSheetOpen(true)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-emerald-300 hover:bg-emerald-50/30"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
              <Plus className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-600">Add New</p>
          </button>
        )}
      </div>

      {/* Empty state */}
      {children.length === 0 && role === "parent" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Baby className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            No children added yet. Your nanny will set this up.
          </p>
        </div>
      )}

      {/* Sheets */}
      <AddChildSheet open={addSheetOpen} onOpenChange={setAddSheetOpen} />
      {onboardChild && (
        <OnboardSheet
          child={onboardChild}
          open={!!onboardChild}
          onOpenChange={(open) => {
            if (!open) setOnboardChild(null);
          }}
        />
      )}
    </>
  );
}
