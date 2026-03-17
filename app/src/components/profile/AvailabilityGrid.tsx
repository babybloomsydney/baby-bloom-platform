"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const SLOT_LABELS = ["Morning", "Midday", "Afternoon", "Evening"];
const TIME_SLOTS = ["Morning (6am-10am)", "Midday (10am-2pm)", "Afternoon (2pm-6pm)", "Evening (6pm-10pm)"] as const;
const SLOT_RANGES = [
  { start: 6, end: 10 },
  { start: 10, end: 14 },
  { start: 14, end: 18 },
  { start: 18, end: 22 },
];

function normaliseDaySlots(raw: unknown): boolean[] {
  if (!raw) return [false, false, false, false];
  if (Array.isArray(raw)) {
    return TIME_SLOTS.map((slot) => raw.includes(slot));
  }
  if (typeof raw === "object" && raw !== null && "available" in raw) {
    const obj = raw as { available?: boolean; start?: string | null; end?: string | null };
    if (!obj.available || !obj.start || !obj.end) return [false, false, false, false];
    const startHour = parseInt(obj.start.split(":")[0]);
    const endHour = parseInt(obj.end.split(":")[0]);
    return SLOT_RANGES.map((range) => startHour <= range.start && endHour >= range.end);
  }
  return [false, false, false, false];
}

export function AvailabilityGrid({ schedule, firstName }: { schedule: Record<string, unknown>; firstName: string }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="py-2 pr-3 text-left text-xs font-medium text-slate-400" />
            {SLOT_LABELS.map((label) => (
              <th key={label} className="px-1.5 py-2 text-center text-xs font-medium text-slate-400">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => {
            const rawEntry = schedule[day.toLowerCase()];
            const slots = normaliseDaySlots(rawEntry);
            return (
              <tr key={day}>
                <td className="py-1.5 pr-3 font-medium text-slate-600 text-sm whitespace-nowrap">{day.slice(0, 3)}</td>
                {SLOT_LABELS.map((_, i) => (
                  <td key={i} className="px-1.5 py-1.5 text-center">
                    <span className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors",
                      slots[i]
                        ? "bg-violet-500 text-white"
                        : "bg-slate-50 text-slate-200"
                    )}>
                      {slots[i] ? <Check className="h-3.5 w-3.5" /> : "–"}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
