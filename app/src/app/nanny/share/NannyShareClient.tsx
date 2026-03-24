"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionStatusBadge } from "@/app/nanny/verification/sections/SectionStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ThumbsUp,
  MessageCircle,
  Share2,
  AlertCircle,
  ShieldCheck,
  Link2,
  Upload,
  ExternalLink,
  Check,
  Users,
  X,
  Globe,
} from "lucide-react";
import { uploadFileWithProgress } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/client";
import {
  markShareCompleted,
  submitShareScreenshot,
} from "@/lib/actions/viral-loop";
import {
  SHARE_STATUS,
  isShareAccessGranted,
  type ViralShareRow,
} from "@/lib/viral-loop/constants";
import { recordInformedAction } from "@/lib/legal/record-consent";
import Link from "next/link";

// ── Types ──

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface NannyShareData {
  nannyId: string;
  firstName: string;
  age: number | null;
  profilePicUrl: string | null;
  suburb: string | null;
  parentPitch: string | null;
  share: ViralShareRow | null;
}

interface Props {
  initialData: NannyShareData;
}

// ── Facebook SDK types ──

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: { appId: string; xfbml: boolean; version: string }) => void;
      ui: (params: Record<string, string>, callback?: (response: unknown) => void) => void;
    };
  }
}

const FB_APP_ID = "4009164676060901";

// ── Step Indicator (same pattern as verification page) ──

type StepState = "completed" | "current" | "future";

function stepLineColor(step: StepState): string {
  return step === "completed" ? "bg-green-300" : step === "current" ? "bg-violet-200" : "bg-slate-200";
}

