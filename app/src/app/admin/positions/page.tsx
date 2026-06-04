import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPositionsClient } from "./AdminPositionsClient";
import { connStagesLocal } from "./positions.helpers";
import type {
  DfyMatchRow,
  ActivePlacement,
  PerStageCounts,
} from "./positions.helpers";

export const dynamic = "force-dynamic";

export interface PositionChild {
  age_months: number;
  gender: string | null;
}

export interface PositionConnection {
  id: string;
  nanny_id: string;
  nanny_user_id: string | null;
  nanny_name: string;
  connection_stage: number | null;
  source: string | null;
  confirmed_time: string | null;
  confirmed_at: string | null;
  created_at: string;
  responded_at: string | null;
  intro_outcome_reported_at: string | null;
  trial_reported_at: string | null;
}

export interface AdminPosition {
  id: string;
  parent_id: string;
  parent_name: string | null;
  parent_user_id: string | null;
  suburb: string | null;
  hourly_rate: number | null;
  hours_per_week: number | null;
  status: string;
  stage: number | null;
  position_status: number | null;
  source: string;
  family_display_name: string | null;
  days_required: string[] | null;
  schedule_type: string | null;
  placement_length: string | null;
  description: string | null;
  dfy_activated_at: string | null;
  dfy_tier: string | null;
  dfy_expires_at: string | null;
  /** JSONB array of DFY wave numbers already sent (e.g. [1] or [1, 2, 3]); null if never activated. */
  dfy_wave_sent: number[] | null;
  filled_at: string | null;
  filled_by_nanny_id: string | null;
  expires_at: string | null;
  created_at: string;
  schedule: Record<string, string[]> | null;
  children: PositionChild[];
  connections: PositionConnection[];
  dfyMatches: DfyMatchRow[];
  activePlacement: ActivePlacement | null;
  perStageCounts: PerStageCounts;
}

// ─── Internal data-assembly helpers ───

type Row = Record<string, unknown>;
type Profile = {
  first_name: string | null;
  last_name: string | null;
  suburb: string | null;
};
type ResolveNanny = (nannyId: string) => {
  userId: string | null;
  name: string;
  suburb: string | null;
};

/** Narrow a JSONB column to a number[] (the DFY wave list) or null. */
function toWaveList(value: unknown): number[] | null {
  return Array.isArray(value)
    ? value.filter((x): x is number => typeof x === "number")
    : null;
}

/**
 * Resolve a nanny's user_id + display name + suburb from the in-memory maps. The nannies fetch
 * is global, so every nanny_id resolves; if it is ever scoped, unmatched nannies fall back to "Unknown".
 */
function makeResolveNanny(
  nannyUserIdMap: Map<string, string>,
  profileMap: Map<string, Profile>,
): ResolveNanny {
  return (nannyId) => {
    const userId = nannyUserIdMap.get(nannyId) ?? null;
    const profile = userId ? profileMap.get(userId) : null;
    const name = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(" ")
      : "Unknown";
    return { userId, name, suburb: profile?.suburb ?? null };
  };
}

function groupChildren(rows: ReadonlyArray<Row>): Map<string, PositionChild[]> {
  const byPosition = new Map<string, PositionChild[]>();
  for (const c of rows) {
    const positionId = c.position_id as string;
    const list = byPosition.get(positionId) ?? [];
    list.push({
      age_months: c.age_months as number,
      gender: (c.gender as string | null) ?? null,
    });
    byPosition.set(positionId, list);
  }
  return byPosition;
}

