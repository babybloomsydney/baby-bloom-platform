export interface AdminSubscriptionRow {
  parentUserId: string;
  fullName: string;
  email: string | null;
  status:
    | "trial"
    | "active_monthly"
    | "active_upfront"
    | "past_due"
    | "cancelled"
    | "lapsed";
  plan: "monthly" | "upfront" | "trial" | "none";
  tenureDays: number | null;
  subscriberSinceIso: string | null;
  cumulativeSpendAud: number;
  cycle: number;
  nextEventIso: string | null;
  nextEventLabel: string;
  failedPayments: number;
  hasNanny: boolean;
  cancellationReason: string | null;
  updatedAtIso: string;
}

export interface AdminSubscriptionCounters {
  activeMonthly: number;
  activeUpfront: number;
  trial: number;
  pastDue: number;
  cancelled: number;
  lapsed: number;
}
