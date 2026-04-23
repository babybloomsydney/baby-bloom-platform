"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Home,
  ImageIcon,
  Volleyball,
  BarChart3,
  Plus,
  Wand2,
  Eye,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChildClient } from "@/types/bapp";
import { ObservationSheet } from "./sheets/ObservationSheet";
import { DiarySheet } from "./sheets/DiarySheet";
import { PlanSheet } from "./sheets/PlanSheet";

interface BAppLayoutProps {
  child: ChildClient;
  role: "nanny" | "parent";
  children: React.ReactNode;
}

const TABS = [
  { id: "feed", label: "Feed", path: "", icon: Home },
  { id: "activities", label: "Activities", path: "/activities", icon: Volleyball },
  { id: "progress", label: "Progress", path: "/progress", icon: BarChart3 },
  { id: "library", label: "Library", path: "/library", icon: ImageIcon },
] as const;

export function BAppLayout({ child, role, children }: BAppLayoutProps) {
  const pathname = usePathname();
  const [fabOpen, setFabOpen] = useState(false);
  const [observationOpen, setObservationOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const basePath = `/${role}/development/${child.id}`;
  const hubPath = `/${role}?t=education`;

  const initial = child.first_name?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Scrollable content area */}
      <div className="mx-auto max-w-lg px-4 pb-24 pt-4 space-y-4">
        {/* ═══════════════════════════════════════════════════
            HERO CARD
           ═══════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* Gradient header strip */}
          <div className="h-12 bg-gradient-to-br from-emerald-50 to-emerald-100/50" />

          <div className="px-5 pb-4">
            {/* Avatar + Name — overlaps the header strip */}
            <div className="flex items-end gap-4 -mt-8">
              <div className="relative shrink-0">
                <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-emerald-50 shadow-md">
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-emerald-500">
                    {initial}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0 pb-1 pt-4">
                <h1 className="text-2xl font-bold text-slate-900">
                  {child.first_name ?? "Child"}
                </h1>
              </div>
            </div>

            {/* Tab bar — inside the hero card */}
            <div className="mt-4 flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
              {TABS.map((tab) => {
                const tabPath = tab.path ? `${basePath}${tab.path}` : basePath;
                const isActive = pathname === tabPath;
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.id}
                    href={tabPath}
                    className={cn(
                      "flex-1 flex items-center justify-center rounded-md py-1.5 transition-all",
                      isActive
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════
            PAGE CONTENT
           ═══════════════════════════════════════════════════ */}
        {children}
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 right-4 z-40 flex flex-col-reverse items-end gap-2">
        {/* Menu items (visible when open) */}
        {fabOpen && (
          <>
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                setPlanOpen(true);
              }}
              className="flex items-center gap-2 rounded-full bg-indigo-500 py-2 pl-3 pr-4 text-sm font-medium text-white shadow-lg transition-all animate-in slide-in-from-bottom-2 duration-200"
              style={{ animationDelay: "0ms" }}
            >
              <Wand2 className="h-4 w-4" />
              Plan Activity
            </button>
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                setObservationOpen(true);
              }}
              className="flex items-center gap-2 rounded-full bg-emerald-500 py-2 pl-3 pr-4 text-sm font-medium text-white shadow-lg transition-all animate-in slide-in-from-bottom-2 duration-200"
              style={{ animationDelay: "50ms" }}
            >
              <Eye className="h-4 w-4" />
              Observation
            </button>
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                setDiaryOpen(true);
              }}
              className="flex items-center gap-2 rounded-full bg-amber-500 py-2 pl-3 pr-4 text-sm font-medium text-white shadow-lg transition-all animate-in slide-in-from-bottom-2 duration-200"
              style={{ animationDelay: "100ms" }}
            >
              <BookOpen className="h-4 w-4" />
              Diary Entry
            </button>
          </>
        )}

        {/* Main FAB button */}
        <button
          type="button"
          onClick={() => setFabOpen(!fabOpen)}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200",
            fabOpen
              ? "bg-red-500 rotate-45"
              : "bg-emerald-500"
          )}
        >
          <Plus className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Overlay when FAB is open */}
      {fabOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20"
          onClick={() => setFabOpen(false)}
        />
      )}

      {/* Observation Sheet */}
      <ObservationSheet
        open={observationOpen}
        onOpenChange={setObservationOpen}
        childId={child.id}
      />

      {/* Diary Sheet */}
      <DiarySheet
        open={diaryOpen}
        onOpenChange={setDiaryOpen}
        childId={child.id}
      />

      {/* Plan Sheet */}
      <PlanSheet
        open={planOpen}
        onOpenChange={setPlanOpen}
        childId={child.id}
      />
    </div>
  );
}
