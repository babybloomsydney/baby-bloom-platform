"use client";

/**
 * KatieActionMenu — the Plus button next to Katie's input. Opens a
 * popover menu with quick actions:
 *
 *   - Attach an image (file picker → upload → attaches to next user
 *     message; Katie reads the URL as text context, then drives the
 *     draft-tile flow with the image already in hand)
 *   - Log food / Log sleep / Log observation / Design activity /
 *     Update progress / Custom note (stubbed in 8.22a; each shortcut
 *     ships in 8.22d as a synthetic user message that triggers
 *     Katie's propose_X flow)
 *
 * The menu is a parallel surface to the input — manual shortcuts
 * here behave as if the user typed the corresponding prompt
 * ("Log Oliver's breakfast", etc.) and pressed send. They flow
 * through the same draft-tile pattern Katie uses for AI-driven
 * logs.
 */

import { useRef, useState } from "react";
import {
  Plus,
  Loader2,
  Image as ImageIcon,
  UtensilsCrossed,
  Moon,
  Eye,
  Sparkles,
  TrendingUp,
  StickyNote,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useImageAttachment } from "./image-attachment-context";

// Mirrors the server allowlist in `/api/chat/upload`. Keeping these
// in sync prevents a client-allowed file from getting a generic 415
// from the server with no useful message.
const ACCEPTED_TYPES_LIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;
const ACCEPTED_TYPES_ATTR = ACCEPTED_TYPES_LIST.join(",");
const ACCEPTED_TYPES_SET: ReadonlySet<string> = new Set(ACCEPTED_TYPES_LIST);
const MAX_BYTES = 10 * 1024 * 1024;

interface KatieActionMenuProps {
  disabled?: boolean;
}

export function KatieActionMenu({ disabled = false }: KatieActionMenuProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { setAttachment, setError } = useImageAttachment();
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);

  function handleAttachImage() {
    setOpen(false);
    // Defer so the dropdown closes before the native file picker opens —
    // some browsers don't show the picker if it races with focus changes.
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later

    // Restore focus to the Plus trigger after the OS file picker
    // closes (whether the user picked a file or cancelled). Without
    // this, focus lands on the hidden sr-only input which has no
    // visible affordance — tab order from there is unpredictable
    // for keyboard / SR users.
    triggerRef.current?.focus();

    if (!file) return;

    if (file.size > MAX_BYTES) {
      setError(
        `Image is too large (max ${Math.floor(MAX_BYTES / 1024 / 1024)} MB).`,
      );
      return;
    }
    if (!ACCEPTED_TYPES_SET.has(file.type)) {
      setError(
        `Unsupported image type${file.type ? ` (${file.type})` : ""}. ` +
          `Try a JPEG, PNG, WebP, GIF, or HEIC.`,
      );
      return;
    }

    setError(null);
    setUploading(true);

    const previewUrl = URL.createObjectURL(file);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData,
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        URL.revokeObjectURL(previewUrl);
        setError(body.error ?? "Upload failed.");
        return;
      }
      setAttachment({ url: body.url, previewUrl });
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Stubbed manual-log shortcuts — these will dispatch synthetic user
  // messages in 8.22d. For now they're visible-but-disabled so users
  // can see the planned shape. Keeping them in the menu (rather than
  // hidden) is intentional: it sets the expectation that the Plus
  // button is the "add anything" surface, not just an image picker.
  const stubItems: Array<{ label: string; icon: typeof Plus }> = [
    { label: "Log food", icon: UtensilsCrossed },
    { label: "Log sleep", icon: Moon },
    { label: "Log observation", icon: Eye },
    { label: "Design activity", icon: Sparkles },
    { label: "Update progress", icon: TrendingUp },
    { label: "Custom note", icon: StickyNote },
  ];

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES_ATTR}
        onChange={handleFileChosen}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled || uploading}
            aria-label={uploading ? "Uploading…" : "Add to chat"}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="text-xs">Add to chat</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleAttachImage} className="gap-2">
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            Attach an image
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-slate-400">
            Quick log (coming soon)
          </DropdownMenuLabel>
          {stubItems.map(({ label, icon: Icon }) => (
            <DropdownMenuItem key={label} disabled className="gap-2 opacity-60">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