/** Group connections by position; also index DFY-sourced connections for cross-reference. */
function groupConnections(
  rows: ReadonlyArray<Row>,
  resolveNanny: ResolveNanny,
): {
  byPosition: Map<string, PositionConnection[]>;
  dfyConnByPositionNanny: Map<string, { id: string; stage: number | null }>;
} {
  const byPosition = new Map<string, PositionConnection[]>();
  const dfyConnByPositionNanny = new Map<
    string,
    { id: string; stage: number | null }
  >();
  for (const conn of rows) {
    const positionId = conn.position_id as string | null;
    if (!positionId) continue;
    const nannyId = conn.nanny_id as string;
    const info = resolveNanny(nannyId);
    const list = byPosition.get(positionId) ?? [];
    list.push({
      id: conn.id as string,
      nanny_id: nannyId,
      nanny_user_id: info.userId,
      nanny_name: info.name,
      connection_stage: (conn.connection_stage as number | null) ?? null,
      source: (conn.source as string | null) ?? null,
      confirmed_time: (conn.confirmed_time as string | null) ?? null,
      confirmed_at: (conn.confirmed_at as string | null) ?? null,
      created_at: conn.created_at as string,
      responded_at: (conn.responded_at as string | null) ?? null,
      intro_outcome_reported_at:
        (conn.intro_outcome_reported_at as string | null) ?? null,
      trial_reported_at: (conn.trial_reported_at as string | null) ?? null,
    });
    byPosition.set(positionId, list);
    // One DFY connection per (position, nanny) in practice; last write wins if ever duplicated.
    if (conn.source === "dfy") {
      dfyConnByPositionNanny.set(`${positionId}_${nannyId}`, {
        id: conn.id as string,
        stage: (conn.connection_stage as number | null) ?? null,
      });
    }
  }
  return { byPosition, dfyConnByPositionNanny };
}

/** Group DFY match notifications by position (resolve name/suburb; link the dfy connection if any). */
function groupDfyMatches(
  rows: ReadonlyArray<Row>,
  dfyConnByPositionNanny: Map<string, { id: string; stage: number | null }>,
  resolveNanny: ResolveNanny,
): Map<string, DfyMatchRow[]> {
  const byPosition = new Map<string, DfyMatchRow[]>();
  for (const m of rows) {
    const positionId = m.position_id as string | null;
    if (!positionId) continue;
    const nannyId = m.nanny_id as string;
    const info = resolveNanny(nannyId);
    const linked =
      dfyConnByPositionNanny.get(`${positionId}_${nannyId}`) ?? null;
    const list = byPosition.get(positionId) ?? [];
    list.push({
      nanny_id: nannyId,
      nanny_user_id: info.userId,
      nanny_name: info.name,
      suburb: info.suburb,
      status: m.status as string,
      wave: (m.wave as number | null) ?? null,
      match_score: (m.match_score as number | null) ?? null,
      distance_km: (m.distance_km as number | null) ?? null,
      notified_at: (m.notified_at as string | null) ?? null,
      viewed_at: (m.viewed_at as string | null) ?? null,
      responded_at: (m.responded_at as string | null) ?? null,
      connection_id: linked?.id ?? null,
      connection_stage: linked?.stage ?? null,
    });
    byPosition.set(positionId, list);
  }
  return byPosition;
}

/** Group active placements by position (one active per position by DB constraint). */
function groupPlacements(
  rows: ReadonlyArray<Row>,
  resolveNanny: ResolveNanny,
): Map<string, ActivePlacement> {
  const byPosition = new Map<string, ActivePlacement>();
  for (const pl of rows) {
    const positionId = pl.position_id as string | null;
    if (!positionId) continue;
    const info = resolveNanny(pl.nanny_id as string);
    byPosition.set(positionId, {
      nanny_id: pl.nanny_id as string,
      nanny_user_id: info.userId,
      nanny_name: info.name,
      hired_at: (pl.hired_at as string | null) ?? null,
      start_date: (pl.start_date as string | null) ?? null,
      weekly_hours: (pl.weekly_hours as number | null) ?? null,
      hourly_rate: (pl.hourly_rate as number | null) ?? null,
    });
  }
  return byPosition;
}

