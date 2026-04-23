"use client";

import { useState, useRef } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  childId: string;
  onUploaded: (url: string | null) => void;
  className?: string;
}

export function ImageUpload({ childId, onUploaded, className }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Upload via API route (server actions can't handle File uploads reliably)
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("childId", childId);

      const res = await fetch("/api/upload/development-image", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (res.ok && result.url) {
        onUploaded(result.url);
      } else {
        console.error("Image upload error:", result.error);
        onUploaded(null);
      }
    } catch (err) {
      console.error("Image upload failed:", err);
      onUploaded(null);
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    setPreview(null);
    onUploaded(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("relative", className)}>
      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="Upload preview"
            className="h-32 w-full rounded-lg border border-slate-200 object-cover"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white shadow-sm hover:bg-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-20 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 text-sm text-slate-400 hover:border-slate-300 hover:text-slate-500"
        >
          <Camera className="h-4 w-4" />
          Add Photo
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
