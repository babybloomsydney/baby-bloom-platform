'use client';

import { useCallback } from 'react';
import { StageProps } from '../../FunnelOrchestrator';
import { SingleSelectTags } from '../../shared/SingleSelectTags';
import { ProgressiveReveal } from '../../shared/ProgressiveReveal';
import { CompoundPageShell } from '../../shared/CompoundPageShell';
import { DAY_OPTIONS, TIME_OPTIONS } from '@/types/nanny-leads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check } from 'lucide-react';

const IMMEDIATE_START_OPTIONS = ['Yes', 'At a later date'];
const PLACEMENT_ONGOING_OPTIONS = ['Yes', 'Until a certain date'];

export function N3Availability({ state, dispatch, goNext, goBack, progress, questionNumber }: StageProps) {
  const { availability } = state;

  const update = useCallback(
    (payload: Partial<typeof availability>) => {
      dispatch({ type: 'UPDATE_AVAILABILITY', payload });
    },
    [dispatch]
  );

  const dayTimes = availability.day_times || {};

  const toggleDay = (day: string) => {
    const current = availability.available_days;
    if (current.includes(day)) {
      const newDays = current.filter((d) => d !== day);
      const newDayTimes = { ...dayTimes };
      delete newDayTimes[day.toLowerCase()];
      update({ available_days: newDays, day_times: newDayTimes });
    } else {
      update({ available_days: [...current, day] });
    }
  };

  const toggleTime = (day: string, time: string) => {
    const dayKey = day.toLowerCase();
    const currentTimes = dayTimes[dayKey] || [];
    const newTimes = currentTimes.includes(time)
      ? currentTimes.filter((t) => t !== time)
      : [...currentTimes, time];
    update({ day_times: { ...dayTimes, [dayKey]: newTimes } });
  };

  const anyDayHasTime = availability.available_days.some(
    (day) => (dayTimes[day.toLowerCase()] ?? []).length > 0
  );

  const allDaysHaveTimes =
    availability.available_days.length > 0 &&
    availability.available_days.every(
      (day) => (dayTimes[day.toLowerCase()] ?? []).length > 0
    );

  const showImmediateStart = anyDayHasTime;
  const showStartDate = availability.immediate_start === 'At a later date';
  const showPlacementOngoing =
    availability.immediate_start === 'Yes' ||
    (availability.immediate_start === 'At a later date' &&
      availability.start_date !== null &&
      availability.start_date.trim() !== '');
  const showEndDate = availability.placement_ongoing === 'Until a certain date';

  const isComplete =
    anyDayHasTime &&
    availability.immediate_start !== null &&
    (availability.immediate_start !== 'At a later date' ||
      (availability.start_date !== null && availability.start_date.trim() !== '')) &&
    availability.placement_ongoing !== null &&
    (availability.placement_ongoing !== 'Until a certain date' ||
      (availability.end_date !== null && availability.end_date.trim() !== ''));

  const today = new Date().toISOString().split('T')[0];

  return (
    <CompoundPageShell
      title="Your Availability"
      progress={progress}
      showBack={true}
      onBack={goBack}
      questionNumber={questionNumber}
    >
      <div className="flex flex-col gap-5">
        {/* Days — 4+3 grid like brandkit */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-medium text-slate-700">
            Which days are you available to work?
          </Label>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-4 gap-2">
              {DAY_OPTIONS.slice(0, 4).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-2 h-11 rounded-lg border text-sm font-medium flex items-center justify-center transition-all duration-150 ${
                    availability.available_days.includes(day)
                      ? 'bg-violet-500 text-white border-violet-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DAY_OPTIONS.slice(4).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-2 h-11 rounded-lg border text-sm font-medium flex items-center justify-center transition-all duration-150 ${
                    availability.available_days.includes(day)
                      ? 'bg-violet-500 text-white border-violet-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Time bracket grid — only show for selected days */}
        <ProgressiveReveal show={availability.available_days.length > 0}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700 text-center">
              When during the day?
            </Label>
            <div>
              {/* Column headers */}
              <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-1">
                <div />
                {TIME_OPTIONS.map((time) => (
                  <div key={time} className="text-center">
                    <p className="text-[11px] font-semibold text-slate-600">{time}</p>
                  </div>
                ))}
              </div>

              {/* Day rows */}
              {availability.available_days.map((day) => {
                const dayKey = day.toLowerCase();
                const currentTimes = dayTimes[dayKey] || [];
                return (
                  <div key={day} className="grid grid-cols-[80px_repeat(4,1fr)] gap-1 mb-1">
                    <div className="flex items-center">
                      <p className="text-xs font-semibold text-slate-600">{day.slice(0, 3)}</p>
                    </div>
                    {TIME_OPTIONS.map((time) => {
                      const isOn = currentTimes.includes(time);
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => toggleTime(day, time)}
                          className={`h-9 rounded-md border text-xs font-medium flex items-center justify-center transition-colors ${
                            isOn
                              ? 'bg-violet-500 text-white border-violet-500'
                              : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isOn ? <Check className="h-3.5 w-3.5" /> : ''}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </ProgressiveReveal>

        {/* Immediate start */}
        <ProgressiveReveal show={showImmediateStart}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700">
              Are you available to start straight away?
            </Label>
            <SingleSelectTags
              options={IMMEDIATE_START_OPTIONS}
              selected={availability.immediate_start}
              onChange={(val) => update({ immediate_start: val, start_date: null, placement_ongoing: null, end_date: null })}
            />
          </div>
        </ProgressiveReveal>

        {/* Start date */}
        <ProgressiveReveal show={showStartDate}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700">
              When are you available to start?
            </Label>
            <Input
              type="date"
              min={today}
              value={availability.start_date || ''}
              onChange={(e) => update({ start_date: e.target.value || null })}
              className="h-11 border-slate-200 focus:border-violet-500 focus:ring-violet-500"
            />
          </div>
        </ProgressiveReveal>

        {/* Placement ongoing */}
        <ProgressiveReveal show={showPlacementOngoing}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700">
              Are you looking for ongoing work?
            </Label>
            <SingleSelectTags
              options={PLACEMENT_ONGOING_OPTIONS}
              selected={availability.placement_ongoing}
              onChange={(val) => update({ placement_ongoing: val, end_date: null })}
            />
          </div>
        </ProgressiveReveal>

        {/* End date */}
        <ProgressiveReveal show={showEndDate}>
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-sm font-medium text-slate-700">
              When would you like to finish?
            </Label>
            <Input
              type="date"
              min={availability.start_date || today}
              value={availability.end_date || ''}
              onChange={(e) => update({ end_date: e.target.value || null })}
              className="h-11 border-slate-200 focus:border-violet-500 focus:ring-violet-500"
            />
          </div>
        </ProgressiveReveal>

        {isComplete && (
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
