"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfilePhotoViewerProps {
  photos: string[];
  open: boolean;
  index: number;
  firstName: string;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function ProfilePhotoViewer({ photos, open, index, firstName, onClose, onIndexChange }: ProfilePhotoViewerProps) {
  if (!open || photos.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="relative max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="relative overflow-hidden rounded-2xl bg-slate-900">
          <img
            src={photos[index]}
            alt={`${firstName}'s photo ${index + 1}`}
            className="w-full aspect-square object-cover"
          />
          {photos.length > 1 && (
            <>
              <button
                onClick={() => onIndexChange((index - 1 + photos.length) % photos.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => onIndexChange((index + 1) % photos.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
        <div className="flex justify-center gap-1.5 mt-3">
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === index ? "bg-white" : "bg-white/40"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
