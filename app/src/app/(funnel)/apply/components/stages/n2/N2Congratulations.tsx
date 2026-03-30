'use client';

import { StageProps } from '../../FunnelOrchestrator';
import { Button } from '@/components/ui/button';
import { PartyPopper } from 'lucide-react';

export function N2Congratulations({ state, goNext }: StageProps) {
  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 px-6 text-center animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
          <PartyPopper className="w-10 h-10 text-emerald-600" />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold text-slate-800">
            Congratulations, {state.first_name || 'there'}!
          </h1>
          <p className="text-xl text-emerald-600 font-semibold">
            Your application has been approved.
          </p>
        </div>

        <div className="flex flex-col gap-4 max-w-md text-slate-600 text-base leading-relaxed">
          <p>
            After reviewing your application we know that you are a perfect fit for the families we want to help the most and cannot wait to bring the two of you together!
          </p>
          <p>
            Before we start connecting you, tell us a little more about the families you wish to match with.
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 pt-3 pb-[66px] bg-gradient-to-t from-white from-70% to-transparent">
        <div className="max-w-md mx-auto px-4">
          <Button
            onClick={goNext}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white h-11 px-6 rounded-lg font-medium text-sm"
          >
            Find my perfect family!
          </Button>
        </div>
      </div>
    </>
  );
}
