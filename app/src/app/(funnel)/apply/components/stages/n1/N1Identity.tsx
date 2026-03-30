'use client';

import { useCallback } from 'react';
import { StageProps } from '../../FunnelOrchestrator';
import { SingleSelectTags } from '../../shared/SingleSelectTags';
import { MultiSelectTags } from '../../shared/MultiSelectTags';
import { AutoAdvance } from '../../shared/AutoAdvance';
import { NannyQuestionShell } from '../../shared/NannyQuestionShell';
import {
  MOTIVATION_OPTIONS,
  PERSONALITY_TRAIT_OPTIONS,
  LEVEL_OF_SUPPORT_OPTIONS,
  PROFESSIONAL_VALUE_OPTIONS,
} from '@/types/nanny-leads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface N1IdentityProps extends StageProps {
  subPage: string;
}

export function N1Identity({ state, dispatch, goNext, goBack, subPage, progress, questionNumber }: N1IdentityProps) {
  const { identity } = state;

  const update = useCallback(
    (payload: Partial<typeof identity>) => {
      dispatch({ type: 'UPDATE_IDENTITY', payload });
    },
    [dispatch]
  );

  // Page 1: Motivation (Q1) — single select with auto-advance
  if (subPage === 'n1-motivation') {
    const showOtherInput = identity.motivation === 'Other';

    return (
      <NannyQuestionShell
        question="What do you love most about working with children?"
        subtitle="Tell us what drives you"
        progress={progress}
        showBack={false}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <div className="flex flex-col gap-3">
          <SingleSelectTags
            options={MOTIVATION_OPTIONS}
            selected={identity.motivation}
            onChange={(val) => update({ motivation: val })}
          />

          {showOtherInput && (
            <Input
              placeholder="Tell us what motivates you..."
              value={identity.motivation_other || ''}
              onChange={(e) => update({ motivation_other: e.target.value })}
              className="h-11 border-slate-200 focus:border-violet-500 focus:ring-violet-500"
              autoFocus
            />
          )}

          <AutoAdvance
            shouldAdvance={
              identity.motivation !== null &&
              identity.motivation !== 'Other' &&
              identity.motivation !== ''
            }
            onAdvance={goNext}
          />

          {showOtherInput && identity.motivation_other && identity.motivation_other.trim().length > 0 && (
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
      </NannyQuestionShell>
    );
  }

  // Page 2: Personality Traits (Q2) — pick top 5
  if (subPage === 'n1-personality') {
    return (
      <NannyQuestionShell
        question="Which of these best describe you as a nanny?"
        subtitle="Pick your top 5"
        progress={progress}
        showBack={true}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <div className="flex flex-col gap-3">
          <MultiSelectTags
            options={PERSONALITY_TRAIT_OPTIONS}
            selected={identity.personality_traits}
            onChange={(val) => update({ personality_traits: val })}
            max={5}
          />
          {identity.personality_traits.length === 5 && (
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
      </NannyQuestionShell>
    );
  }

  // Page 3: Level of Support (Q3) — pick 1, auto-advance
  if (subPage === 'n1-support') {
    return (
      <NannyQuestionShell
        question="Which of the following best describes your ability to support young children?"
        subtitle="Pick one"
        progress={progress}
        showBack={true}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <SingleSelectTags
          options={LEVEL_OF_SUPPORT_OPTIONS}
          selected={identity.level_of_support[0] ?? null}
          onChange={(val) => update({ level_of_support: val ? [val] : [] })}
        />
        <AutoAdvance
          shouldAdvance={identity.level_of_support.length === 1}
          onAdvance={goNext}
        />
      </NannyQuestionShell>
    );
  }

  // Page 4: Professional Values (Q4) — pick top 5
  if (subPage === 'n1-values') {
    return (
      <NannyQuestionShell
        question="Which of the following do you believe make you an exceptional nanny?"
        subtitle="Pick your top 5"
        progress={progress}
        showBack={true}
        onBack={goBack}
        questionNumber={questionNumber}
      >
        <div className="flex flex-col gap-3">
          <MultiSelectTags
            options={PROFESSIONAL_VALUE_OPTIONS}
            selected={identity.professional_values}
            onChange={(val) => update({ professional_values: val })}
            max={5}
          />
          {identity.professional_values.length === 5 && (
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
      </NannyQuestionShell>
    );
  }

  return null;
}
