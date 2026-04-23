"use client";

import { useMemo } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  Eye,
  CalendarDays,
  Trophy,
} from "lucide-react";
import { DOMAINS, DOMAIN_CODES } from "@/lib/bapp-constants";
import type { DomainCode } from "@/lib/bapp-constants";
import type { DashboardData } from "@/types/bapp";

interface BAppProgressViewProps {
  dashboard: DashboardData | null;
}

export function BAppProgressView({ dashboard }: BAppProgressViewProps) {
  // Build radar data — always 7 axes even with no data
  const radarData = useMemo(() => {
    return DOMAIN_CODES.map((code) => ({
      domain: DOMAINS[code].short,
      value: dashboard?.domains[code]?.percent ?? 0,
      fullMark: 100,
    }));
  }, [dashboard]);

  const hasData = dashboard !== null && Object.keys(dashboard.domains).length > 0;

  const stats = dashboard?.stats;

  // Resolve strongest domain label
  const strongestLabel = stats?.strongestDomain
    ? DOMAINS[stats.strongestDomain as DomainCode]?.short ?? stats.strongestDomain
    : "—";

  return (
    <div className="space-y-5">
      {/* Radar chart card */}
      <div className="relative rounded-xl border border-slate-200 bg-white p-4">
        {/* Live badge */}
        <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-semibold text-emerald-600">
            Live
          </span>
        </div>

        <h2 className="text-sm font-semibold text-slate-800">
          Development Overview
        </h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Progress across all 7 domains
        </p>

        <div className="mt-4 h-64">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis
                  dataKey="domain"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  dataKey="value"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm text-slate-400">
                Start logging activities to see progress
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Domain breakdown */}
      {hasData && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            By Domain
          </h3>
          <div className="space-y-1.5">
            {DOMAIN_CODES.map((code) => {
              const pct = dashboard?.domains[code]?.percent ?? 0;
              return (
                <DomainBar key={code} code={code} percent={pct} />
              );
            })}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Activity className="h-4 w-4 text-indigo-500" />}
          label="Activities"
          value={String(stats?.totalActivities ?? 0)}
        />
        <StatCard
          icon={<Eye className="h-4 w-4 text-emerald-500" />}
          label="Observations"
          value={String(stats?.totalObservations ?? 0)}
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4 text-blue-500" />}
          label="Days Active"
          value={String(stats?.daysActive ?? 0)}
        />
        <StatCard
          icon={<Trophy className="h-4 w-4 text-amber-500" />}
          label="Strongest"
          value={strongestLabel}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain progress bar
// ---------------------------------------------------------------------------

const DOMAIN_BAR_COLORS: Record<string, string> = {
  CL: "bg-blue-500",
  PSE: "bg-pink-500",
  PD: "bg-green-500",
  LIT: "bg-purple-500",
  NUM: "bg-orange-500",
  UW: "bg-teal-500",
  EAD: "bg-amber-500",
};

function DomainBar({ code, percent }: { code: DomainCode; percent: number }) {
  const domain = DOMAINS[code];
  const barColor = DOMAIN_BAR_COLORS[code] ?? "bg-slate-400";

  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">
          {domain.short}
        </span>
        <span className="text-xs font-semibold text-slate-800">
          {percent}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2">{icon}</div>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
