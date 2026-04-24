"use client";

/**
 * ConnectionRequestTile — id-only interactive tile.
 *
 * Carries just the connection id; fetches live state on mount (and on
 * window focus) from `/api/chat/connections/[id]`. This is the first
 * interactive tile — future kinds (bsr_job, interview_reschedule etc.)
 * follow the same shape.
 *
 * Action buttons (accept / decline / schedule / cancel) are NOT wired
 * in Phase 4B.1 — the module only supports reads. Phase 4B.2 adds
 * writes with two-turn-confirm scaffolding. For now we render the
 * action prompts but route through the main-page surface so the user
 * is never blocked.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  ArrowRight,
  Loader2,
  AlertCircle,
  Clock,
  Phone,
  MapPin,
} from "lucide-react";
import type { ConnectionRequestChatTile } from "@/lib/chat/tiles";

interface ConnectionLiveData {
  id: string;
  role: "nanny" | "parent";
  counterpartyName: string;
  suburb: string | null;
  headline: string;
  nextStep: string | null;
  timeLeft: string | null;
  confirmedTime: string | null;
  nannyPhone: string | null;
  positionSummary: unknown;
}

interface ApiError {
  error: string;
}

function isError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

export function ConnectionRequestTile({
  tile,
}: {
  tile: ConnectionRequestChatTile;
}) {
  const { id } = tile.data;
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: ConnectionLiveData }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/chat/connections/${id}`, {
          cache: "no-store",
        });
        const body: unknown = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          const msg = isError(body) ? body.error : "Failed to load connection.";
          setState({ kind: "error", message: msg });
          return;
        }
        setState({ kind: "ready", data: body as ConnectionLiveData });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            err instanceof Error ? err.message : "Failed to load connection.",
        });
      }
    };

    load();

    // Refetch on window focus so the chat view catches up after the
    // user acts on the main page (accept / schedule / decline).
    const handleFocus = () => {
      void load();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading connection…
        </div>
      </article>
    );
  }

  if (state.kind === "error") {
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {state.message}
        </div>
      </article>
    );
  }

  const d = state.data;
  const actionHref = d.role === "nanny" ? "/nanny/positions" : "/parent/inbox";

  return (
    <article className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white p-3 shadow-sm">
      <header className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100">
          <MessageSquare className="h-3.5 w-3.5 text-violet-600" />
        </div>
        <span className="text-xs font-medium text-violet-700">Connection</span>
      </header>

      <div className="mt-3 space-y-2">
        <p className="text-sm font-semibold text-slate-900">{d.headline}</p>

        {d.suburb ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3 w-3" />
            {d.counterpartyName} — {d.suburb}
          </div>
        ) : null}

        {d.confirmedTime ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Clock className="h-3 w-3" />
            {new Date(d.confirmedTime).toLocaleString("en-AU", {
              timeZone: "Australia/Sydney",
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            AEST
          </div>
        ) : null}

        {d.nannyPhone ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Phone className="h-3 w-3" />
            <a
              href={`tel:${d.nannyPhone}`}
              className="text-violet-700 hover:text-violet-900"
            >
              {d.nannyPhone}
            </a>
          </div>
        ) : null}

        {d.timeLeft ? (
          <p className="text-xs italic text-slate-500">{d.timeLeft}</p>
        ) : null}

        {d.nextStep ? (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-800">
            {d.nextStep}
          </p>
        ) : null}

        <Link
          href={actionHref}
          className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-violet-700 hover:text-violet-900"
        >
          {d.nextStep ? "Open to respond" : "Open connection"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