function StepIndicator({ state, isFirst, isLast, topLineColor }: {
  state: StepState;
  isFirst?: boolean;
  isLast?: boolean;
  topLineColor?: string;
}) {
  const isCompleted = state === "completed";
  const isCurrent = state === "current";

  return (
    <div className="flex w-7 shrink-0 flex-col items-center">
      <div className={`w-0.5 h-3.5 ${!isFirst && topLineColor ? topLineColor : "bg-transparent"}`} />
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
          isCompleted
            ? "border-green-500 bg-green-500"
            : isCurrent
            ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200"
            : "border-slate-200 bg-white"
        }`}
      >
        {isCompleted && <Check className="h-4 w-4 text-white" />}
        {isCurrent && <div className="h-2.5 w-2.5 rounded-full bg-violet-500" />}
      </div>
      {!isLast && <div className={`w-0.5 flex-1 ${stepLineColor(state)}`} />}
    </div>
  );
}

// ── Component ──

export function NannyShareClient({ initialData }: Props) {
  const [share, setShare] = useState<ViralShareRow | null>(initialData.share);
  const [copyFeedback, setCopyFeedback] = useState<"text" | "link" | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postExpanded, setPostExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);

  const status = share?.share_status ?? SHARE_STATUS.READY;
  const isAccessGranted = isShareAccessGranted(status);

  // Initialize local state from server status
  useEffect(() => {
    if (status >= SHARE_STATUS.SHARED) {
      setHasCopied(true);
      setHasShared(true);
    }
  }, [status]);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  // Load Facebook SDK
  useEffect(() => {
    if (window.FB) return;
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: FB_APP_ID, xfbml: true, version: "v21.0" });
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    document.body.appendChild(script);
  }, []);

  // Screenshot upload state
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [sessionFailReason, setSessionFailReason] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { uploadAbortRef.current?.abort(); };
  }, []);

  // ── Step states ──

  const copyStep: StepState = hasCopied ? "completed" : "current";
  const shareStep: StepState = hasShared ? "completed" : hasCopied ? "current" : "future";
  const uploadStep: StepState = isAccessGranted
    ? "completed"
    : hasShared
    ? "current"
    : "future";
  const goalStep: StepState = isAccessGranted ? "completed" : "future";

  const shareLocked = !hasCopied;
  const uploadLocked = !hasShared;

  // Default open section based on current progress
  const getDefaultOpen = useCallback((): string[] => {
    if (isAccessGranted) return [];
    if (status === SHARE_STATUS.FAILED) return ["upload"];
    if (status >= SHARE_STATUS.SUBMITTED) return ["upload"];
    if (hasShared) return ["upload"];
    if (hasCopied) return ["share"];
    return ["how-it-works"];
  }, [status, isAccessGranted, hasShared, hasCopied]);

  const [openSections, setOpenSections] = useState<string[]>(getDefaultOpen());

  // ── Auto-scroll to CTA when a section opens ──

  const prevSections = useRef<string[]>(openSections);

  const scrollToSection = useCallback((id: string, delay = 350) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        const headerOffset = 80; // 64px sticky navbar + 16px padding
        window.scrollTo({ top: window.scrollY + rect.top - headerOffset, behavior: 'smooth' });
      }
    }, delay);
  }, []);

  useEffect(() => {
    const newlyOpened = openSections.filter(s => !prevSections.current.includes(s));
    prevSections.current = openSections;
    if (newlyOpened.length > 0) {
      const last = newlyOpened[newlyOpened.length - 1];
      const sectionMap: Record<string, string> = {
        'copy': 'section-copy',
        'share': 'section-share',
        'upload': 'section-upload',
      };
      if (sectionMap[last]) scrollToSection(sectionMap[last]);
    }
  }, [openSections, scrollToSection]);

  // ── Clipboard ──

  const cleanPitch = initialData.parentPitch ? stripHtml(initialData.parentPitch) : null;
  const profileUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/nannies/${initialData.nannyId}`;

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }, []);

  const handleCopyPost = useCallback(async () => {
    if (!cleanPitch) return;
    await copyToClipboard(cleanPitch);
    setCopyFeedback("text");
    setHasCopied(true);
    setOpenSections(["share"]);
    setTimeout(() => setCopyFeedback(null), 2000);
  }, [cleanPitch, copyToClipboard]);

  const handleCopyLink = useCallback(async () => {
    await copyToClipboard(profileUrl);
    setCopyFeedback("link");
    setTimeout(() => setCopyFeedback(null), 2000);
  }, [profileUrl, copyToClipboard]);

  // ── Mark share as completed ──

  const markAsShared = useCallback(async () => {
    if (!share?.id || isMarking) return;
    setIsMarking(true);
    setError(null);

    recordInformedAction({
      agreementId: 'AGR-12',
      buttonText: 'Shared to Facebook',
      modalContentVersion: 'v3.0-2026-03-23',
      relatedEntityId: share.id,
    }).catch(() => {});

    const result = await markShareCompleted(share.id);
    if (result.success) {
      setShare((prev) =>
        prev ? { ...prev, share_status: SHARE_STATUS.SHARED, shared_at: new Date().toISOString() } : prev
      );
      setHasShared(true);
      setOpenSections(["upload"]);
    } else {
      setError(result.error ?? "Failed to update share status");
    }
    setIsMarking(false);
  }, [share?.id, isMarking]);

  // ── Mobile: native share ──

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: `${initialData.firstName} — Baby Bloom Nanny`,
        text: cleanPitch ?? "",
        url: profileUrl,
      });
      await markAsShared();
    } catch {
      // User cancelled the share sheet
    }
  }, [profileUrl, cleanPitch, initialData.firstName, markAsShared]);

  // ── Desktop: Facebook sharer ──

  const handleFacebookShare = useCallback(() => {
    const sharerUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}&quote=${encodeURIComponent(cleanPitch ?? "")}`;
    window.open(sharerUrl, "_blank");
  }, [profileUrl, cleanPitch]);

  // ── Upload screenshot + trigger AI check ──

  const handleScreenshotSelect = useCallback(
    async (file: File) => {
      const validTypes = ["image/png", "image/jpeg", "image/webp"];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!validTypes.includes(file.type) && !["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) {
        setUploadError("Please upload a PNG, JPEG, or WebP image");
        return;
      }

      setUploadState("uploading");
      setUploadProgress(0);
      setUploadError(null);
      setError(null);

      uploadAbortRef.current?.abort();
      const uploadCtrl = new AbortController();
      uploadAbortRef.current = uploadCtrl;

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUploadState("error");
        setUploadError("Not authenticated — please refresh the page");
        return;
      }

      const result = await uploadFileWithProgress(
        "share-screenshots", user.id, file,
        (p) => setUploadProgress(p),
        uploadCtrl.signal
      );

      if (result.error || !result.url) {
        setUploadState("error");
        setUploadError(result.error ?? "Upload failed");
        return;
      }

      setUploadState("done");

      if (!share?.id) return;
      setIsChecking(true);

      const submitResult = await submitShareScreenshot(share.id, result.url);
      if (!submitResult.success) {
        setError(submitResult.error ?? "Failed to submit screenshot");
        setIsChecking(false);
        return;
      }

      setShare((prev) =>
        prev ? { ...prev, share_status: SHARE_STATUS.SUBMITTED, screenshot_url: result.url } : prev
      );

      // Race the AI check against a 15-second timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const checkRes = await fetch("/api/check-share-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId: share.id }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const checkResult = await checkRes.json();

        if (checkResult.success) {
          if (checkResult.approved) {
            setShare((prev) =>
              prev
                ? { ...prev, share_status: SHARE_STATUS.APPROVED, approved_at: new Date().toISOString() }
                : prev
            );
          } else {
            const reason = checkResult.failReason ?? "Screenshot did not pass verification";
            setShare((prev) =>
              prev
                ? {
                    ...prev,
                    share_status: SHARE_STATUS.FAILED,
                    failed_at: new Date().toISOString(),
                    fail_reason: reason,
                  }
                : prev
            );
            setSessionFailReason(reason);
          }
        } else {
          setError(checkResult.error ?? "Screenshot check failed");
        }
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Verification is taking longer than expected. Please refresh the page and try again.");
        } else {
          setError("Screenshot check failed — please try again");
        }
      }

      setIsChecking(false);
    },
    [share?.id]
  );

  // ── Badge helpers ──

  const getUploadBadgeStatus = () => {
    if (isAccessGranted) return "verified" as const;
    if (status === SHARE_STATUS.SUBMITTED || status === SHARE_STATUS.PROCESSING || isChecking)
      return "processing" as const;
    if (status === SHARE_STATUS.FAILED) return "failed" as const;
    return null;
  };

  // ── No parent pitch ──

  if (!cleanPitch) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Share Your Profile</h1>
        <div className="rounded-lg border p-6 text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-3" />
          <p className="text-slate-600">Your AI-generated Facebook post isn&apos;t ready yet.</p>
          <p className="text-sm text-slate-400 mt-1">Complete your profile to generate your share content.</p>
        </div>
      </div>
    );
  }

  // ── Main render ──

  return (
    <div className="mx-auto max-w-2xl overflow-x-hidden rounded-2xl border border-slate-200 bg-white shadow-sm p-5 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 text-center">Share your profile to unlock babysitting</h1>
        {isAccessGranted ? (
          <p className="text-sm text-green-600 mt-1 font-medium flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Your share has been verified! Babysitting requests are now unlocked.
          </p>
        ) : (
          <p className="text-sm text-slate-500 mt-1">
            
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}

      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
        {/* How it works — meet and greet guidance */}
        <AccordionItem value="how-it-works" className="border rounded-lg mb-4 overflow-hidden">
            <AccordionTrigger className="hover:no-underline px-4">
              <span className="text-base font-semibold text-slate-800">How it works</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 space-y-3">
                <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
                  <li>Copy your post</li>
                  <li>Share to Facebook group</li>
                  <li>Upload proof</li>
                  <li>Get babysitting jobs!</li>
                </ol>
                <p className="text-xs text-slate-400">
                  In less than 2 minutes we will be able to receive babysitting jobs!
                </p>
                <Button
                  id="cta-how-it-works"
                  onClick={() => {
                    setOpenSections(["copy"]);
                    scrollToSection("section-copy", 50);
                  }}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  I&apos;m ready!
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

        {/* Step 1: Copy your post */}
        <div id="section-copy" className="flex gap-3">
          <StepIndicator state={copyStep} isFirst />
          <div className="flex-1 min-w-0 overflow-hidden pb-3">
            <AccordionItem value="copy" className="border-0">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-slate-800">Copy your post</span>
                  {hasCopied && <SectionStatusBadge status="verified" customLabel="Copied" />}
                </div>
              </AccordionTrigger>
              <AccordionContent forceMount className="overflow-hidden">
                <p className="text-xs text-slate-400 mb-3">
                  We created the perfect post just for you which is designed to get parents messaging you directly for your services
                </p>
                {/* Facebook Preview Card */}
                <div className="rounded-lg border overflow-hidden bg-white mb-3 w-full max-w-full">
                  {/* Header */}
                  <div className="flex items-center gap-3 p-3">
                    {initialData.profilePicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={initialData.profilePicUrl}
                        alt="Profile"
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center">
                        <span className="text-violet-600 font-semibold text-sm">
                          {initialData.firstName.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[#050505]">{initialData.firstName}</p>
                      <p className="text-xs text-[#65676b]">Just now</p>
                    </div>
                  </div>

                  {/* Post content */}
                  <div
                    className="px-3 pb-3 cursor-pointer overflow-hidden"
                    onClick={() => setPostExpanded((prev) => !prev)}
                  >
                    {(() => {
                      if (!initialData.parentPitch) return null;
                      const segments = initialData.parentPitch.split(/<br\s*\/?>/gi);
                      // Mobile: truncate after first 3 non-empty lines; Desktop: after 3 segments
                      let needsTruncate: boolean;
                      let cutIndex: number;
                      if (isMobile) {
                        const nonEmpty = segments.map((seg, idx) => ({ seg, idx })).filter(({ seg }) => seg.replace(/<[^>]+>/g, "").trim().length > 0);
                        needsTruncate = nonEmpty.length > 2;
                        cutIndex = (nonEmpty[1]?.idx ?? 1) + 1;
                      } else {
                        needsTruncate = segments.length > 2;
                        cutIndex = 2;
                      }
                      const visibleSegments = needsTruncate && !postExpanded
                        ? segments.slice(0, cutIndex)
                        : segments;

                      return (
                        <p className="text-sm text-[#050505] leading-relaxed break-words">
                          {visibleSegments.map((seg, i) => (
                            <span key={i}>
                              {i > 0 && <br />}
                              {seg.replace(/<[^>]+>/g, "")}
                            </span>
                          ))}
                          {needsTruncate && !postExpanded && (
                            <>{"... "}<span className="text-[#65676b] hover:underline">See more</span></>
                          )}
                          {needsTruncate && postExpanded && (
                            <>{" "}<span className="text-[#65676b] hover:underline">See less</span></>
                          )}
                        </p>
                      );
                    })()}
                  </div>

                  {/* Link preview */}
                  <div className="mx-3 mb-3 rounded-lg border border-[#ddd] overflow-hidden bg-[#f0f2f5]">
                    <div className="aspect-[1.91/1] bg-white overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/og/nanny-v2/${initialData.nannyId}`}
                        alt="Link preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-3 border-t border-[#ddd]">
                      <p className="text-xs text-[#65676b]">babybloomsydney.com.au</p>
                      <p className="text-sm font-semibold text-[#050505] mt-0.5">
                        {initialData.firstName} now has availability to Nanny &amp; Babysit | see availability now
                      </p>
                    </div>
                  </div>

                  {/* Reactions bar — hidden on desktop to save space */}
                  <div className="flex md:hidden items-center justify-between px-3 py-2 border-t border-[#ddd] text-xs text-[#65676b]">
                    <div className="flex items-center gap-1">
                      <span>👍❤️😊</span>
                      <span>12</span>
                    </div>
                    <span>6 comments</span>
                  </div>

                  {/* Footer — hidden on desktop to save space */}
                  <div className="flex md:hidden border-t border-[#ddd]">
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-[#65676b] cursor-default">
                      <ThumbsUp className="h-4 w-4" /> Like
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-[#65676b] cursor-default">
                      <MessageCircle className="h-4 w-4" /> Comment
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-[#65676b] cursor-default">
                      <Share2 className="h-4 w-4" /> Share
                    </div>
                  </div>
                </div>

                <Button
                  id="cta-copy"
                  onClick={handleCopyPost}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {copyFeedback === "text" ? (
                    <><CheckCircle2 className="mr-2 h-4 w-4" /> Copied!</>
                  ) : (
                    <><Copy className="mr-2 h-4 w-4" /> Copy Post Text</>
                  )}
                </Button>
              </AccordionContent>
            </AccordionItem>
          </div>
        </div>

        {/* Step 2: Share to Facebook */}
        <div id="section-share" className="flex gap-3">
          <StepIndicator state={shareStep} topLineColor={stepLineColor(copyStep)} />
          <div className="flex-1 min-w-0 overflow-hidden pb-3">
            <AccordionItem value="share" className="border-0" disabled={shareLocked}>
              <AccordionTrigger className="hover:no-underline" disabled={shareLocked}>
                <div className="flex items-center gap-3">
                  <span className={`text-base font-semibold ${shareLocked ? "text-slate-400" : "text-slate-800"}`}>
                    Share to Facebook group
                  </span>
                  {hasShared && <SectionStatusBadge status="verified" customLabel="Shared" />}
                </div>
              </AccordionTrigger>
              <AccordionContent forceMount>
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">
                    Share your profile to a relevant Facebook group.
                  </p>
                  <p className="text-[10px] text-slate-400">
                    By sharing, you agree to the{" "}
                    <Link href="/legal/professional-terms" target="_blank" className="text-violet-500 hover:underline">Professional Terms</Link>
                    {" "}&amp;{" "}
                    <Link href="/legal/privacy-policy" target="_blank" className="text-violet-500 hover:underline">Privacy Policy</Link>.
                  </p>

                  {isMobile ? (
                    <>
                      <Button
                        onClick={handleNativeShare}
                        disabled={isMarking}
                        className="w-full bg-[#1877F2] hover:bg-[#1666d1] text-white"
                      >
                        {isMarking ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sharing...</>
                        ) : (
                          <><Share2 className="mr-2 h-4 w-4" /> Share</>
                        )}
                      </Button>
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={markAsShared}
                          disabled={isMarking}
                          className="text-xs text-violet-600 hover:underline"
                        >
                          Already shared!
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-3">
                        <Button
                          onClick={handleCopyLink}
                          variant="outline"
                          className="flex-1 border-violet-300 text-violet-700 hover:bg-violet-50"
                        >
                          {copyFeedback === "link" ? (
                            <><CheckCircle2 className="mr-2 h-4 w-4" /> Copied!</>
                          ) : (
                            <><Link2 className="mr-2 h-4 w-4" /> Copy Link</>
                          )}
                        </Button>
                        <Button
                          onClick={handleFacebookShare}
                          className="flex-1 bg-[#1877F2] hover:bg-[#1666d1] text-white"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" /> Open Facebook
                        </Button>
                      </div>
                      <Button
                        onClick={markAsShared}
                        disabled={isMarking}
                        variant="outline"
                        className="w-full border-green-300 text-green-700 hover:bg-green-50"
                      >
                        {isMarking ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
                        ) : (
                          <><CheckCircle2 className="mr-2 h-4 w-4" /> Done, I&apos;ve shared it</>
                        )}
                      </Button>
                    </div>
                  )}
                  <div id="cta-share" />
                </div>
              </AccordionContent>
            </AccordionItem>
          </div>
        </div>

        {/* Step 3: Upload proof */}
        <div id="section-upload" className="flex gap-3">
          <StepIndicator state={uploadStep} topLineColor={stepLineColor(shareStep)} />
          <div className="flex-1 min-w-0 overflow-hidden pb-3">
            <AccordionItem value="upload" className="border-0" disabled={uploadLocked}>
              <AccordionTrigger className="hover:no-underline" disabled={uploadLocked}>
                <div className="flex items-center gap-3">
                  <span className={`text-base font-semibold ${uploadLocked ? "text-slate-400" : "text-slate-800"}`}>
                    Upload screenshot
                  </span>
                  {getUploadBadgeStatus() && (
                    <SectionStatusBadge status={getUploadBadgeStatus()!} />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent forceMount>
                <div className="space-y-3">
                  {/* Checking spinner */}
                  {isChecking && (
                    <div className="rounded-lg bg-violet-50 border border-violet-200 p-6 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-500 mx-auto mb-3" />
                      <p className="font-medium text-violet-800">Checking your screenshot...</p>
                      <p className="text-sm text-violet-600 mt-1">This usually takes a few seconds.</p>
                    </div>
                  )}

                  {/* SUBMITTED / PROCESSING (page refresh during check) */}
                  {(status === SHARE_STATUS.SUBMITTED || status === SHARE_STATUS.PROCESSING) && !isChecking && (
                    <div className="rounded-lg bg-violet-50 border border-violet-200 p-6 text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-500 mx-auto mb-3" />
                      <p className="font-medium text-violet-800">Your screenshot is being checked...</p>
                      <p className="text-sm text-violet-600 mt-1">Please wait or refresh this page in a moment.</p>
                    </div>
                  )}

                  {/* Success */}
                  {isAccessGranted && (
                    <div className="rounded-lg bg-green-50 border border-green-200 p-4 flex items-center gap-3">
                      <ShieldCheck className="h-6 w-6 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-green-800">Share verified!</p>
                        <p className="text-sm text-green-600">Your profile is now visible in the babysitting pool.</p>
                      </div>
                    </div>
                  )}

                  {/* Failed */}
                  {status === SHARE_STATUS.FAILED && sessionFailReason && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                      <div className="flex items-start gap-3">
                        <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-red-800">Screenshot verification failed</p>
                          <p className="text-sm text-red-600 mt-1">{sessionFailReason}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Upload button */}
                  {!isChecking && !isAccessGranted && (
                    <>
                      <p className="text-sm text-slate-500">
                        Take a screenshot showing your post in the Facebook group, then upload it here.
                      </p>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadState === "uploading"}
                        className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                      >
                        {uploadState === "uploading" ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading... {uploadProgress}%</>
                        ) : (
                          <><Upload className="mr-2 h-4 w-4" /> Upload Screenshot</>
                        )}
                      </Button>
                    </>
                  )}

                  {uploadError && (
                    <p className="text-xs text-red-500 text-center">{uploadError}</p>
                  )}
                  <div id="cta-upload" />
                </div>
              </AccordionContent>
            </AccordionItem>
          </div>
        </div>

        {/* Step 4: Goal — Get babysitting jobs */}
        <div className="flex gap-3">
          <StepIndicator state={goalStep} isLast topLineColor={stepLineColor(uploadStep)} />
          <div className="py-4">
            {isAccessGranted ? (
              <div>
                <p className="text-base font-semibold text-green-700">
                  Congratulations! You are now a BabyBloom babysitter
                </p>
                <p className="text-sm text-green-600 mt-1">
                  You will now receive an email from us whenever a new babysitting opportunity pops up near you.
                </p>
                <a href="/nanny">
                  <Button className="mt-3 w-full bg-violet-600 hover:bg-violet-700 text-white">
                    Go to Dashboard
                  </Button>
                </a>
              </div>
            ) : (
              <span className="text-base font-semibold text-slate-300">
                Get babysitting jobs
              </span>
            )}
          </div>
        </div>
      </Accordion>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleScreenshotSelect(file);
          e.target.value = "";
        }}
      />

      {/* Facebook groups Modal */}
      {showGroupsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowGroupsModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#ddd]">
              <h2 className="text-lg font-bold text-[#050505]">Suggested Groups</h2>
              <button onClick={() => setShowGroupsModal(false)} className="p-1 rounded-full hover:bg-gray-100">
                <X className="h-5 w-5 text-[#65676b]" />
              </button>
            </div>

            <p className="px-4 pt-3 pb-2 text-xs text-[#65676b]">
              Join a group below, then come back to share your post.
            </p>

            {/* Group list */}
            <div className="overflow-y-auto max-h-[60vh]">
              {[
                { name: "Sydney Nannies, Au Pairs, Babysitters & Mothers' Helpers", url: "https://www.facebook.com/groups/sydneyaupairsnpc/", area: "All Sydney", members: null },
                { name: "Sydney Babysitter Now", url: "https://www.facebook.com/groups/635979079862553", area: "All Sydney", members: null },
                { name: "Babysitting / Nannying / AU Pair", url: "https://www.facebook.com/groups/1725865791074120/", area: "All Sydney", members: null },
                { name: "North Shore Nanny and Babysitter Jobs Sydney", url: "https://www.facebook.com/groups/175255753060813", area: "North Shore", members: null },
                { name: "Babysitting / Nannies Hornsby And Surrounding Areas", url: "https://www.facebook.com/groups/906298379521868/", area: "Hornsby", members: null },
                { name: "Sydney Au Pairs and Host Families", url: "https://www.facebook.com/groups/530067860346311/", area: "All Sydney", members: null },
                { name: "Au Pairs in Australia and New Zealand", url: "https://www.facebook.com/groups/aupairsinaustraliaandnewzealand/", area: "Australia", members: null },
              ].map((group, i) => (
                <a
                  key={i}
                  href={group.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#f0f2f5] transition-colors"
                >
                  {/* Group avatar */}
                  <div className="h-12 w-12 rounded-lg bg-[#1877F2] flex items-center justify-center flex-shrink-0">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  {/* Group info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#050505] truncate">{group.name}</p>
                    <div className="flex items-center gap-1 text-xs text-[#65676b]">
                      <Globe className="h-3 w-3" />
                      <span>{group.area}</span>
                      {group.members && <><span>·</span><span>{group.members}+ members</span></>}
                    </div>
                  </div>
                  {/* Join button */}
                  <Button
                    size="sm"
                    className="bg-[#1877F2] hover:bg-[#1666d1] text-white text-xs px-4 flex-shrink-0"
                  >
                    Join
                  </Button>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
