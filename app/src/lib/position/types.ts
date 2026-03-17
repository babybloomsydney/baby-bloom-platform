import type { PositionStage, PositionStatus, ConnectionStage, EndReason } from './constants';

// ─── Position Funnel Fields ───
// These extend the existing Position interface with the new funnel columns.

export interface PositionFunnelFields {
  stage: PositionStage;
  position_status: PositionStatus;
  activated_at: string | null;
  onboarding_complete_at: string | null;
  ended_at: string | null;
  end_reason: EndReason | null;
  closed_at: string | null;
}

// ─── Connection Funnel Fields ───
// These extend the existing ConnectionRequest interface with the new pipeline columns.

export interface ConnectionFunnelFields {
  connection_stage: ConnectionStage;
  intro_outcome_reported_at: string | null; // DB field name; user-facing label is "Meet and Greet"
  fill_initiated_by: 'nanny' | 'parent' | null;
  trial_date: string | null;
  trial_reported_at: string | null;
}

// ─── Placement Extended Fields ───
// These extend the existing nanny_placements with the new columns.

export interface PlacementExtendedFields {
  weekly_hours: number | null;
  hourly_rate: number | null;
  connection_request_id: string | null;
}

// ─── Transition Payloads ───
// Typed payloads for stage transition server actions.

/** Note: "intro" in code = "Meet and Greet" in user-facing UI */
export interface ReportIntroOutcomePayload {
  requestId: string;
  outcome: 'hired' | 'not_hired' | 'awaiting' | 'trial' | 'incomplete';
  trialDate?: string;
}

export interface ConfirmPlacementPayload {
  requestId: string;
  confirmedHours?: number;
  confirmedRate?: number;
}

export interface ParentInitiateFillPayload {
  nannyId: string;
  positionId: string;
}

export interface NannyConfirmPositionPayload {
  requestId: string;
  weeklyHours: number;
  hourlyRate: number;
}

export interface EndPositionPayload {
  positionId: string;
  reason: EndReason;
}

export interface ClosePositionPayload {
  positionId: string;
  noCandidates?: boolean;
}
