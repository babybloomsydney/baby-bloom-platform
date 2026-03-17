'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { StageProps } from '../../FunnelOrchestrator';
import { AnimatedChecklist } from '../../shared/AnimatedChecklist';
import { Loader2 } from 'lucide-react';

const SPINNER_MESSAGES = [
  'Reviewing your application...',
  'Matching your profile to our families...',
  'Checking available positions in your area...',
];

export function N2VerificationChecklist({ state, goNext }: StageProps) {
  const [checklistDone, setChecklistDone] = useState(false);
  const [spinnerMsg, setSpinnerMsg] = useState(SPINNER_MESSAGES[0]);
  const spinnerIdx = useRef(0);

  // After checklist completes, cycle spinner messages then auto-advance
  useEffect(() => {
    if (!checklistDone) return;

    const interval = setInterval(() => {
      spinnerIdx.current++;
      if (spinnerIdx.current >= SPINNER_MESSAGES.length) {
        clearInterval(interval);
        goNext();
      } else {
        setSpinnerMsg(SPINNER_MESSAGES[spinnerIdx.current]);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [checklistDone, goNext]);

  // Build checklist items from N1 data
  const checklistItems = useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];
    const { identity, experience, qualifications } = state;

    if (identity.personality_traits.length > 0) {
      items.push({
        label: 'Personality',
        value: identity.personality_traits.slice(0, 4).join(', '),
      });
    }

    if (identity.level_of_support.length > 0) {
      items.push({
        label: 'Approach',
        value: identity.level_of_support.join(', '),
      });
    }

    if (identity.professional_values.length > 0) {
      items.push({
        label: 'Values',
        value: identity.professional_values.slice(0, 3).join(', '),
      });
    }

    if (experience.total_experience) {
      items.push({
        label: 'Experience',
        value: `${experience.total_experience} years experience with children`,
      });
    }

    if (experience.newborn_experience && experience.newborn_experience > 0) {
      items.push({
        label: 'Specialist',
        value: `${experience.newborn_experience} years with newborns`,
      });
    } else if (experience.under_3_experience && experience.under_3_experience > 0) {
      items.push({
        label: 'Specialist',
        value: `${experience.under_3_experience} years with under 3s`,
      });
    }

    if (experience.childcare_roles.length > 0) {
      const roleNames = experience.childcare_roles
        .map((r) => r.role)
        .filter((r) => r !== 'Other')
        .slice(0, 3);
      if (roleNames.length > 0) {
        items.push({
          label: 'Roles',
          value: roleNames.join(', '),
        });
      }
    }

    if (qualifications.has_qualifications && qualifications.highest_qualification) {
      items.push({
        label: 'Qualification',
        value: qualifications.highest_qualification,
      });
    }

    return items;
  }, [state]);

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <h2 className="text-xl font-semibold text-slate-700 text-center">
        Reviewing your application...
      </h2>
      <div className="w-full max-w-md">
        <AnimatedChecklist
          items={checklistItems}
          onComplete={() => setChecklistDone(true)}
          intervalMs={800}
        />
      </div>

      {/* Inline spinner appears below checklist after it completes */}
      {checklistDone && (
        <div className="flex flex-col items-center gap-3 pt-8 animate-in fade-in duration-300">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-sm text-slate-600">{spinnerMsg}</p>
        </div>
      )}
    </div>
  );
}
