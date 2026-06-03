"use client";

import { useCallback, useState } from "react";
import { StageProps } from "../../FunnelOrchestrator";
import { SingleSelectTags } from "../../shared/SingleSelectTags";
import { YesNoTags } from "../../shared/YesNoTags";
import { AutoAdvance } from "../../shared/AutoAdvance";
import { ProgressiveReveal } from "../../shared/ProgressiveReveal";
import { CompoundPageShell } from "../../shared/CompoundPageShell";
import { CHILDCARE_ROLE_OPTIONS, ChildcareRole } from "@/types/nanny-leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

interface N1ExperienceProps extends StageProps {
  subPage: string;
}

export function N1Experience({
  state,
  dispatch,
  goNext,
  goBack,
  subPage,
  progress,
  questionNumber,
}: N1ExperienceProps) {
  const { experience } = state;

  const update = useCallback(
    (payload: Partial<typeof experience>) => {
      dispatch({ type: "UPDATE_EXPERIENCE", payload });
    },
    [dispatch],
  );

  // Slider touched state (persists if value already set from previous visit)
  const [expTouched, setExpTouched] = useState(
    experience.total_experience !== null,
  );

  // Page 5: Experience Depth (compound page, progressive reveal)
  if (subPage === "n1-experience") {
    // 18+ age check
    const isUnder18 = (() => {
      if (!experience.date_of_birth) return false;
      const dob = new Date(experience.date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      return age < 18;
    })();

    // Outlier DOB guard — catches typos / incidental date entries
    // (e.g. someone fat-fingering the year and ending up as age ~208).
    // Not mentioned anywhere in the UI unless triggered; data-hygiene
    // only, not a published policy.
    const isOver80 = (() => {
      if (!experience.date_of_birth) return false;
      const dob = new Date(experience.date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      return age > 80;
    })();

    const isTenPlus = experience.total_experience === "10+";
    const totalExp = experience.total_experience
      ? isTenPlus
        ? 10
        : parseInt(experience.total_experience) || 0
      : 0;
    const expSliderValue = experience.total_experience !== null ? totalExp : 1;
    const under3Max = totalExp;
    const newbornMax = experience.under_3_experience || under3Max;

    const formatExp = (val: number, max: number) =>
      isTenPlus && val >= max ? "10+" : String(val);

    const under3No = experience.under_3_experience_yn === false;
    const newbornNo = experience.newborn_experience_yn === false;

    const hasEnoughExp = experience.total_experience !== null && totalExp >= 1;

    // T-023 — The external U3 position question appears immediately under
    // the "years with U3" slider (Bailey 2026-05-18 amendment 2). It shows
    // once the user has set a non-zero U3 experience year value, and its
    // answer is required before the newborn yn block reveals beneath it.
    const externalU3Required =
      experience.under_3_experience_yn === true &&
      experience.under_3_experience !== null &&
      experience.under_3_experience > 0;

    // Newborn flow only reveals once the T-023 answer is in.
    const externalU3Answered = state.lead_signals.external_u3_position !== null;

    const canContinue =
      experience.date_of_birth !== null &&
      !isUnder18 &&
      !isOver80 &&
      hasEnoughExp &&
      experience.under_3_experience_yn !== null &&
      (experience.under_3_experience_yn === false ||
        experience.under_3_experience !== null) &&
      (!externalU3Required || externalU3Answered) &&
      (experience.under_3_experience_yn === false ||
        experience.under_3_experience === 0 ||
        (experience.newborn_experience_yn !== null &&
          (experience.newborn_experience_yn === false ||
            experience.newborn_experience !== null)));

    return (
      <CompoundPageShell
        title="Your Experience"
        progress={progress}
        showBack={true}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <div className="flex flex-col gap-5">
          {/* Date of birth */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-slate-700">
              When were you born?
            </Label>
            <Input
              type="date"
              value={experience.date_of_birth || ""}
              onChange={(e) => {
                const val = e.target.value || null;
                if (val !== experience.date_of_birth) {
                  setExpTouched(false);
                  update({
                    date_of_birth: val,
                    total_experience: null,
                    under_3_experience_yn: null,
                    under_3_experience: null,
                    newborn_experience_yn: null,
                    newborn_experience: null,
                  });
                }
              }}
              className="h-11 border-slate-200 focus:border-violet-500 focus:ring-violet-500"
            />
          </div>

          {/* Under 18 warning */}
          {isUnder18 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-amber-800">
                  You must be 18 or older to apply
                </p>
                <p className="text-sm text-amber-700">
                  Baby Bloom requires all childcare professionals to be at least
                  18 years of age. Please come back when you&apos;re eligible —
                  we&apos;d love to have you!
                </p>
              </div>
            </div>
          )}

          {/* Outlier DOB warning — soft nudge to re-check, not an age-cap
              policy. Only shown when the entered DOB lands the user past 80. */}
          {isOver80 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-amber-800">
                  That doesn&apos;t look right
                </p>
                <p className="text-sm text-amber-700">
                  Please double-check your date of birth.
                </p>
              </div>
            </div>
          )}

          {/* Total experience — slider 0-10+ */}
          <ProgressiveReveal
            show={
              experience.date_of_birth !== null && !isUnder18 && !isOver80
            }
          >
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-sm font-medium text-slate-700">
                How many years have you been working with children?
              </Label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={expSliderValue}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setExpTouched(true);
                    update({
                      total_experience: val >= 10 ? "10+" : String(val),
                      under_3_experience_yn: null,
                      under_3_experience: null,
                      newborn_experience_yn: null,
                      newborn_experience: null,
                    });
                  }}
                  className="flex-1 accent-violet-600"
                />
                <span className="text-sm font-semibold text-violet-600 w-16 text-center">
                  {expSliderValue >= 10 ? "10+" : expSliderValue}{" "}
                  {expSliderValue === 1 ? "year" : "years"}
                </span>
              </div>
            </div>
          </ProgressiveReveal>

          {/* 0 experience warning */}
          {expTouched && totalExp === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-amber-800">
                  We&apos;re unable to assist at this time
                </p>
                <p className="text-sm text-amber-700">
                  Unfortunately, we require all of our childcare professionals
                  to have at least 1 year of experience working with children.
                  We&apos;d love to welcome you back once you&apos;ve gained a
                  bit more experience!
                </p>
              </div>
            </div>
          )}

          {/* Under 3 experience yes/no */}
          <ProgressiveReveal show={hasEnoughExp}>
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-sm font-medium text-slate-700">
                Do you also have experience working with children under 3 years
                old?
              </Label>
              <YesNoTags
                selected={experience.under_3_experience_yn}
                onChange={(val) => {
                  update({
                    under_3_experience_yn: val,
                    under_3_experience: null,
                    newborn_experience_yn: null,
                    newborn_experience: null,
                  });
                }}
              />
            </div>
          </ProgressiveReveal>

          {/* Under 3 experience slider */}
          <ProgressiveReveal show={experience.under_3_experience_yn === true}>
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-sm font-medium text-slate-700">
                How much of your experience is with children under 3?
              </Label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={under3Max}
                  value={experience.under_3_experience || 0}
                  onChange={(e) => {
                    update({
                      under_3_experience: parseInt(e.target.value),
                      newborn_experience_yn: null,
                      newborn_experience: null,
                    });
                  }}
                  className="flex-1 accent-violet-600"
                />
                <span className="text-sm font-semibold text-violet-600 w-16 text-center">
                  {formatExp(experience.under_3_experience || 0, under3Max)}{" "}
                  {(experience.under_3_experience || 0) === 1
                    ? "year"
                    : "years"}
                </span>
              </div>
            </div>
          </ProgressiveReveal>

          {/* T-023 — current employment qualifier (backend-only signal for
              hot-lead scoring; not in AI bio, not in matching, not parent-
              facing). Reveals immediately under the U3 years slider, then
              gates the newborn flow below (Bailey 2026-05-18 amendment 2). */}
          <ProgressiveReveal show={externalU3Required}>
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-sm font-medium text-slate-700">
                Are you currently a nanny for any children under 3?
              </Label>
              <YesNoTags
                selected={state.lead_signals.external_u3_position}
                onChange={(val) =>
                  dispatch({
                    type: "UPDATE_LEAD_SIGNALS",
                    payload: { external_u3_position: val },
                  })
                }
              />
            </div>
          </ProgressiveReveal>

          {/* Newborn experience yes/no — waits for T-023 to be answered. */}
          <ProgressiveReveal
            show={
              experience.under_3_experience !== null &&
              experience.under_3_experience > 0 &&
              experience.under_3_experience_yn === true &&
              externalU3Answered
            }
          >
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-sm font-medium text-slate-700">
                What about with newborns?
              </Label>
              <YesNoTags
                selected={experience.newborn_experience_yn}
                onChange={(val) => {
                  update({
                    newborn_experience_yn: val,
                    newborn_experience: null,
                  });
                }}
              />
            </div>
          </ProgressiveReveal>

          {/* Newborn experience slider */}
          <ProgressiveReveal show={experience.newborn_experience_yn === true}>
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-sm font-medium text-slate-700">
                How many years experience do you have with newborns?
              </Label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={newbornMax}
                  value={experience.newborn_experience || 0}
                  onChange={(e) =>
                    update({ newborn_experience: parseInt(e.target.value) })
                  }
                  className="flex-1 accent-violet-600"
                />
                <span className="text-sm font-semibold text-violet-600 w-16 text-center">
                  {formatExp(experience.newborn_experience || 0, newbornMax)}{" "}
                  {(experience.newborn_experience || 0) === 1
                    ? "year"
                    : "years"}
                </span>
              </div>
            </div>
          </ProgressiveReveal>

          <AutoAdvance
            shouldAdvance={under3No}
            onAdvance={goNext}
            delay={400}
          />
          {/* T-023 — gate this AutoAdvance on the external U3 answer.
              Without the gate, the page auto-advances when the user
              picks newborn-No before they've answered the new
              question that just revealed alongside it. */}
          <AutoAdvance
            shouldAdvance={
              newbornNo &&
              experience.under_3_experience !== null &&
              experience.under_3_experience > 0 &&
              state.lead_signals.external_u3_position !== null
            }
            onAdvance={goNext}
            delay={400}
          />

          {canContinue && (
            <div className="fixed bottom-0 left-0 right-0 z-20 pt-3 pb-[66px] bg-gradient-to-t from-white from-70% to-transparent">
              <div className="max-w-md mx-auto px-4">
                <Button
                  onClick={goNext}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white h-11 px-6 rounded-lg font-medium text-sm"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}
        </div>
      </CompoundPageShell>
    );
  }

  // Page 6: Childcare Roles (multi-row builder)
  if (subPage === "n1-roles") {
    const roles = experience.childcare_roles || [];
    const noExp = experience.no_childcare_experience;

    const addRole = () => {
      update({
        childcare_roles: [...roles, { role: "", duration: 0 }],
        no_childcare_experience: false,
      });
    };

    const updateRole = (
      index: number,
      field: keyof ChildcareRole,
      value: string | number,
    ) => {
      const updated = [...roles];
      updated[index] = { ...updated[index], [field]: value };
      update({ childcare_roles: updated });
    };

    const removeRole = (index: number) => {
      update({ childcare_roles: roles.filter((_, i) => i !== index) });
    };

    const canContinue =
      !noExp &&
      roles.length > 0 &&
      roles.every(
        (r) =>
          r.role !== "" &&
          r.duration >= 1 &&
          (r.role !== "Other" ||
            (r.role_other && r.role_other.trim().length > 0)),
      );

    return (
      <CompoundPageShell
        title="What childcare experience do you have?"
        subtitle="Add your childcare roles and experience"
        progress={progress}
        showBack={true}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <div className="flex flex-col gap-4 pb-24">
          {!noExp &&
            roles.map((role, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="flex justify-end">
                  {roles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRole(index)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <SingleSelectTags
                  options={CHILDCARE_ROLE_OPTIONS}
                  selected={role.role}
                  onChange={(val) => updateRole(index, "role", val ?? "")}
                />

                {role.role === "Other" && (
                  <Input
                    placeholder="Describe the role..."
                    value={role.role_other || ""}
                    onChange={(e) =>
                      updateRole(
                        index,
                        "role_other" as keyof ChildcareRole,
                        e.target.value,
                      )
                    }
                    className="h-11 border-slate-200 focus:border-violet-500 focus:ring-violet-500"
                    autoFocus
                  />
                )}

                {role.role !== "" &&
                  (role.role !== "Other" ||
                    (role.role_other && role.role_other.trim().length > 0)) && (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-slate-500">
                        Duration (years)
                      </Label>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min={0}
                          max={
                            parseInt(experience.total_experience || "10") || 10
                          }
                          value={role.duration}
                          onChange={(e) =>
                            updateRole(
                              index,
                              "duration",
                              parseInt(e.target.value),
                            )
                          }
                          className="flex-1 accent-violet-600"
                        />
                        <span className="text-sm font-semibold text-violet-600 w-16 text-center">
                          {experience.total_experience === "10+" &&
                          role.duration >= 10
                            ? "10+"
                            : role.duration}{" "}
                          {role.duration === 1 ? "year" : "years"}
                        </span>
                      </div>
                    </div>
                  )}
              </div>
            ))}

          {/* No experience amber warning */}
          {noExp && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-amber-800">
                  Experience working with children is required
                </p>
                <p className="text-sm text-amber-700">
                  Baby Bloom requires all childcare professionals to have prior
                  experience working with children. If you&apos;re looking to
                  start a career in childcare, we recommend gaining experience
                  through volunteering or formal qualifications first.
                </p>
              </div>
            </div>
          )}

          {/* Bottom actions */}
          {!noExp && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={addRole}
                className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                {roles.length === 0 ? "Add a role" : "Add another role"}
              </button>

              <button
                type="button"
                onClick={() =>
                  update({ no_childcare_experience: true, childcare_roles: [] })
                }
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                I have not worked with children before
              </button>
            </div>
          )}

          {noExp && (
            <button
              type="button"
              onClick={() => update({ no_childcare_experience: false })}
              className="text-sm text-violet-600 hover:text-violet-700 font-medium self-start"
            >
              Actually, I do have experience
            </button>
          )}

          {canContinue && (
            <div className="fixed bottom-0 left-0 right-0 z-20 pt-3 pb-[66px] bg-gradient-to-t from-white from-70% to-transparent">
              <div className="max-w-md mx-auto px-4">
                <Button
                  onClick={goNext}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white h-11 px-6 rounded-lg font-medium text-sm"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}
        </div>
      </CompoundPageShell>
    );
  }

  return null;
}