/** Resolve all user profiles + build the nanny/parent lookup maps + the nanny resolver. */
async function buildLookups(
  admin: ReturnType<typeof createAdminClient>,
  nannies: ReadonlyArray<Row>,
  parents: ReadonlyArray<Row>,
): Promise<{
  profileMap: Map<string, Profile>;
  parentUserIdMap: Map<string, string>;
  resolveNanny: ResolveNanny;
}> {
  const nannyUserIds = nannies.map((n) => n.user_id as string);
  const parentUserIds = parents.map((p) => p.user_id as string);
  const allUserIds = [...new Set([...nannyUserIds, ...parentUserIds])];

  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("user_id, first_name, last_name, suburb")
    .in("user_id", allUserIds);
  if (error) throw error;

  const profileMap = new Map<string, Profile>();
  for (const p of profiles ?? []) {
    profileMap.set(p.user_id, {
      first_name: p.first_name,
      last_name: p.last_name,
      suburb: p.suburb,
    });
  }
  const nannyUserIdMap = new Map<string, string>();
  for (const n of nannies)
    nannyUserIdMap.set(n.id as string, n.user_id as string);
  const parentUserIdMap = new Map<string, string>();
  for (const p of parents)
    parentUserIdMap.set(p.id as string, p.user_id as string);

  return {
    profileMap,
    parentUserIdMap,
    resolveNanny: makeResolveNanny(nannyUserIdMap, profileMap),
  };
}

interface AssemblyCtx {
  parentUserIdMap: Map<string, string>;
  profileMap: Map<string, Profile>;
  scheduleByPosition: Map<string, Record<string, string[]>>;
  childrenByPosition: Map<string, PositionChild[]>;
  connectionsByPosition: Map<string, PositionConnection[]>;
  dfyByPosition: Map<string, DfyMatchRow[]>;
  placementByPosition: Map<string, ActivePlacement>;
}

function assemblePosition(pos: Row, ctx: AssemblyCtx): AdminPosition {
  const parentUserId = ctx.parentUserIdMap.get(pos.parent_id as string);
  const parentProfile = parentUserId ? ctx.profileMap.get(parentUserId) : null;
  const parentName = parentProfile
    ? [parentProfile.first_name, parentProfile.last_name]
        .filter(Boolean)
        .join(" ")
    : null;

  const id = pos.id as string;
  const connections = ctx.connectionsByPosition.get(id) ?? [];
  const dfyMatches = ctx.dfyByPosition.get(id) ?? [];

  return {
    id,
    parent_id: pos.parent_id as string,
    parent_name: parentName,
    parent_user_id: parentUserId ?? null,
    suburb: (pos.suburb as string | null) ?? null,
    hourly_rate: pos.hourly_rate ? Number(pos.hourly_rate) : null,
    hours_per_week: (pos.hours_per_week as number | null) ?? null,
    status: pos.status as string,
    stage: (pos.stage as number | null) ?? null,
    position_status: (pos.position_status as number | null) ?? null,
    source: (pos.source as string | null) ?? "parent",
    family_display_name: (pos.family_display_name as string | null) ?? null,
    days_required: (pos.days_required as string[] | null) ?? null,
    schedule_type: (pos.schedule_type as string | null) ?? null,
    placement_length: (pos.placement_length as string | null) ?? null,
    description: (pos.description as string | null) ?? null,
    dfy_activated_at: (pos.dfy_activated_at as string | null) ?? null,
    dfy_tier: (pos.dfy_tier as string | null) ?? null,
    dfy_expires_at: (pos.dfy_expires_at as string | null) ?? null,
    dfy_wave_sent: toWaveList(pos.dfy_wave_sent),
    filled_at: (pos.filled_at as string | null) ?? null,
    filled_by_nanny_id: (pos.filled_by_nanny_id as string | null) ?? null,
    expires_at: (pos.expires_at as string | null) ?? null,
    created_at: pos.created_at as string,
    schedule: ctx.scheduleByPosition.get(id) ?? null,
    children: ctx.childrenByPosition.get(id) ?? [],
    connections,
    dfyMatches,
    activePlacement: ctx.placementByPosition.get(id) ?? null,
    perStageCounts: connStagesLocal(connections, dfyMatches),
  };
}

