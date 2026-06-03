"use client";

import { useState } from "react";

/**
 * Auto-ticked consent checkbox. Untick to refuse — the host form
 * disables submit when `consented === false`.
 *
 * Bailey 2026-05-14 UX pattern: opt-out checkbox. Pre-ticked because
 * 99% of users accept; the few who refuse explicitly untick. Submit
 * button is enabled iff the box is ticked AND any other form-level
 * validity holds.
 *
 * The host passes `onConsentChange(consented)` so it can flip its
 * own submit-enabled state. Component is otherwise self-contained.
 */
export interface ConsentCheckboxProps {
  /** Short label shown next to the checkbox. */
  label: string;
  /** Optional secondary line below the label (e.g. "Annual renewal applies"). */
  description?: string;
  /** Called whenever the user toggles. Initial value is the
   *  defaultConsented value (defaults to true). */
  onConsentChange?: (consented: boolean) => void;
  /** Override the initial tick state. Defaults to true (auto-ticked). */
  defaultConsented?: boolean;
  /** When provided, used as the hidden input name so the form
   *  submission carries the consent state to the server action. */
  fieldName?: string;
  /** Disabled when the host wants to lock the choice (e.g. during
   *  submission). */
  disabled?: boolean;
}

export function ConsentCheckbox({
  label,
  description,
  onConsentChange,
  defaultConsented = true,
  fieldName,
  disabled = false,
}: ConsentCheckboxProps) {
  const [consented, setConsented] = useState<boolean>(defaultConsented);

  const handleChange = (next: boolean): void => {
    setConsented(next);
    onConsentChange?.(next);
  };

  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors ${
        consented
          ? "border-violet-300 bg-violet-50/50"
          : "border-amber-300 bg-amber-50"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        checked={consented}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
      />
      {fieldName && (
        <input
          type="hidden"
          name={fieldName}
          value={consented ? "true" : "false"}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-slate-600">{description}</p>
        )}
        {!consented && (
          <p className="mt-2 text-xs font-medium text-amber-700" role="status">
            You need to tick this to continue.
          </p>
        )}
      </div>
    </label>
  );
}
