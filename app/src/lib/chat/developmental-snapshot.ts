/**
 * Developmental snapshot — renders the child's milestone landscape into the
 * system prompt so Katie can reason from real data and never invent IDs.
 *
 * Why this exists (WU 10.4):
 *   - Age brackets are coarse (e.g. 12-18 months covers ~6 months of rapid
 *     growth). A 12-month-old and a 17-month-old have very different
 *     plausible-skill sets even within the same bracket.
 *   - Logging is incomplete by definition. A child can be at score 3 on
 *     "says 2-3 words" with no row for "babbles with inflection" — the
 *     earlier skill is implicitly mastered, but the data doesn't show it.
 *   - Without a complete picture, Katie either suggests skills the child
 *     has clearly outgrown, or proposes progress updates for milestones
 *     that don't actually exist (training-data confabulation).
 *
 * What this returns:
 *   A compact text block per child carrying:
 *     - Age in months (precise, not just bracket)
 *     - Current and adjacent brackets' full milestone list (id, description,
 *       observed_score). Always includes ALL previous brackets + current +
 *       next bracket. The "all previous" piece is what lets Katie infer
 *       implicit mastery from later observed scores.
 *     - Per-domain progress percent + last update timestamp.
 *
 * What this DOES NOT do:
 *   - It does not pre-compute inferred mastery. The prompt teaches Katie
 *     the inference rule (later score ≥ 3 implies earlier in same domain
 *     is at least at that level). Pre-computing would mean changing
 *     observed_score values, which would mislead other tools that read
 *     the same data fresh.
 *
 * Token cost: roughly 35 milestones × ~70 chars per row = ~2.5K tokens per
 * bracket. A 14-month-old gets ALL previous + current + next = up to 5
 * brackets = ~12K tokens per child. Acceptable until caching ships; with
 * caching, the marginal per-turn cost approaches zero.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildSummary } from "./context";

/** Canonical bracket ordering — must match seed in expand-milestones-210.sql. */
export const BRACKETS = [
  "0-3 months",
  "3-6 months",
  "6-12 months",
  "12-18 months",
  "18-24 months",
  "24-32 months",
] as const;
type Bracket = (typeof BRACKETS)[number];

const DOMAINS = ["CL", "PSE", "PD", "LIT", "NUM", "UW", "EAD"] as const;

interface MilestoneRow {
  id: string;
  domain: string;
  age_bracket: string;
  description: string;
}

interface ProgressScoreRow {
  domain: string;
  percent: number;
  scores: Record<string, number> | null;
  updated_at: string | null;
}

/**
 * Returns the brackets to include for a given child:
 * all previous + current + next (clamped to BRACKETS bounds).
 *
 * If the child's bracket isn't recognised (e.g. "32+ months", which isn't
 * seeded), we fall back to the LAST FOUR brackets — the most relevant
 * window for an older child without exploding token cost across multiple
 * children. We deliberately don't return all 6 brackets in the fallback
 * because for multi-child accounts that would 5-6× the snapshot block
 * size before caching ships.
 */
export function selectBracketsForChild(currentBracket: string): Bracket[] {
  const idx = (BRACKETS as readonly string[]).indexOf(currentBracket);
  if (idx === -1) return BRACKETS.slice(BRACKETS.length - 4);
  // Include everything from index 0 up to and including current+1 (next).
  return BRACKETS.slice(0, Math.min(idx + 2, BRACKETS.length));
}

/** Format a single milestone row as a compact one-liner. */
function fmtMilestone(m: MilestoneRow, score: number): string {
  return `  ${m.id} · ${m.description} · ${score}`;
}

