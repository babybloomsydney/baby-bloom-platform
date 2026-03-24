'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ClientBiometricConsentModal } from '@/components/legal/ClientBiometricConsentModal';
import { ConsentCheckboxGroup } from '@/components/legal/ConsentCheckboxGroup';
import { recordConsent, recordBiometricConsent } from '@/lib/legal/record-consent';
import { AGR03_CHECKPOINTS } from '@/lib/legal/checkpoints';
import { ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ParentVerifyPage() {
  const router = useRouter();
  const [showBiometricNotice, setShowBiometricNotice] = useState(false);
  const [biometricRead, setBiometricRead] = useState(false);
  const [biometricData, setBiometricData] = useState<{
    notice_opened_at: string;
    notice_scroll_completed_at: string;
    notice_time_spent_seconds: number;
    checkboxes_enabled_at: string;
  } | null>(null);
  const [consentChecked, setConsentChecked] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = AGR03_CHECKPOINTS.every((cp) => consentChecked[cp.id]);

  const handleBiometricComplete = (data: {
    notice_opened_at: string;
    notice_scroll_completed_at: string;
    notice_time_spent_seconds: number;
    checkboxes_enabled_at: string;
  }) => {
    setBiometricData(data);
    setBiometricRead(true);
    setShowBiometricNotice(false);
  };

  const handleSubmit = async () => {
    if (!allChecked || !biometricData) return;
    setSubmitting(true);
    setError(null);

    const bioResult = await recordBiometricConsent({
      ...biometricData,
      checkbox_timestamps: Object.fromEntries(
        AGR03_CHECKPOINTS.map((cp) => [cp.id, new Date().toISOString()])
      ),
    });

    if (!bioResult.success) {
      setError(bioResult.error || 'Failed to record biometric consent');
      setSubmitting(false);
      return;
    }

    const consentResult = await recordConsent(
      AGR03_CHECKPOINTS.map((cp) => ({
        agreementId: 'AGR-03',
        checkpointId: cp.id,
        checkpointText: cp.text,
      }))
    );

    if (!consentResult.success) {
      setError(consentResult.error || 'Failed to record consent');
      setSubmitting(false);
      return;
    }

    router.push('/parent/verification');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/parent/dashboard"
          className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Dashboard
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-violet-100 rounded-full flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-violet-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 text-center mb-2">
            Identity Verification
          </h1>
          <p className="text-sm text-slate-500 text-center mb-8">
            To protect families and professionals on our platform, we need to verify your
            identity using AI-assisted facial recognition and government document checks
            before you can connect with childcare professionals.
          </p>

          {!biometricRead ? (
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-4">
                Before proceeding, you must read the Biometric Data Collection Notice.
              </p>
              <Button
                onClick={() => setShowBiometricNotice(true)}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                Read Biometric Data Collection Notice
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-700">
                  Biometric notice read and acknowledged
                </p>
              </div>

              <ConsentCheckboxGroup
                checkpoints={AGR03_CHECKPOINTS}
                checked={consentChecked}
                onChange={(id, checked) =>
                  setConsentChecked((prev) => ({ ...prev, [id]: checked }))
                }
              />

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>
              )}

              <Button
                onClick={handleSubmit}
                disabled={!allChecked || submitting}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white h-11"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Verify My Identity'
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      <ClientBiometricConsentModal
        open={showBiometricNotice}
        onComplete={handleBiometricComplete}
      />
    </div>
  );
}
