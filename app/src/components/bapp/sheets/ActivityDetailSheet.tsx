"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Target,
  Heart,
  ShoppingBasket,
  Footprints,
  MessageSquare,
  Search,
  AlertTriangle,
} from "lucide-react";
import { DomainBadge } from "../shared/DomainBadge";
import { ReviewSheet } from "./ReviewSheet";
import type { FeedItem, ActivityData, ActivityPlan } from "@/types/bapp";
import type { Milestone } from "@/types/bapp";

interface ActivityDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FeedItem | null;
  milestones: Milestone[];
}

export function ActivityDetailSheet({
  open,
  onOpenChange,
  item,
  milestones,
}: ActivityDetailSheetProps) {
  const [reviewOpen, setReviewOpen] = useState(false);

  if (!item) return null;

  const data = item.data as unknown as ActivityData;
  const plan = data.activity_json;

  if (!plan) return null;

  // Resolve milestone details for ReviewSheet
  const targetMilestones = milestones.filter((m) =>
    data.milestone_ids?.includes(m.id)
  );

  function handleReportComplete() {
    setReviewOpen(false);
    onOpenChange(false);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[95vh] rounded-t-2xl bg-white px-4 pb-24"
        >
          <SheetHeader className="pb-2">
            <SheetTitle className="text-left text-lg font-semibold text-slate-900">
              {plan.creativeName}
            </SheetTitle>
            <p className="text-xs text-indigo-500">{plan.recommendedLine}</p>
          </SheetHeader>

          <div
            className="mt-3 overflow-y-auto"
            style={{ maxHeight: "calc(95vh - 160px)" }}
          >
            {/* Description card */}
            <div className="mb-4 rounded-lg bg-slate-50 p-3">
              <p className="text-sm text-slate-600">
                {plan.activityDescription}
              </p>
            </div>

            {/* 6 Accordion sections */}
            <Accordion type="multiple" className="space-y-1">
              {/* 1. Objectives */}
              <AccordionItem value="objectives" className="rounded-lg border border-slate-200 px-3">
                <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-indigo-500" />
                    Objectives
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <ul className="space-y-2">
                    {plan.objectivesList.map((obj, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-400" />
                        <span className="text-sm text-slate-600">{obj}</span>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>

              {/* 2. Intention */}
              <AccordionItem value="intention" className="rounded-lg border border-slate-200 px-3">
                <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-rose-400" />
                    Intention
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <p className="text-sm italic text-slate-500">
                    &ldquo;{plan.intention}&rdquo;
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* 3. Supplies */}
              <AccordionItem value="supplies" className="rounded-lg border border-slate-200 px-3">
                <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                  <span className="flex items-center gap-2">
                    <ShoppingBasket className="h-4 w-4 text-amber-500" />
                    Supplies
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3 space-y-2">
                  <ul className="space-y-1">
                    {plan.supplies.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-slate-600"
                      >
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                        {s}
                      </li>
                    ))}
                  </ul>
                  {plan.suppliesDisclaimer && (
                    <div className="flex items-start gap-2 rounded-lg bg-orange-50 p-2.5">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-orange-500" />
                      <p className="text-xs text-orange-700">
                        {plan.suppliesDisclaimer}
                      </p>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* 4. Step-by-Step */}
              <AccordionItem value="steps" className="rounded-lg border border-slate-200 px-3">
                <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Footprints className="h-4 w-4 text-emerald-500" />
                    Step-by-Step
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <ol className="space-y-3">
                    {plan.activityGuide.map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                          {i + 1}
                        </span>
                        <p className="text-sm text-slate-600">{step}</p>
                      </li>
                    ))}
                  </ol>
                </AccordionContent>
              </AccordionItem>

              {/* 5. Encouragement */}
              <AccordionItem value="encouragement" className="rounded-lg border border-slate-200 px-3">
                <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-indigo-500" />
                    Encouragement
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="space-y-2">
                    {plan.encouragementTips.map((tip, i) => (
                      <div
                        key={i}
                        className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700"
                      >
                        {tip}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* 6. What to Look For */}
              <AccordionItem value="observations" className="rounded-lg border border-slate-200 px-3">
                <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-purple-500" />
                    What to Look For
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <div className="space-y-4">
                    {plan.keyObservations.map((obs, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <DomainBadge domain={obs.domain} />
                          <span className="text-sm font-medium text-slate-700">
                            {obs.objective}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <LevelCard
                            label="Introduced"
                            text={obs.levels.introduced}
                          />
                          <LevelCard
                            label="Assisted"
                            text={obs.levels.assisted}
                          />
                          <LevelCard
                            label="Guided"
                            text={obs.levels.guided}
                          />
                          <LevelCard
                            label="Independent"
                            text={obs.levels.independent}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Bottom CTA — always available so activities can be repeated */}
          <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4">
            <Button
              onClick={() => setReviewOpen(true)}
              className="w-full bg-emerald-500 hover:bg-emerald-600"
            >
              Log Activity
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Review Sheet */}
      <ReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        activityId={item.id}
        childId={item.child_client_id}
        activityTitle={plan.creativeName}
        milestones={targetMilestones}
        onComplete={handleReportComplete}
      />
    </>
  );
}

function LevelCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-xs text-slate-600">{text}</p>
    </div>
  );
}
