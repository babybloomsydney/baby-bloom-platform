"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SuburbAutocomplete } from "./SuburbAutocomplete";
import { saveTypeformPosition } from "@/lib/actions/parent";
import {
  TypeformFormData,
  MIN_AGE_OPTIONS,
  EXPERIENCE_OPTIONS,
  LANGUAGE_OPTIONS,
  REASON_OPTIONS,
  HOURS_OPTIONS,
  DAY_OPTIONS,
  DAY_SHORT,
  TIME_BLOCK_OPTIONS,
  DAY_ROSTER_FIELD,
  PLACEMENT_DURATION_OPTIONS,
  AGE_OPTIONS,
  GENDER_OPTIONS,
  SelectOption,
} from "../questions";

const AGE_KEYS: (keyof TypeformFormData)[] = [
  "child_a_age",
  "child_b_age",
  "child_c_age",
];
const GENDER_KEYS: (keyof TypeformFormData)[] = [
  "child_a_gender",
  "child_b_gender",
  "child_c_gender",
];

const TABS = [
  { id: "children", label: "Children" },
  { id: "nanny", label: "Nanny" },
  { id: "logistics", label: "Logistics" },
  { id: "schedule", label: "Schedule" },
  { id: "notes", label: "Notes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface PositionDetailViewProps {
  initialData: Partial<TypeformFormData>;
  onClosePosition?: () => void;
  onSave?: (
    data: Partial<TypeformFormData>,
  ) => Promise<{ success: boolean; error: string | null }>;
  hideClosePosition?: boolean;
  /** When provided, controls editing externally (hides internal Edit button) */
  editingExternal?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Optional slot rendered inline to the right of the tab bar */
  menuSlot?: React.ReactNode;
  /**
   * Compact mode — slightly smaller padding + tighter type. Used by
   * Katie's chat tile so the position card fits the chat density.
   * Applied universally (per WU 8.18b spec — main page can opt in too).
   */
  compact?: boolean;
}

export function PositionDetailView({
  initialData,
  onClosePosition,
  onSave,
  hideClosePosition,
  editingExternal,
  onEditingChange,
  menuSlot,
  compact = false,
}: PositionDetailViewProps) {
  const [data, setData] = useState<Partial<TypeformFormData>>(initialData);
  const [activeTab, setActiveTab] = useState<TabId>("children");
  const [isEditingInternal, setIsEditingInternal] = useState(false);
  const isEditing =
    editingExternal !== undefined ? editingExternal : isEditingInternal;
  const [editingField, setEditingField] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  const onUpdate = (d: Partial<TypeformFormData>) => {
    setData((prev) => ({ ...prev, ...d }));
    setIsDirty(true);
  };

  const toggleEdit = () => {
    if (onEditingChange) {
      onEditingChange(!isEditing);
    } else {
      setIsEditingInternal((p) => !p);
    }
    setEditingField(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    const result = onSave
      ? await onSave(data)
      : await saveTypeformPosition(data);
    setIsSaving(false);
    if (result.success) {
      setIsDirty(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } else {
      setSaveError(result.error);
    }
  };

  const openField = (f: string) =>
    setEditingField(editingField === f ? null : f);
  const closeField = () => setEditingField(null);

  /* ── Inline helpers ── */

  const Pencil = ({ field }: { field: string }) =>
    isEditing ? (
      <button
        type="button"
        onClick={() => openField(field)}
        className={`shrink-0 p-1 rounded transition-colors ${
          editingField === field
            ? "text-violet-600"
            : "text-slate-300 hover:text-slate-500"
        }`}
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      </button>
    ) : null;

  const Opts = ({
    options,
    value,
    onSelect,
    cols = 2,
  }: {
    options: SelectOption[];
    value: string | null;
    onSelect: (v: string) => void;
    cols?: number;
  }) => {
    const colClass =
      cols === 3 ? "grid-cols-3" : cols === 4 ? "grid-cols-4" : "grid-cols-2";
    return (
      <div className={`grid ${colClass} gap-1.5`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium text-center transition-colors ${
              value === o.value
                ? "bg-violet-500 text-white border-violet-500"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  };

  const DoneBtn = () => (
    <button
      type="button"
      onClick={closeField}
      className="mt-2 px-4 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors"
    >
      Done
    </button>
  );

  const optLabel = (
    options: SelectOption[],
    val: string | null | undefined,
  ) => {
    if (!val) return "—";
    return options.find((o) => o.value === val)?.label ?? val;
  };

  /* ── Row ── */

  const Row = ({
    id,
    label,
    display,
    editor,
  }: {
    id: string;
    label: string;
    display: React.ReactNode;
    editor?: React.ReactNode;
  }) => (
    <div className="flex items-start gap-2 py-3 border-b border-slate-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-400 mb-0.5">{label}</p>
        {editingField === id && editor ? (
          <div className="mt-1">{editor}</div>
        ) : (
          <div className="text-sm text-slate-800">{display ?? "—"}</div>
        )}
      </div>
      <Pencil field={id} />
    </div>
  );

  /* ── Data ── */

  const numChildren = data.num_children ?? 0;
  const weeklyRoster = data.weekly_roster ?? [];

  /* ── Schedule ── */

  const isEditingSchedule = editingField === "schedule";

  const toggleScheduleCell = (day: string, blockKey: string) => {
    const fieldKey = DAY_ROSTER_FIELD[day];
    const current = (data[fieldKey] as string[] | undefined) ?? [];
    const dayInRoster = weeklyRoster.includes(day);

    if (!dayInRoster) {
      onUpdate({
        weekly_roster: [...weeklyRoster, day],
        [fieldKey]: [blockKey],
      });
    } else {
      const updated = current.includes(blockKey)
        ? current.filter((b) => b !== blockKey)
        : [...current, blockKey];
      if (updated.length === 0) {
        onUpdate({
          weekly_roster: weeklyRoster.filter((d) => d !== day),
          [fieldKey]: [],
        });
      } else {
        onUpdate({ [fieldKey]: updated });
      }
    }
  };

  /* ── Render ── */

  return (
    <div className={cn("pb-0", compact && "text-sm leading-snug")}>
      {/* Edit toggle — hidden when controlled externally */}
      {editingExternal === undefined && (
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={toggleEdit}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              isEditing
                ? "bg-violet-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {isEditing ? "Done" : "Edit"}
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className={cn("flex items-center gap-2", compact ? "mb-3" : "mb-4")}>
        <div className="flex flex-1 gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setEditingField(null);
              }}
              className={cn(
                "flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                activeTab === tab.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-600",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {menuSlot}
      </div>

      {/* ── Children tab ── */}
      {activeTab === "children" && (
        <Card>
          <Row
            id="children"
            label="Children in care"
            display={
              numChildren > 0 ? (
                <div className="flex flex-col gap-1">
                  {Array.from({ length: numChildren }).map((_, i) => (
                    <span key={i}>
                      {(data[AGE_KEYS[i]] as string) ?? "—"}{" "}
                      <span className="text-slate-300">&middot;</span>{" "}
                      {(data[GENDER_KEYS[i]] as string) ?? "—"}
                    </span>
                  ))}
                </div>
              ) : (
                "—"
              )
            }
            editor={
              <div className="flex flex-col gap-3">
                <Opts
                  options={["1", "2", "3"].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                  value={numChildren ? String(numChildren) : null}
                  onSelect={(v) => onUpdate({ num_children: parseInt(v) })}
                  cols={3}
                />
                {Array.from({ length: data.num_children ?? 0 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex flex-col gap-2"
                  >
                    <p className="text-xs font-semibold text-slate-600">
                      Child {i + 1}
                    </p>
                    <select
                      value={(data[AGE_KEYS[i]] as string) ?? ""}
                      onChange={(e) =>
                        onUpdate({ [AGE_KEYS[i]]: e.target.value || null })
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none"
                    >
                      <option value="">Age range</option>
                      {AGE_OPTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-3 gap-1">
                      {GENDER_OPTIONS.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => onUpdate({ [GENDER_KEYS[i]]: g })}
                          className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                            (data[GENDER_KEYS[i]] as string) === g
                              ? "bg-violet-500 text-white border-violet-500"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <DoneBtn />
              </div>
            }
          />
          <Row
            id="child_needs"
            label="Developmental conditions"
            display={
              data.child_needs_yn === "Yes" ? (
                <span>Yes — {data.child_needs_details || "not specified"}</span>
              ) : (
                (data.child_needs_yn ?? "—")
              )
            }
            editor={
              <div className="flex flex-col gap-2">
                <Opts
                  options={[
                    { value: "No", label: "No" },
                    { value: "Yes", label: "Yes" },
                    { value: "Rather Not Say", label: "Rather Not Say" },
                  ]}
                  value={data.child_needs_yn ?? null}
                  onSelect={(v) => {
                    onUpdate({ child_needs_yn: v });
                    if (v !== "Yes") {
                      onUpdate({ child_needs_details: null });
                      closeField();
                    }
                  }}
                  cols={3}
                />
                {data.child_needs_yn === "Yes" && (
                  <>
                    <textarea
                      value={data.child_needs_details ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          child_needs_details: e.target.value || null,
                        })
                      }
                      placeholder="Describe any developmental conditions..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 min-h-[60px] resize-y outline-none focus:border-violet-500"
                    />
                    <DoneBtn />
                  </>
                )}
              </div>
            }
          />
          <Row
            id="dietary_restrictions"
            label="Dietary restrictions"
            display={
              data.dietary_restrictions_yn === "Yes" ? (
                <span>
                  Yes — {data.dietary_restrictions_details || "not specified"}
                </span>
              ) : (
                (data.dietary_restrictions_yn ?? "No")
              )
            }
            editor={
              <div className="flex flex-col gap-2">
                <Opts
                  options={[
                    { value: "No", label: "No" },
                    { value: "Yes", label: "Yes" },
                  ]}
                  value={data.dietary_restrictions_yn ?? "No"}
                  onSelect={(v) => {
                    onUpdate({ dietary_restrictions_yn: v });
                    if (v !== "Yes") {
                      onUpdate({ dietary_restrictions_details: null });
                      closeField();
                    }
                  }}
                />
                {data.dietary_restrictions_yn === "Yes" && (
                  <>
                    <textarea
                      value={data.dietary_restrictions_details ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          dietary_restrictions_details: e.target.value || null,
                        })
                      }
                      placeholder="e.g. nut allergy, gluten-free, dairy-free, vegetarian..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 min-h-[60px] resize-y outline-none focus:border-violet-500"
                    />
                    <DoneBtn />
                  </>
                )}
              </div>
            }
          />
        </Card>
      )}

      {/* ── Nanny tab ── */}
      {activeTab === "nanny" && (
        <Card>
          <Row
            id="minimum_age"
            label="Minimum age"
            display={optLabel(MIN_AGE_OPTIONS, data.minimum_age)}
            editor={
              <Opts
                options={MIN_AGE_OPTIONS}
                value={data.minimum_age ?? null}
                onSelect={(v) => {
                  onUpdate({ minimum_age: v });
                  closeField();
                }}
                cols={3}
              />
            }
          />
          <Row
            id="experience"
            label="Experience"
            display={
              data.years_of_experience
                ? `${optLabel(EXPERIENCE_OPTIONS, data.years_of_experience)} years`
                : "—"
            }
            editor={
              <Opts
                options={EXPERIENCE_OPTIONS}
                value={data.years_of_experience ?? null}
                onSelect={(v) => {
                  onUpdate({ years_of_experience: v });
                  closeField();
                }}
                cols={4}
              />
            }
          />
          <Row
            id="language"
            label="Language"
            display={
              data.language_preference
                ? data.language_preference_details
                  ? `${data.language_preference} — ${data.language_preference_details}`
                  : data.language_preference
                : "—"
            }
            editor={
              <div className="flex flex-col gap-2">
                <Opts
                  options={LANGUAGE_OPTIONS.map((v) => ({
                    value: v,
                    label: v,
                  }))}
                  value={data.language_preference ?? null}
                  onSelect={(v) => {
                    onUpdate({ language_preference: v });
                    if (v === "English") {
                      onUpdate({ language_preference_details: null });
                      closeField();
                    }
                  }}
                  cols={3}
                />
                {(data.language_preference === "Foreign language" ||
                  data.language_preference === "Multiple") && (
                  <>
                    <input
                      type="text"
                      value={data.language_preference_details ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          language_preference_details: e.target.value || null,
                        })
                      }
                      placeholder="e.g. Mandarin, Spanish"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-violet-500"
                    />
                    <DoneBtn />
                  </>
                )}
              </div>
            }
          />
          <Row
            id="drivers_license"
            label="Driver's licence"
            display={
              data.drivers_license_required === "Yes"
                ? "Required"
                : data.drivers_license_required === "No"
                  ? "Not essential"
                  : "—"
            }
            editor={
              <Opts
                options={[
                  { value: "Yes", label: "Required" },
                  { value: "No", label: "Not essential" },
                ]}
                value={data.drivers_license_required ?? null}
                onSelect={(v) => {
                  onUpdate({ drivers_license_required: v });
                  if (v === "No") onUpdate({ car_required: "No" });
                  closeField();
                }}
              />
            }
          />
          {data.drivers_license_required !== "No" && (
            <Row
              id="car"
              label="Own car"
              display={
                data.car_required === "Yes"
                  ? "Required"
                  : data.car_required === "No"
                    ? "Not essential"
                    : "—"
              }
              editor={
                <Opts
                  options={[
                    { value: "Yes", label: "Required" },
                    { value: "No", label: "Not essential" },
                  ]}
                  value={data.car_required ?? null}
                  onSelect={(v) => {
                    onUpdate({ car_required: v });
                    closeField();
                  }}
                />
              }
            />
          )}
          <Row
            id="vaccination"
            label="Vaccination"
            display={
              data.vaccination_required === "Yes"
                ? "Required"
                : data.vaccination_required === "No"
                  ? "Not essential"
                  : "—"
            }
            editor={
              <Opts
                options={[
                  { value: "Yes", label: "Required" },
                  { value: "No", label: "Not essential" },
                ]}
                value={data.vaccination_required ?? null}
                onSelect={(v) => {
                  onUpdate({ vaccination_required: v });
                  closeField();
                }}
              />
            }
          />
          <Row
            id="non_smoker"
            label="Non-smoker"
            display={
              data.non_smoker_required === "Yes"
                ? "Required"
                : data.non_smoker_required === "No"
                  ? "Not a concern"
                  : "—"
            }
            editor={
              <Opts
                options={[
                  { value: "Yes", label: "Required" },
                  { value: "No", label: "Not a concern" },
                ]}
                value={data.non_smoker_required ?? null}
                onSelect={(v) => {
                  onUpdate({ non_smoker_required: v });
                  closeField();
                }}
              />
            }
          />
          <Row
            id="reason"
            label="Main responsibility"
            display={data.reason_for_nanny ?? "—"}
            editor={
              <Opts
                options={REASON_OPTIONS.map((v) => ({ value: v, label: v }))}
                value={data.reason_for_nanny ?? null}
                onSelect={(v) => {
                  onUpdate({ reason_for_nanny: v });
                  closeField();
                }}
              />
            }
          />
          <Row
            id="focus_type"
            label="Focus"
            display={data.focus_type ?? "—"}
            editor={
              <Opts
                options={[
                  { value: "Educational play", label: "Educational play" },
                  { value: "Just supervision", label: "Just supervision" },
                ]}
                value={data.focus_type ?? null}
                onSelect={(v) => {
                  onUpdate({ focus_type: v });
                  closeField();
                }}
              />
            }
          />
          <Row
            id="support_type"
            label="Support"
            display={data.support_type ?? "—"}
            editor={
              <Opts
                options={[
                  {
                    value: "Tailored developmental support",
                    label: "Tailored developmental",
                  },
                  {
                    value: "Just standard routines",
                    label: "Just standard routines",
                  },
                ]}
                value={data.support_type ?? null}
                onSelect={(v) => {
                  onUpdate({ support_type: v });
                  closeField();
                }}
              />
            }
          />
        </Card>
      )}

      {/* ── Logistics tab ── */}
      {activeTab === "logistics" && (
        <Card>
          <Row
            id="suburb"
            label="Location"
            display={
              data.suburb ? `${data.suburb}, ${data.postcode ?? ""}` : "—"
            }
            editor={
              <SuburbAutocomplete
                data={data}
                updateData={onUpdate}
                onAdvance={closeField}
              />
            }
          />
          <Row
            id="pets"
            label="Pets at home"
            display={
              data.has_pets === "Yes" ? (
                <span>Yes — {data.has_pets_details || "not specified"}</span>
              ) : (
                (data.has_pets ?? "—")
              )
            }
            editor={
              <div className="flex flex-col gap-2">
                <Opts
                  options={[
                    { value: "Yes", label: "Yes" },
                    { value: "No", label: "No" },
                  ]}
                  value={data.has_pets ?? null}
                  onSelect={(v) => {
                    onUpdate({ has_pets: v });
                    if (v !== "Yes") {
                      onUpdate({ has_pets_details: null });
                      closeField();
                    }
                  }}
                />
                {data.has_pets === "Yes" && (
                  <>
                    <textarea
                      value={data.has_pets_details ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          has_pets_details: e.target.value || null,
                        })
                      }
                      placeholder="Tell us about your pets..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 min-h-[60px] resize-y outline-none focus:border-violet-500"
                    />
                    <DoneBtn />
                  </>
                )}
              </div>
            }
          />
          <Row
            id="hours"
            label="Hours per week"
            display={data.hours_per_week ?? "—"}
            editor={
              <Opts
                options={HOURS_OPTIONS.map((v) => ({ value: v, label: v }))}
                value={data.hours_per_week ?? null}
                onSelect={(v) => {
                  onUpdate({ hours_per_week: v });
                  closeField();
                }}
                cols={3}
              />
            }
          />
          <Row
            id="schedule_type"
            label="Arrangement"
            display={data.schedule_type ?? "—"}
            editor={
              <Opts
                options={[
                  { value: "Fixed", label: "Fixed" },
                  { value: "Flexible", label: "Flexible" },
                ]}
                value={data.schedule_type ?? null}
                onSelect={(v) => {
                  onUpdate({ schedule_type: v });
                  closeField();
                }}
              />
            }
          />
          <Row
            id="placement_length"
            label="Duration"
            display={
              data.placement_length === "Temporarily"
                ? `Temporary — ${data.placement_duration ?? "not specified"}`
                : (data.placement_length ?? "—")
            }
            editor={
              <div className="flex flex-col gap-2">
                <Opts
                  options={[
                    { value: "Ongoing", label: "Ongoing" },
                    { value: "Temporarily", label: "Temporarily" },
                  ]}
                  value={data.placement_length ?? null}
                  onSelect={(v) => {
                    onUpdate({ placement_length: v });
                    if (v !== "Temporarily") {
                      onUpdate({ placement_duration: null });
                      closeField();
                    }
                  }}
                />
                {data.placement_length === "Temporarily" && (
                  <>
                    <p className="text-[11px] font-medium text-slate-500">
                      How long for?
                    </p>
                    <Opts
                      options={PLACEMENT_DURATION_OPTIONS.map((v) => ({
                        value: v,
                        label: v,
                      }))}
                      value={data.placement_duration ?? null}
                      onSelect={(v) => {
                        onUpdate({ placement_duration: v });
                        closeField();
                      }}
                    />
                  </>
                )}
              </div>
            }
          />
          <Row
            id="urgency"
            label="Start timing"
            display={
              data.urgency === "At a later date"
                ? `Later — ${data.start_date ?? "date not set"}`
                : (data.urgency ?? "—")
            }
            editor={
              <div className="flex flex-col gap-2">
                <Opts
                  options={[
                    { value: "As soon as possible", label: "ASAP" },
                    { value: "At a later date", label: "Later" },
                  ]}
                  value={data.urgency ?? null}
                  onSelect={(v) => {
                    onUpdate({ urgency: v });
                    if (v !== "At a later date") {
                      onUpdate({ start_date: null });
                      closeField();
                    }
                  }}
                />
                {data.urgency === "At a later date" && (
                  <>
                    <input
                      type="date"
                      min={new Date().toISOString().split("T")[0]}
                      value={data.start_date ?? ""}
                      onChange={(e) =>
                        onUpdate({ start_date: e.target.value || null })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-violet-500"
                    />
                    <DoneBtn />
                  </>
                )}
              </div>
            }
          />
        </Card>
      )}

      {/* ── Schedule tab ── */}
      {activeTab === "schedule" && (
        <Card>
          <div className="py-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="py-2 pr-3 text-left text-xs font-medium text-slate-500 uppercase" />
                      {TIME_BLOCK_OPTIONS.map((block) => (
                        <th
                          key={block.key}
                          className="px-2 py-2 text-center text-xs font-medium text-slate-500 uppercase"
                        >
                          {block.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAY_OPTIONS.map((day) => {
                      const fieldKey = DAY_ROSTER_FIELD[day];
                      const dayTimes =
                        (data[fieldKey] as string[] | undefined) ?? [];
                      const isAvailable = weeklyRoster.includes(day);

                      return (
                        <tr key={day} className="border-t border-slate-100">
                          <td className="py-2.5 pr-3 font-medium text-slate-700 text-sm whitespace-nowrap">
                            {DAY_SHORT[day]}
                          </td>
                          {TIME_BLOCK_OPTIONS.map((block) => {
                            const active =
                              isAvailable && dayTimes.includes(block.key);
                            return (
                              <td
                                key={block.key}
                                className="px-2 py-2.5 text-center"
                              >
                                {isEditingSchedule ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleScheduleCell(day, block.key)
                                    }
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors ${
                                      active
                                        ? "bg-violet-100 text-violet-600"
                                        : "bg-slate-50 text-slate-300 hover:bg-violet-50 hover:text-violet-400"
                                    }`}
                                  >
                                    {active ? "✓" : "–"}
                                  </button>
                                ) : (
                                  <span
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                                      active
                                        ? "bg-violet-100 text-violet-600"
                                        : "bg-slate-50 text-slate-300"
                                    }`}
                                  >
                                    {active ? "✓" : "–"}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {isEditingSchedule && <DoneBtn />}
              </div>
              <Pencil field="schedule" />
            </div>
          </div>
        </Card>
      )}

      {/* ── Notes tab ── */}
      {activeTab === "notes" && (
        <Card>
          <div className="py-4">
            <p className="text-[11px] font-medium text-slate-400 mb-2">
              Additional notes
            </p>
            <textarea
              value={data.notes ?? ""}
              onChange={(e) => onUpdate({ notes: e.target.value || null })}
              placeholder="Add any extra details about your childcare needs, household routines, or anything else you'd like a nanny to know..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 min-h-[160px] resize-y outline-none focus:border-violet-500"
            />
            <p className="mt-2 text-xs text-slate-400">
              Optional — this won&apos;t appear in matching but can help when
              communicating with nannies.
            </p>
          </div>
        </Card>
      )}

      {/* ── Save / Close ── */}
      <div className="mt-4 space-y-3">
        {isDirty && (
          <div className="flex flex-col gap-2">
            {saveError && (
              <p className="text-sm text-red-600 text-center">{saveError}</p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-2.5 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
        {showSaved && !isDirty && (
          <p className="text-sm text-green-600 text-center font-medium">
            Changes saved
          </p>
        )}
        {onClosePosition && !hideClosePosition && (
          <button
            type="button"
            onClick={onClosePosition}
            className="w-full text-center text-sm text-red-400 hover:text-red-600 transition-colors py-2"
          >
            Close this position
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Shared layout components ── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 px-4">
      {children}
    </div>
  );
}
