"use client";

/**
 * Identity card rendered at the top of the settings landing.
 * Shows who's signed in — name, email, role — with optional
 * verification badge. The earlier "encrypted in transit and at
 * rest" trust strip was removed per user feedback (2026-05-07);
 * the brand itself is the trust signal, the strip felt
 * over-explanatory.
 */

import { type ReactNode } from "react";

interface IdentityCardProps {
  fullName: string;
  email: string;
  roleLabel: string;
  verificationBadge?: ReactNode;
  avatarUrl?: string | null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export function IdentityCard({
  fullName,
  email,
  roleLabel,
  verificationBadge,
  avatarUrl,
}: IdentityCardProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-4 px-5 py-5">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-violet-50">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={fullName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-violet-600">
              {initialsOf(fullName)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">
            {fullName || "Your account"}
          </p>
          <p className="truncate text-xs text-slate-500">
            {email} · {roleLabel}
          </p>
        </div>
        {verificationBadge}
      </div>
    </section>
  );
}