async function getPositionsData(): Promise<AdminPosition[]> {
  const admin = createAdminClient();

  // Fetch all in parallel
  const [
    positionsRes,
    childrenRes,
    connectionsRes,
    schedulesRes,
    nanniesRes,
    parentsRes,
    dfyMatchesRes,
    placementsRes,
  ] = await Promise.all([
    admin
      .from("nanny_positions")
      .select(
        "id, parent_id, suburb, hourly_rate, hours_per_week, status, stage, position_status, source, family_display_name, days_required, schedule_type, placement_length, description, dfy_activated_at, dfy_tier, dfy_expires_at, dfy_wave_sent, expires_at, created_at, filled_at, filled_by_nanny_id",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("position_children")
      .select("position_id, age_months, gender")
      .order("display_order", { ascending: true }),
    admin
      .from("connection_requests")
      .select(
        "id, position_id, nanny_id, connection_stage, source, confirmed_time, confirmed_at, created_at, responded_at, intro_outcome_reported_at, trial_reported_at",
      )
      .not("position_id", "is", null)
      .order("created_at", { ascending: false }),
    admin.from("position_schedule").select("position_id, schedule"),
    admin.from("nannies").select("id, user_id"),
    admin.from("parents").select("id, user_id"),
    admin
      .from("dfy_match_notifications")
      .select(
        "position_id, nanny_id, status, wave, match_score, distance_km, notified_at, viewed_at, responded_at",
      )
      .order("match_score", { ascending: false }),
    admin
      .from("nanny_placements")
      .select(
        "position_id, nanny_id, hired_at, start_date, weekly_hours, hourly_rate",
      )
      .eq("status", "active"),
  ]);

  const positions = (positionsRes.data ?? []) as Row[];
  const allChildren = (childrenRes.data ?? []) as Row[];
  const allConnections = (connectionsRes.data ?? []) as Row[];
  const allSchedules = (schedulesRes.data ?? []) as Row[];
  const nannies = (nanniesRes.data ?? []) as Row[];
  const parents = (parentsRes.data ?? []) as Row[];
  const allDfyMatches = (dfyMatchesRes.data ?? []) as Row[];
  const allPlacements = (placementsRes.data ?? []) as Row[];

  const scheduleByPosition = new Map<string, Record<string, string[]>>();
  for (const s of allSchedules) {
    scheduleByPosition.set(
      s.position_id as string,
      s.schedule as Record<string, string[]>,
    );
  }

  const { profileMap, parentUserIdMap, resolveNanny } = await buildLookups(
    admin,
    nannies,
    parents,
  );

  const childrenByPosition = groupChildren(allChildren);
  const { byPosition: connectionsByPosition, dfyConnByPositionNanny } =
    groupConnections(allConnections, resolveNanny);
  const dfyByPosition = groupDfyMatches(
    allDfyMatches,
    dfyConnByPositionNanny,
    resolveNanny,
  );
  const placementByPosition = groupPlacements(allPlacements, resolveNanny);

  const ctx: AssemblyCtx = {
    parentUserIdMap,
    profileMap,
    scheduleByPosition,
    childrenByPosition,
    connectionsByPosition,
    dfyByPosition,
    placementByPosition,
  };

  return positions.map((pos) => assemblePosition(pos, ctx));
}

export default async function AdminPositionsPage() {
  const positions = await getPositionsData();

  return (
    <Suspense
      fallback={<div className="p-6 text-slate-500">Loading positions...</div>}
    >
      <AdminPositionsClient positions={positions} />
    </Suspense>
  );
}
