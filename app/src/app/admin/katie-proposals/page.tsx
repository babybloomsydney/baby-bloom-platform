import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProposalCard } from "./ProposalCard";

export const dynamic = "force-dynamic";

interface Proposal {
  id: string;
  kind: string;
  target: string;
  summary: string;
  details: string | null;
  suggested_diff: string | null;
  status: string;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "implemented", label: "Implemented" },
  { value: "all", label: "All" },
] as const;

export default async function KatieProposalsPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const admin = createAdminClient();
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const role = roleRow?.role;
  if (role !== "admin" && role !== "super_admin") redirect("/");

  const statusFilter = searchParams?.status ?? "open";
  let query = admin
    .from("katie_proposals")
    .select(
      "id, kind, target, summary, details, suggested_diff, status, reviewer_notes, reviewed_at, created_at",
    );
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  const { data: proposals, error } = await query
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = ((proposals ?? []) as Proposal[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Katie proposals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Proposals filed by admin Katie for code / schema / prompt changes
            that need dev review.
          </p>
        </div>
      </div>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter by status">
        {STATUSES.map((s) => {
          const active = statusFilter === s.value;
          return (
            <Link
              key={s.value}
              href={`/admin/katie-proposals?status=${s.value}`}
              className={
                active
                  ? "rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              }
            >
              {s.label}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Failed to load proposals: {error.message}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No proposals matching this filter.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id}>
              <ProposalCard proposal={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
