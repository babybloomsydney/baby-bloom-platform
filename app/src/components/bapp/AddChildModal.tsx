"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, LinkIcon } from "lucide-react";

interface AddChildModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "nanny" | "parent";
  onAddNew: () => void;
  onConnectExisting: () => void;
}

export function AddChildModal({
  open,
  onOpenChange,
  role,
  onAddNew,
  onConnectExisting,
}: AddChildModalProps) {
  const connectSubtitle =
    role === "parent"
      ? "Use an invite link from your nanny"
      : "Use an invite link from a parent";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a child</DialogTitle>
          <DialogDescription>How would you like to start?</DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onAddNew();
            }}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/30"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Plus className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900">
                Add new child
              </span>
              <span className="text-xs text-slate-500">
                Create a new child profile
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onConnectExisting();
            }}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-300 hover:bg-violet-50/30"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
              <LinkIcon className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900">
                Connect existing child
              </span>
              <span className="text-xs text-slate-500">{connectSubtitle}</span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
