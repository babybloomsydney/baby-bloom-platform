"use client";

import { useState, useCallback, useEffect, type ReactNode } from "react";

interface ExpandablePhotoProps {
  src: string;
  alt: string;
  children: ReactNode;
}

/**
 * Wraps any circular profile picture element. Clicking opens a full-screen
 * modal showing the photo in a large circle. Clicking the backdrop or
 * pressing Escape closes it.
 */
export function ExpandablePhoto({ src, alt, children }: ExpandablePhotoProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <>
      <div className="cursor-pointer" onClick={() => setOpen(true)}>
        {children}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={close}
          style={{ animation: "fade-in 150ms ease-out" }}
        >
          <div
            className="w-[75vmin] h-[75vmin] max-w-[420px] max-h-[420px] rounded-full overflow-hidden ring-4 ring-white/20 shadow-2xl"
            style={{ animation: "scale-in 200ms ease-out" }}
          >
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Inline keyframes — no external CSS needed */}
      {open && (
        <style>{`
          @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
          @keyframes scale-in { from { opacity: 0; transform: scale(0.85) } to { opacity: 1; transform: scale(1) } }
        `}</style>
      )}
    </>
  );
}
