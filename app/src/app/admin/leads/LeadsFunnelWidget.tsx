// T-032 — Tiny funnel widget for the page header.

interface LeadsFunnelWidgetProps {
  stats: {
    totalNannies: number;
    newThisWeek: number;
    contactedThisWeek: number;
    activatedThisWeek: number;
  };
}

export function LeadsFunnelWidget({ stats }: LeadsFunnelWidgetProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
      <span className="text-slate-500">This week</span>
      <Pill label="signups" value={stats.newThisWeek} colour="slate" />
      <Pill label="contacted" value={stats.contactedThisWeek} colour="blue" />
      <Pill label="activated" value={stats.activatedThisWeek} colour="green" />
    </div>
  );
}

function Pill({
  label,
  value,
  colour,
}: {
  label: string;
  value: number;
  colour: "slate" | "blue" | "green";
}) {
  const cls =
    colour === "blue"
      ? "bg-blue-100 text-blue-700"
      : colour === "green"
        ? "bg-green-100 text-green-700"
        : "bg-slate-200 text-slate-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${cls}`}
    >
      <span>{value}</span>
      <span className="font-normal opacity-80">{label}</span>
    </span>
  );
}
