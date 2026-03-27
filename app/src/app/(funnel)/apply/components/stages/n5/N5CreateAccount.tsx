'use client';

import { useState } from 'react';
import { StageProps } from '../../FunnelOrchestrator';
import { CompoundPageShell } from '../../shared/CompoundPageShell';
import { convertLeadToAccount } from '@/lib/actions/nanny-leads';
import { recordConsent } from '@/lib/legal/record-consent';
import { AGR02_CHECKPOINTS } from '@/lib/legal/checkpoints';
import { ConsentCheckboxGroup } from '@/components/legal/ConsentCheckboxGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock } from 'lucide-react';

export function N5CreateAccount({ state, dispatch, goNext, goBack, progress, questionNumber }: StageProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentChecked, setConsentChecked] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email);
  const passwordValid = password.length >= 8;
  const passwordsMatch = password === confirmPassword;
  const allConsentsChecked = AGR02_CHECKPOINTS.every((cp) => consentChecked[cp.id]);
  const canSubmit = emailValid && passwordValid && passwordsMatch && allConsentsChecked && state.leadId;

  const handleSubmit = async () => {
    setAttempted(true);
    if (!canSubmit || !state.leadId) return;

    setSubmitting(true);
    setError(null);

    try {
      await recordConsent(
        AGR02_CHECKPOINTS.map((cp) => ({
          agreementId: 'AGR-02',
          checkpointId: cp.id,
          checkpointText: cp.text,
        }))
      );
    } catch {}

    const result = await convertLeadToAccount(state.leadId, password, state.email);

    if (result.success) {
      // Clear localStorage since conversion is done
      try {
        localStorage.removeItem('bb_nanny_lead_funnel');
      } catch {
        // Ignore
      }
      goNext();
    } else {
      setError(result.error || 'Failed to create account. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <CompoundPageShell
      title="Secure your childcare account"
      subtitle="So you don't lose access to your portfolio or any potential opportunities — secure your account below"
      progress={progress}
      showBack={true}
      onBack={goBack}
      questionNumber={questionNumber}
    >
      <div className="flex flex-col gap-5">
        <div className="flex justify-center mb-2">
          <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center">
            <Lock className="w-6 h-6 text-violet-600" />
          </div>
        </div>

        {/* Email (editable, prefilled from application) */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-slate-700">Email</Label>
          <Input
            type="email"
            value={state.email}
            onChange={(e) => dispatch({ type: 'UPDATE_CONTACT', payload: { email: e.target.value } })}
            placeholder="your@email.com"
            className="h-11 border-slate-200 focus:border-violet-500 focus:ring-violet-500"
          />
          {state.email.trim() !== '' && !emailValid && (
            <p className="text-xs text-amber-600">Please enter a valid email address</p>
          )}
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-slate-700">
            Create a password
          </Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            className="border-slate-200 focus:border-violet-500 focus:ring-violet-500"
          />
          {password.length > 0 && !passwordValid && (
            <p className="text-xs text-amber-600">Password must be at least 8 characters</p>
          )}
        </div>

        {/* Confirm password */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium text-slate-700">
            Confirm your password
          </Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Type your password again"
            className="border-slate-200 focus:border-violet-500 focus:ring-violet-500"
          />
          {attempted && confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs text-red-500">Passwords do not match</p>
          )}
        </div>

        <div>
          <ConsentCheckboxGroup
            checkpoints={AGR02_CHECKPOINTS}
            checked={consentChecked}
            onChange={(id, checked) =>
              setConsentChecked((prev) => ({ ...prev, [id]: checked }))
            }
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>
        )}

        <div className="fixed bottom-0 left-0 right-0 z-20 pt-3 pb-[66px] bg-gradient-to-t from-white from-70% to-transparent">
          <div className="max-w-md mx-auto px-2">
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white h-11 px-6 rounded-lg font-medium text-sm disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating your account...
                </>
              ) : (
                'Secure My Account'
              )}
            </Button>
          </div>
        </div>
      </div>
    </CompoundPageShell>
  );
}
