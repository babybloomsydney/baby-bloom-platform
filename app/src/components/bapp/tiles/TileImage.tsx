"use client";

import { useState } from "react";
import { Download } from "lucide-react";

interface TileImageProps {
  src: string;
  alt: string;
}

async function downloadImage(url: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = blob.type.split("/")[1] || "jpg";
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `baby-bloom-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export function TileImage({ src, alt }: TileImageProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 1:1 square thumbnail in feed */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative aspect-square w-full overflow-hidden rounded-lg border border-slate-100"
      >
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
        />
      </button>

      {/* Full-size lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={src}
              alt={alt}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={() => downloadImage(src)}
              className="absolute bottom-3 right-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
