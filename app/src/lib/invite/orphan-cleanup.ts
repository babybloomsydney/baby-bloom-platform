/**
 * Pure helper for the orphan-cleanup cron. Keeps the retention window
 * + cutoff math out of the route file so both the route and the test
 * share one source of truth.
 *
 * Spec: `06-edge-cases-and-cleanup.md §3.3`. A child enters orphan
 * limbo when its nanny calls `nannyLeaveChild` while no parent is
 * linked. After 365 calendar days with no recovery, the row is hard-
 * deleted (cascade clears events / bapp_logs / invites).
 */

export const ORPHAN_RETENTION_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function orphanCleanupCutoff(now: Date): string {
  return new Date(
    now.getTime() - ORPHAN_RETENTION_DAYS * MS_PER_DAY,
  ).toISOString();
}
