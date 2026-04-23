// =============================================================================
// Baby Bloom Education App — Type Definitions
// =============================================================================

// ---------------------------------------------------------------------------
// Child Client
// ---------------------------------------------------------------------------

export type ChildClientStatus =
  | "created_auto"
  | "created_manual"
  | "setup"
  | "active_nanny"
  | "trial"
  | "trial_ended"
  | "active"
  | "closed";

export interface ChildClient {
  id: string;
  placement_id: string | null;
  nanny_user_id: string;
  parent_user_id: string | null;
  parent_lead_email: string | null;
  first_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  age_months_approx: number | null;
  under_three: boolean;
  onboarded: boolean;
  status: ChildClientStatus;
  created_at: string;
  updated_at: string;
}

export interface ChildClientEvents {
  id: string;
  child_client_id: string;
  created_auto_at: string | null;
  created_manual_at: string | null;
  setup_at: string | null;
  active_nanny_at: string | null;
  trial_at: string | null;
  trial_ended_at: string | null;
  active_at: string | null;
  closed_at: string | null;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export interface Milestone {
  id: string;
  domain: string;
  age_bracket: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Logs (polymorphic feed table)
// ---------------------------------------------------------------------------

export type BAppLogType =
  | "activity"
  | "report"
  | "progress"
  | "observation"
  | "diary"
  | "insight";

export type BAppLogStatus = "pending" | "ready" | "completed";

export type BAppLogContext = "adhoc" | "activity" | "assessment";

export interface BAppLog {
  id: string;
  child_client_id: string;
  author_id: string;
  type: BAppLogType;
  status: BAppLogStatus;
  context: BAppLogContext;
  parent_log_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Log row joined with author name + optional parent log data (for feed display) */
export interface FeedItem extends BAppLog {
  author_name: string;
  parent_data?: Record<string, unknown>;
  parent_type?: BAppLogType;
}

// ---------------------------------------------------------------------------
// Type-Specific Data Shapes (stored in bapp_logs.data JSONB)
// ---------------------------------------------------------------------------

/** AI-generated activity plan response */
export interface ActivityPlan {
  creativeName: string;
  recommendedLine: string;
  activityDescription: string;
  objectivesList: string[];
  intention: string;
  supplies: string[];
  suppliesDisclaimer: string;
  activityGuide: string[];
  encouragementTips: string[];
  keyObservations: KeyObservation[];
}

export interface KeyObservation {
  domain: string;
  objective: string;
  levels: {
    introduced: string;
    assisted: string;
    guided: string;
    independent: string;
  };
}

/** data shape for type='activity' */
export interface ActivityData {
  milestone_ids: string[];
  prompt_context: { domain: string; age: string; desc: string }[];
  activity_json: ActivityPlan | null;
  title: string;
}

/** data shape for type='report' */
export interface ReportData {
  feedback: string | null;
  rating_count: number;
  title: string;
  image_url: string | null;
  insight?: string;
}

/** data shape for type='progress' */
export interface ProgressData {
  updates: { id: string; score: number }[];
  title: string;
  image_url: string | null;
  note: string | null;
  insight?: string;
}

/** data shape for type='observation' */
export interface ObservationData {
  domain: string | null;
  milestone_id: string | null;
  score: number | null;
  note: string | null;
  title: string;
  image_url: string | null;
  insight?: string;
}

/** data shape for type='diary', subtype='meal'|'snack'|'bottle' */
export interface FoodData {
  subtype: "meal" | "snack" | "bottle";
  details: string | null;
  quantity: string | null;
  time: string;
  title: "Food Log";
  image_url: string | null;
}

/** data shape for type='diary', subtype='sleep' */
export interface SleepData {
  subtype: "sleep";
  start: string;
  end: string;
  duration: string | null;
  notes: string | null;
  title: "Sleep Log";
  image_url: string | null;
}

/** data shape for type='insight' */
export interface InsightData {
  text: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface ProgressScore {
  id: string;
  child_client_id: string;
  domain: string;
  scores: Record<string, number>;
  percent: number;
  updated_at: string;
}

export interface ProgressHistory {
  id: string;
  child_client_id: string;
  ref_log_id: string | null;
  cl_total: number;
  pse_total: number;
  pd_total: number;
  lit_total: number;
  num_total: number;
  uw_total: number;
  ead_total: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DomainProgress {
  score: number;
  total: number;
  percent: number;
}

export interface DashboardStats {
  totalActivities: number;
  totalObservations: number;
  daysActive: number;
  strongestDomain: string;
}

export interface DashboardData {
  domains: Record<string, DomainProgress>;
  stats: DashboardStats;
}
