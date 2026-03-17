'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Rocket, Loader2, AlertTriangle, Check } from 'lucide-react';
import { confirmMatchmaking } from '@/lib/actions/matching';


const STANDARD_FEATURES = [
  'Top 20 nearby + available nannies contacted',
  'Distance + availability matching',
  '3-day search window',
  'Up to 5 interested nannies',
];

const PRIORITY_FEATURES = [
  'Top 50 best-matched nannies contacted',
  'Full algorithmic matching',
  '7-day search with follow-up waves',
  'Up to 10 interested nannies + waitlist',
];

export function MatchmakerCheckoutClient() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await confirmMatchmaking();
      if (result.success) {
        window.location.href = '/parent';
      } else {
        setError(result.error || 'Something went wrong.');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-100 mb-4">
            <Sparkles className="w-6 h-6 text-violet-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Choose your matchmaker plan
          </h1>
          <p className="text-slate-600 mt-2 max-w-md mx-auto">
            Choose how to activate your matchmaker.
          </p>
        </div>

        {/* Side-by-side comparison */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Standard card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Standard</h3>
            <ul className="space-y-2.5 mb-6 flex-1">
              {STANDARD_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>
            {showConfirm ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    With Priority, we contact <strong>3x as many</strong> nannies using our full matching algorithm and follow up until they respond.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      window.location.href = '/parent/matches/share';
                    }}
                    size="sm"
                    className="w-full bg-violet-600 hover:bg-violet-700 text-xs"
                  >
                    <Rocket className="w-3.5 h-3.5 mr-1" />
                    Get Priority for free
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={loading}
                    variant="outline"
                    size="sm"
                    className="w-full border-amber-300 text-amber-800 hover:bg-amber-100 text-xs"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        Activating...
                      </>
                    ) : (
                      'Continue with Standard'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setShowConfirm(true)}
                variant="outline"
                className="w-full border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                Confirm Matchmaking
              </Button>
            )}
          </div>

          {/* Priority card (highlighted) */}
          <div className="bg-white border-2 border-violet-300 ring-2 ring-violet-200 rounded-xl p-5 flex flex-col relative">
            <span className="absolute -top-2.5 right-4 bg-violet-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
              Free
            </span>
            <h3 className="text-lg font-semibold text-violet-900 mb-4">Priority</h3>
            <ul className="space-y-2.5 mb-6 flex-1">
              {PRIORITY_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              onClick={() => {
                window.location.href = '/parent/matches/share';
              }}
              className="w-full bg-violet-600 hover:bg-violet-700"
            >
              <Rocket className="w-4 h-4 mr-1.5" />
              Boost for free!
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
