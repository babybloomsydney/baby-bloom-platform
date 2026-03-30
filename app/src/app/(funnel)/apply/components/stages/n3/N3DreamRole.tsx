'use client';

import { useCallback, useMemo } from 'react';
import { StageProps } from '../../FunnelOrchestrator';
import { MultiSelectTags } from '../../shared/MultiSelectTags';
import { SingleSelectTags } from '../../shared/SingleSelectTags';
import { YesNoTags } from '../../shared/YesNoTags';
import { AutoAdvance } from '../../shared/AutoAdvance';
import { ProgressiveReveal } from '../../shared/ProgressiveReveal';
import { NannyQuestionShell } from '../../shared/NannyQuestionShell';
import { CompoundPageShell } from '../../shared/CompoundPageShell';
import {
  ROLE_TYPE_OPTIONS,
  MAX_CHILDREN_OPTIONS,
  MIN_AGE_OPTIONS,
  MAX_AGE_OPTIONS,
} from '@/types/nanny-leads';
import { Button } from '@/components/ui/button';


interface N3DreamRoleProps extends StageProps {
  subPage: string;
}

export function N3DreamRole({ state, dispatch, goNext, goBack, subPage, progress, questionNumber }: N3DreamRoleProps) {
  const { preferences } = state;

  const update = useCallback(
    (payload: Partial<typeof preferences>) => {
      dispatch({ type: 'UPDATE_PREFERENCES', payload });
    },
    [dispatch]
  );

  // Filter max_age options to only show values >= min_age
  const filteredMaxAgeOptions = useMemo(() => {
    if (!preferences.min_age) return MAX_AGE_OPTIONS;
    const minIndex = MIN_AGE_OPTIONS.indexOf(preferences.min_age);
    return MAX_AGE_OPTIONS.filter((opt) => {
      const maxIndex = MAX_AGE_OPTIONS.indexOf(opt);
      return maxIndex >= Math.max(0, minIndex - 4);
    });
  }, [preferences.min_age]);

  // Page 1: Services — multi-select with continue
  if (subPage === 'n3-services') {
    return (
      <NannyQuestionShell
        question="Which services are you wanting to provide?"
        subtitle="Select all that interest you"
        progress={progress}
        showBack={true}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <MultiSelectTags
          options={ROLE_TYPE_OPTIONS}
          selected={preferences.role_types}
          onChange={(val) => update({ role_types: val })}
        />
        {preferences.role_types.length > 0 && (
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
      </NannyQuestionShell>
    );
  }

  // Page 2: Children & Ages — compound with progressive reveal
  if (subPage === 'n3-children') {
    return (
      <CompoundPageShell
        title="Your Ideal Family"
        progress={progress}
        showBack={true}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <div className="flex flex-col gap-5">
          {/* Max children */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">
              How many children are you happy to care for at one time?
            </label>
            <SingleSelectTags
              options={MAX_CHILDREN_OPTIONS.map(String)}
              selected={preferences.max_children?.toString() ?? null}
              onChange={(val) => update({ max_children: val ? parseInt(val) : null, min_age: null, max_age: null })}
              columns={3}
            />
          </div>

          {/* Min age */}
          <ProgressiveReveal show={preferences.max_children !== null}>
            <div className="flex flex-col gap-2 pt-2">
              <label className="text-sm font-medium text-slate-700">
                What&apos;s the youngest age you want to care for?
              </label>
              <select
                value={preferences.min_age ?? ''}
                onChange={(e) => update({ min_age: e.target.value || null, max_age: null })}
                className="w-full h-11 rounded-lg border border-slate-200 text-sm text-slate-800 px-3 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none bg-white"
              >
                <option value="">Select age...</option>
                {MIN_AGE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </ProgressiveReveal>

          {/* Max age */}
          <ProgressiveReveal show={preferences.min_age !== null}>
            <div className="flex flex-col gap-2 pt-2">
              <label className="text-sm font-medium text-slate-700">
                What&apos;s the oldest age you&apos;d like to work with?
              </label>
              <select
                value={preferences.max_age ?? ''}
                onChange={(e) => update({ max_age: e.target.value || null })}
                className="w-full h-11 rounded-lg border border-slate-200 text-sm text-slate-800 px-3 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none bg-white"
              >
                <option value="">Select age...</option>
                {filteredMaxAgeOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </ProgressiveReveal>

          {preferences.max_age !== null && (
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

  // Page 3: Additional Needs — single question with auto-advance
  if (subPage === 'n3-additional-needs') {
    return (
      <NannyQuestionShell
        question="Are you open to working with children who have additional needs?"
        progress={progress}
        showBack={true}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <YesNoTags
          selected={preferences.additional_needs}
          onChange={(val) => update({ additional_needs: val })}
        />
        <AutoAdvance
          shouldAdvance={preferences.additional_needs !== null}
          onAdvance={goNext}
        />
      </NannyQuestionShell>
    );
  }

  // Page 4: Pets — single question with auto-advance
  if (subPage === 'n3-pets') {
    return (
      <NannyQuestionShell
        question="Are you happy to work with families that have pets?"
        progress={progress}
        showBack={true}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <YesNoTags
          selected={preferences.comfortable_with_pets}
          onChange={(val) => update({ comfortable_with_pets: val })}
        />
        <AutoAdvance
          shouldAdvance={preferences.comfortable_with_pets !== null}
          onAdvance={goNext}
        />
      </NannyQuestionShell>
    );
  }

  return null;
}
