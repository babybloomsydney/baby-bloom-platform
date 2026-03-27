'use client';

import { useCallback } from 'react';
import { StageProps } from '../../FunnelOrchestrator';
import { SingleSelectTags } from '../../shared/SingleSelectTags';
import { YesNoTags } from '../../shared/YesNoTags';
import { ProgressiveReveal } from '../../shared/ProgressiveReveal';
import { CompoundPageShell } from '../../shared/CompoundPageShell';
import { LANGUAGE_OPTIONS } from '@/types/nanny-leads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function N3AboutYou({ state, dispatch, goNext, goBack, progress, questionNumber }: StageProps) {
  const { matching } = state;

  const update = useCallback(
    (payload: Partial<typeof matching>) => {
      dispatch({ type: 'UPDATE_MATCHING', payload });
    },
    [dispatch]
  );

  const selectedLanguage = matching.languages.length > 0 ? matching.languages[0] : null;

  const showOtherLanguages =
    selectedLanguage === 'Foreign Language' ||
    selectedLanguage === 'Multiple';

  const showDriversLicense =
    selectedLanguage !== null &&
    (!showOtherLanguages || (matching.other_languages !== null && matching.other_languages.trim() !== ''));

  const showCar = matching.drivers_license === true;

  const showVaccination =
    matching.drivers_license === false ||
    matching.has_car !== null;

  const showNonSmoker = matching.vaccination_status !== null;

  const canContinue =
    matching.languages.length > 0 &&
    matching.drivers_license !== null &&
    (matching.drivers_license === false || matching.has_car !== null) &&
    matching.vaccination_status !== null &&
    matching.non_smoker !== null;

  return (
    <CompoundPageShell
      title="A Little More About You"
      subtitle="These details help us find families that are the right fit for you"
      progress={progress}
      showBack={true}
      onBack={goBack}
      questionNumber={questionNumber}
    >
      <div className="flex flex-col gap-5 pb-24">
        {/* Languages */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-slate-700">
            What languages do you speak?
          </Label>
          <SingleSelectTags
            options={LANGUAGE_OPTIONS}
            selected={selectedLanguage}
            onChange={(val) => {
              const needsOther = val === 'Foreign Language' || val === 'Multiple';
              update({
                languages: val ? [val] : [],
                ...(!needsOther ? { other_languages: null } : {}),
                drivers_license: null,
                has_car: null,
                vaccination_status: null,
                non_smoker: null,
              });
            }}
          />
        </div>

        {/* Other languages */}
        <ProgressiveReveal show={showOtherLanguages}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700">
              Which other languages do you speak?
            </Label>
            <Input
              value={matching.other_languages || ''}
              onChange={(e) => update({ other_languages: e.target.value || null })}
              placeholder="e.g. French, Mandarin..."
              className="h-11 border-slate-200 focus:border-violet-500 focus:ring-violet-500"
            />
          </div>
        </ProgressiveReveal>

        {/* Driver's licence */}
        <ProgressiveReveal show={showDriversLicense}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700">
              Do you have a valid driver&apos;s licence?
            </Label>
            <YesNoTags
              selected={matching.drivers_license}
              onChange={(val) => {
                update({
                  drivers_license: val,
                  has_car: null,
                  vaccination_status: null,
                  non_smoker: null,
                });
              }}
            />
          </div>
        </ProgressiveReveal>

        {/* Car */}
        <ProgressiveReveal show={showCar}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700">
              Do you have access to a car?
            </Label>
            <YesNoTags
              selected={matching.has_car}
              onChange={(val) => {
                update({
                  has_car: val,
                  vaccination_status: null,
                  non_smoker: null,
                });
              }}
            />
          </div>
        </ProgressiveReveal>

        {/* Vaccination */}
        <ProgressiveReveal show={showVaccination}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700">
              Are you fully vaccinated?
            </Label>
            <YesNoTags
              selected={matching.vaccination_status}
              onChange={(val) => {
                update({
                  vaccination_status: val,
                  non_smoker: null,
                });
              }}
            />
          </div>
        </ProgressiveReveal>

        {/* Non-smoker */}
        <ProgressiveReveal show={showNonSmoker}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700">
              Are you a non-smoker?
            </Label>
            <YesNoTags
              selected={matching.non_smoker}
              onChange={(val) => update({ non_smoker: val })}
            />
          </div>
        </ProgressiveReveal>

        {canContinue && (
          <div className="fixed bottom-0 left-0 right-0 z-20 pt-3 pb-[66px] bg-gradient-to-t from-white from-70% to-transparent">
            <div className="max-w-md mx-auto px-2">
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
