"use client";

/**
 * AccountTotalTile — top-of-dashboard summary for S12.
 *
 * Shows the sum-of-counters across all families the nanny serves +
 * the count of families. Loss-aversion + endowment: even when
 * earnings are locked or frozen, they count toward the visible
 * total. The nanny sees "A$300 / A$300 across 3 families" — money
 * she could be receiving if circumstances unlock.
 *
 * Spec: `system/APP/PAYMENTS/FRONTEND/03-build-spec.md` §S12.
 */

import { Card, CardContent } from "@/components/ui/card";
import { COMMISSION_PER_CYCLE_AUD } from "@/lib/payments/payouts-state";

export interface AccountTotalTileProps {
  familyCount: number;
}

export function AccountTotalTile({ familyCount }: AccountTotalTileProps) {
  const totalAud = familyCount * COMMISSION_PER_CYCLE_AUD;
  return (
    <Card className="border-violet-200 bg-violet-50/40">
      <CardContent className="space-y-2 p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-700">
          This period totals
        </p>
        <p className="text-3xl font-bold text-slate-900">
          A${totalAud}
          <span className="text-base font-normal text-slate-500">
            {" "}
            / A${totalAud}
          </span>
        </p>
        <p className="text-sm text-slate-600">
          {familyCount === 0
            ? "No families yet — onboard a child to start earning."
            : familyCount === 1
              ? "Across 1 family"
              : `Across ${familyCount} families`}
        </p>
      </CardContent>
    </Card>
  );
}