/** Render relative time for the per-domain "updated" badge. */
function fmtRelative(iso: string | null, now: Date): string {
  if (!iso) return "never";
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

/**
 * Builds the developmental snapshot block for ALL children. Single DB
 * round-trip per query (milestones in one IN-clause, scores in another).
 * Returns null if there are no children.
 */
export async function buildDevelopmentalSnapshots(
  children: ChildSummary[],
  supabase: SupabaseClient,
): Promise<string | null> {
  if (children.length === 0) return null;

  // Determine the union of brackets we need to load across all children
  // so we can fetch in one query.
  const bracketSetByChild = new Map<string, Bracket[]>();
  const allBrackets = new Set<string>();
  for (const c of children) {
    const list = selectBracketsForChild(c.ageBracket);
    bracketSetByChild.set(c.id, list);
    for (const b of list) allBrackets.add(b);
  }

  // Single milestones fetch covering every bracket needed. We DON'T select
  // sort_order — the model never uses it for reasoning, and it adds ~5%
  // bytes per row across ~140 rows for multi-child families.
  const { data: milestoneRows } = await supabase
    .from("bapp_milestones")
    .select("id, domain, age_bracket, description")
    .in("age_bracket", Array.from(allBrackets))
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const allMilestones = ((milestoneRows ?? []) as MilestoneRow[]).slice();

  // Single progress fetch covering every child.
  const { data: scoreRows } = await supabase
    .from("bapp_progress_scores")
    .select("child_client_id, domain, percent, scores, updated_at")
    .in(
      "child_client_id",
      children.map((c) => c.id),
    );
  const scoresByChild = new Map<string, ProgressScoreRow[]>();
  for (const row of (scoreRows ?? []) as Array<
    ProgressScoreRow & { child_client_id: string }
  >) {
    const list = scoresByChild.get(row.child_client_id) ?? [];
    list.push(row);
    scoresByChild.set(row.child_client_id, list);
  }

  const now = new Date();
  const blocks: string[] = ["## Developmental Snapshot"];
  // Compact framing — the substantive grounding rules live in the
  // `progress_proactivity` section, no need to repeat them here. Score
  // legend is short enough to keep inline.
  blocks.push(
    "Live milestone landscape per child. Score: 0=unobserved · 1=emerging · 2=developing · 3=established · 4=secure. Use ONLY ids that appear here.",
  );

  for (const child of children) {
    const childScores = scoresByChild.get(child.id) ?? [];
    const observed = new Map<string, number>();
    const domainSummary = new Map<
      string,
      { percent: number; updated_at: string | null }
    >();
    for (const row of childScores) {
      domainSummary.set(row.domain, {
        percent: Number(row.percent ?? 0),
        updated_at: row.updated_at,
      });
      if (!row.scores) continue;
      for (const [mid, sc] of Object.entries(row.scores)) {
        if (typeof sc === "number") observed.set(mid, sc);
      }
    }

    const childBrackets = bracketSetByChild.get(child.id) ?? [];
    const currentBracket = child.ageBracket;

    blocks.push("");
    blocks.push(
      `### ${child.firstName} — ${child.ageMonths}mo (current bracket: ${currentBracket})`,
    );

    // Per-domain summary line
    const summaryParts = DOMAINS.map((d) => {
      const s = domainSummary.get(d);
      if (!s) return `${d} 0%`;
      return `${d} ${Math.round(s.percent)}% (${fmtRelative(s.updated_at, now)})`;
    });
    blocks.push(`Progress: ${summaryParts.join(" · ")}`);

    // Per-bracket milestone listing. Compute currentBracket's index ONCE
    // and guard isNext on it being a real bracket — without the guard,
    // an unrecognised currentBracket (-1) would mistag bracket-index-0
    // as NEXT for every fallback child.
    const currentIdx = (BRACKETS as readonly string[]).indexOf(currentBracket);
    for (const bracket of childBrackets) {
      const isCurrent = bracket === currentBracket;
      const isNext =
        currentIdx !== -1 && BRACKETS.indexOf(bracket) === currentIdx + 1;
      // Tag tags — short. The semantics (NEXT = peek-for-stretch only)
      // are taught in `progress_proactivity`; no need to restate inline.
      const tag = isCurrent ? " [CURRENT]" : isNext ? " [NEXT]" : "";

      blocks.push("");
      blocks.push(`${bracket}${tag}:`);
      // Group by domain for readability
      const byDomain = new Map<string, MilestoneRow[]>();
      for (const m of allMilestones) {
        if (m.age_bracket !== bracket) continue;
        const list = byDomain.get(m.domain) ?? [];
        list.push(m);
        byDomain.set(m.domain, list);
      }
      for (const d of DOMAINS) {
        const ms = byDomain.get(d);
        if (!ms || ms.length === 0) continue;
        for (const m of ms) {
          blocks.push(fmtMilestone(m, observed.get(m.id) ?? 0));
        }
      }
    }
  }

  return blocks.join("\n");
}
