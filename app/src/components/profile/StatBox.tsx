"use client";

export function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <p className="text-xl font-bold text-violet-600">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
