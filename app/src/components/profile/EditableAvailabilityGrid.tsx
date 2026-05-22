"use client";

// Editable weekly availability grid. Same UX as the nanny-facing one in
// `app/nanny/profile/NannyMyProfile.tsx` (Mon-Sun rows × Morning/Midday/
// Afternoon/Evening cells), extracted as a shared component so admin
// surfaces can use it to update a nanny's availability on the nanny's
// behalf (e.g. while on a phone call).
//
// Controlled component — parent owns `value` + `onChange`.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const TIME_SLOTS = [
  "Morning (6am-10am)",
  "Midday (10am-2pm)",
  "Afternoon (2pm-6pm)",
  "Evening (6pm-10pm)",
] as const;
const SLOT_LABELS = ["Morning", "Midday", "Afternoon", "Evening"];

export interface AvailabilityFormValue {
  available_days: string[];
  schedule: Record<string, string[]>;
}

interface EditableAvailabilityGridProps {
  value: AvailabilityFormValue;
  onChange: (next: AvailabilityFormValue) => void;
  disabled?: boolean;
}

export function EditableAvailabilityGrid({
  value,
  onChange,
  disabled = false,
}: EditableAvailabilityGridProps) {
  const toggleCell = (day: string, slotIndex: number) => {
    if (disabled) return;
    const dayKey = day.toLowerCase();
    const slot = TIME_SLOTS[slotIndex];
    const currentSlots = value.schedule[dayKey] || [];
    const isActive =
      value.available_days.includes(day) && currentSlots.includes(slot);

    if (isActive) {
      const newSlots = currentSlots.filter((s) => s !== slot);
      const newSchedule = { ...value.schedule, [dayKey]: newSlots };
      if (newSlots.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [dayKey]: _removed, ...rest } = newSchedule;
        onChange({
          available_days: value.available_days.filter((d) => d !== day),
          schedule: rest,
        });
      } else {
        onChange({ ...value, schedule: newSchedule });
      }
    } else {
      const newDays = value.available_days.includes(day)
        ? value.available_days
        : [...value.available_days, day];
      onChange({
        available_days: newDays,
        schedule: {
          ...value.schedule,
          [dayKey]: [...currentSlots, slot],
        },
      });
    }
  };

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="py-2 pr-3 text-left text-xs font-medium text-slate-400" />
            {SLOT_LABELS.map((label) => (
              <th
                key={label}
                className="px-1.5 py-2 text-center text-xs font-medium text-slate-400"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => {
            const dayKey = day.toLowerCase();
            const currentSlots = value.schedule[dayKey] || [];
            const isDayAvailable = value.available_days.includes(day);
            return (
              <tr key={day}>
                <td className="py-1.5 pr-3 font-medium text-slate-600 text-sm whitespace-nowrap">
                  {day.slice(0, 3)}
                </td>
                {TIME_SLOTS.map((slot, i) => {
                  const active = isDayAvailable && currentSlots.includes(slot);
                  return (
                    <td key={i} className="px-1.5 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleCell(day, i)}
                        disabled={disabled}
                        aria-pressed={active}
                        aria-label={`${day} ${SLOT_LABELS[i]} ${active ? "available" : "not available"} — click to toggle`}
                        className={cn(
                          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-all",
                          active
                            ? "bg-violet-500 text-white shadow-sm hover:bg-violet-600"
                            : "bg-slate-50 text-slate-300 hover:bg-violet-100 hover:text-violet-500",
                          disabled && "opacity-50 cursor-not-allowed",
                        )}
                      >
                        {active ? <Check className="h-3.5 w-3.5" /> : "–"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
