"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuidanceCard } from "./GuidanceCard";
import { uploadFileWithProgress } from "@/lib/supabase/storage";
import { submitWWCCSection } from "@/lib/actions/verification";
import { createClient } from "@/lib/supabase/client";
import { GUIDANCE_MESSAGES } from "@/lib/verification";
import type { VerificationData } from "@/lib/actions/verification";

const WWCC_METHODS = [
  { label: "WWCC Grant Email", value: "grant_email", time: "Instant" },
  { label: "Service NSW App", value: "service_nsw_app", time: "Instant" },
  { label: "Manual Entry", value: "manual_entry", time: "1-3 days" },
] as const;

const WWCC_NUMBER_REGEX = /^WWC\d{7}[A-Z]$/;

interface PdfValidationResult {
  pass: boolean;
  needsAIFallback: boolean;
  extracted: {
    surname: string | null;
    first_name: string | null;
    other_names: string | null;
    wwcc_number: string | null;
    clearance_type: string | null;
    expiry: string | null;
  };
  issues: string[];
}

// ── Circular Progress ──

function CircularProgress({ percent }: { percent: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle cx="22" cy="22" r={radius} fill="none" stroke="#8B5CF6" strokeWidth="3"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        className="transition-all duration-300" />
      <text x="22" y="22" textAnchor="middle" dominantBaseline="central"
        className="fill-slate-700 font-medium" fontSize="10" transform="rotate(90 22 22)">
        {percent}%
      </text>
    </svg>
  );
}

type UploadState = "idle" | "uploading" | "done" | "error";

interface WWCCSectionProps {
  verification: VerificationData | null;
  locked: boolean;
  identityInReview?: boolean;
  onSaved: (verificationId: string) => void;
}

export function WWCCSection({ verification, locked, identityInReview, onSaved }: WWCCSectionProps) {
  const status = verification?.wwcc_status ?? "not_started";
  const isProcessing = status === "processing" || status === "pending";
  const isCompleted = status === "doc_verified";
  const needsAction = status === "failed" || status === "review" || status === "rejected"
    || status === "ocg_not_found" || status === "expired" || status === "closed"
    || status === "application_pending";
  const isBarred = status === "barred";

  const [editing, setEditing] = useState(status === "not_started");
  const [method, setMethod] = useState<string | null>(verification?.wwcc_verification_method ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Abort controller for in-flight uploads
  const uploadAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { uploadAbortRef.current?.abort(); };
  }, []);

  // Grant email state
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfValidating, setPdfValidating] = useState(false);
  const [pdfResult, setPdfResult] = useState<PdfValidationResult | null>(null);
  const [pdfUploadState, setPdfUploadState] = useState<UploadState>("idle");
  const [pdfUploadProgress, setPdfUploadProgress] = useState(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);

  // Service NSW state
  const [screenshotFileName, setScreenshotFileName] = useState<string | null>(null);
  const [screenshotUploadState, setScreenshotUploadState] = useState<UploadState>("idle");
  const [screenshotUploadProgress, setScreenshotUploadProgress] = useState(0);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotUploadError, setScreenshotUploadError] = useState<string | null>(null);

  // Manual entry state
  const [wwccNumber, setWwccNumber] = useState(verification?.wwcc_number ?? "");
  const [wwccExpiry, setWwccExpiry] = useState(verification?.wwcc_expiry_date ?? "");
  const [wwccConfirmed, setWwccConfirmed] = useState(false);
  const [wwccNumberError, setWwccNumberError] = useState<string | null>(null);
  const [wwccExpiryError, setWwccExpiryError] = useState<string | null>(null);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  // ── Grant Email: validate PDF + upload eagerly ──

  const handlePdfSelect = useCallback(async (file: File) => {
    setPdfFileName(file.name);
    setPdfResult(null);
    setPdfValidating(true);
    setError(null);
    setPdfUploadState("idle");
    setPdfUrl(null);

    try {
      // Validate first
      const formData = new FormData();
      formData.append("file", file);
      formData.append("surname", verification?.surname ?? "");
      formData.append("given_names", verification?.given_names ?? "");

      const res = await fetch("/api/validate-wwcc-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        setPdfResult({ pass: false, needsAIFallback: true, extracted: emptyExtracted(), issues: ["Failed to validate PDF"] });
        setPdfValidating(false);
        return;
      }

      const result: PdfValidationResult = await res.json();
      setPdfResult(result);
      setPdfValidating(false);

      // If valid, start upload immediately
      if (result.pass) {
        setPdfUploadState("uploading");
        setPdfUploadProgress(0);

        uploadAbortRef.current?.abort();
        const controller = new AbortController();
        uploadAbortRef.current = controller;

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setPdfUploadState("error");
          setPdfUploadError("Not authenticated");
          return;
        }

        const uploadResult = await uploadFileWithProgress(
          "verification-documents", user.id, file,
          (p) => setPdfUploadProgress(p),
          controller.signal
        );

        if (uploadResult.error || !uploadResult.url) {
          setPdfUploadState("error");
          setPdfUploadError(uploadResult.error ?? "Upload failed");
        } else {
          setPdfUrl(uploadResult.url);
          setPdfUploadState("done");
        }
      }
    } catch {
      setPdfResult({ pass: false, needsAIFallback: true, extracted: emptyExtracted(), issues: ["Failed to validate PDF"] });
      setPdfValidating(false);
    }
  }, [verification?.surname, verification?.given_names]);

  // ── Service NSW: upload eagerly ──

  const handleScreenshotSelect = useCallback(async (file: File) => {
    setScreenshotFileName(file.name);
    setScreenshotUploadState("uploading");
    setScreenshotUploadProgress(0);
    setScreenshotUploadError(null);

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setScreenshotUploadState("error");
      setScreenshotUploadError("Not authenticated");
      return;
    }

    const result = await uploadFileWithProgress(
      "verification-documents", user.id, file,
      (p) => setScreenshotUploadProgress(p),
      controller.signal
    );

    if (result.error || !result.url) {
      setScreenshotUploadState("error");
      setScreenshotUploadError(result.error ?? "Upload failed");
    } else {
      setScreenshotUrl(result.url);
      setScreenshotUploadState("done");
    }
  }, []);

  if (identityInReview) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 space-y-1">
        <p className="font-medium text-amber-800">Waiting for ID review</p>
        <p>We are unable to verify your WWCC until we have verified your ID. This may take up to 3 days.</p>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="text-sm text-slate-500 py-4">
        Complete the ID section first to unlock WWCC verification.
      </div>
    );
  }

  function handleMethodSelect(value: string) {
    setMethod(value);
    setPdfFileName(null);
    setPdfResult(null);
    setPdfUploadState("idle");
    setPdfUrl(null);
    setScreenshotFileName(null);
    setScreenshotUploadState("idle");
    setScreenshotUrl(null);
    setWwccNumber("");
    setWwccExpiry("");
    setWwccConfirmed(false);
    setError(null);
  }

  // ── Save handler ──

  async function handleSave() {
    setIsSaving(true);
    setError(null);

    try {
      let saveResult;
      try {
        saveResult = await Promise.race([
          submitWWCCSection({
            wwcc_verification_method: method!,
            wwcc_number: method === "manual_entry" ? wwccNumber : undefined,
            wwcc_expiry_date: method === "manual_entry" ? wwccExpiry : undefined,
            wwcc_grant_email_url: pdfUrl ?? undefined,
            wwcc_service_nsw_screenshot_url: screenshotUrl ?? undefined,
            ...(pdfResult?.pass ? {
              extracted_wwcc_surname: pdfResult.extracted.surname ?? undefined,
              extracted_wwcc_first_name: pdfResult.extracted.first_name ?? undefined,
              extracted_wwcc_other_names: pdfResult.extracted.other_names ?? undefined,
              extracted_wwcc_number: pdfResult.extracted.wwcc_number ?? undefined,
              extracted_wwcc_clearance_type: pdfResult.extracted.clearance_type ?? undefined,
              extracted_wwcc_expiry: pdfResult.extracted.expiry ?? undefined,
            } : {}),
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Save timed out — please try again")), 15000)),
        ]);
      } catch (saveErr) {
        setError(`Save failed: ${saveErr instanceof Error ? saveErr.message : "Please try again"}`);
        setIsSaving(false);
        return;
      }

      if (!saveResult.success) {
        setError(saveResult.error ?? "Failed to save");
        setIsSaving(false);
        return;
      }

      // Fire AI for Service NSW (fire-and-forget)
      if (method === "service_nsw_app") {
        fetch("/api/run-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verificationId: saveResult.verificationId, phase: "wwcc" }),
        }).catch(() => {});
      }

      setIsSaving(false);
      setEditing(false);
      onSaved(saveResult.verificationId!);
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
      setIsSaving(false);
    }
  }

  function handleWwccNumberChange(val: string) {
    setWwccNumber(val);
    if (val && !WWCC_NUMBER_REGEX.test(val)) {
      setWwccNumberError("Must be WWC followed by 7 digits and 1 capital letter (e.g. WWC1234567A)");
    } else {
      setWwccNumberError(null);
    }
  }

  function handleWwccExpiryChange(val: string) {
    setWwccExpiry(val);
    if (!val) {
      setWwccExpiryError(null);
      return;
    }
    const expiry = new Date(val);
    const now = new Date();
    if (expiry < now) {
      setWwccExpiryError("expired");
    } else {
      const threeMonths = new Date();
      threeMonths.setMonth(threeMonths.getMonth() + 3);
      if (expiry < threeMonths) {
        setWwccExpiryError("expiring_soon");
      } else {
        setWwccExpiryError(null);
      }
    }
  }

  // ── Status display ──

  if (!editing) {
    return (
      <div className="space-y-4">
        {isProcessing && (
          <p className="text-sm text-slate-500">Your WWCC document is being verified. This usually takes about 15 seconds.</p>
        )}

        {status === "review" && verification?.wwcc_verification_method === "manual_entry" && (
          <p className="text-sm text-amber-700">Awaiting admin review (1-3 days)</p>
        )}

        {isCompleted && (
          <div className="space-y-1 text-sm text-green-700">
            {verification?.wwcc_number && (
              <p>WWCC: {verification.wwcc_number}</p>
            )}
            {verification?.wwcc_expiry_date && (
              <p>Expiry: {new Date(verification.wwcc_expiry_date).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
            )}
          </div>
        )}

        {verification?.wwcc_rejection_reason && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <p className="font-medium">WWCC verification failed</p>
            <p className="mt-1">{verification.wwcc_rejection_reason}</p>
          </div>
        )}

        {verification?.wwcc_user_guidance && (
          <GuidanceCard
            guidance={verification.wwcc_user_guidance}
            primaryAction={isBarred ? undefined : { label: "Edit & Resubmit", onClick: () => { setEditing(true); setWwccConfirmed(false); } }}
          />
        )}

        {needsAction && !verification?.wwcc_user_guidance && status !== "review" && (
          <Button
            type="button"
            onClick={() => { setEditing(true); setWwccConfirmed(false); }}
            className="bg-violet-600 hover:bg-violet-700 text-white"
            size="sm"
          >
            Edit & Resubmit
          </Button>
        )}
      </div>
    );
  }

  // ── Editing form ──

  const grantEmailValid = method === "grant_email" && pdfResult?.pass && pdfUploadState === "done";
  const grantEmailExpired = pdfResult?.issues?.some(i => i.toLowerCase().includes("expired") && !i.toLowerCase().includes("expires within"));
  const grantEmailExpiringSoon = pdfResult?.issues?.some(i => i.toLowerCase().includes("expires within"));
  const serviceNswReady = method === "service_nsw_app" && screenshotUploadState === "done";
  const manualReady = method === "manual_entry" && WWCC_NUMBER_REGEX.test(wwccNumber) && !!wwccExpiry && !wwccExpiryError && wwccConfirmed;

  const canSave = grantEmailValid || serviceNswReady || manualReady;
  const isUploading = pdfUploadState === "uploading" || screenshotUploadState === "uploading";

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Method selection */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">How would you like to verify your WWCC?</p>
        <div className="flex flex-wrap gap-2">
          {WWCC_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => handleMethodSelect(m.value)}
              disabled={isSaving}
              className={`px-4 py-2 rounded-full border text-sm font-medium cursor-pointer transition-colors ${
                method === m.value
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-slate-700 border-slate-300 hover:border-violet-400"
              }`}
            >
              {m.label} ({m.time})
            </button>
          ))}
        </div>
      </div>

      {/* ── Grant Email ── */}
      {method === "grant_email" && (
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 space-y-2">
            <p className="font-medium">How to upload your WWCC Grant Email:</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-700">
              <li>Find the email from WWCCNotification@ocg.nsw.gov.au</li>
              <li>Open the email and click Print</li>
              <li>Choose &quot;Save as PDF&quot;</li>
              <li>Upload the PDF below</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Upload WWCC Grant Email PDF</Label>
            <div
              onClick={() => !isSaving && !pdfValidating && pdfUploadState !== "uploading" && pdfInputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                if (isSaving || pdfValidating || pdfUploadState === "uploading") return;
                const file = e.dataTransfer.files?.[0];
                if (file) handlePdfSelect(file);
              }}
              onDragOver={(e) => e.preventDefault()}
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors ${
                isSaving || pdfValidating || pdfUploadState === "uploading"
                  ? "border-slate-200 bg-slate-100"
                  : "border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50"
              }`}
            >
              {pdfValidating ? (
                <div className="flex items-center gap-2 text-violet-600">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm font-medium">Validating PDF...</span>
                </div>
              ) : pdfUploadState === "uploading" ? (
                <div className="flex flex-col items-center gap-2">
                  <CircularProgress percent={pdfUploadProgress} />
                  <span className="text-xs text-slate-500">Uploading {pdfFileName}...</span>
                </div>
              ) : pdfUploadState === "done" ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">{pdfFileName}</span>
                  <span className="text-xs text-slate-500 ml-2">Click to replace</span>
                </div>
              ) : (
                <>
                  {pdfUploadError && <p className="text-xs text-red-500 mb-1">{pdfUploadError}</p>}
                  <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Upload WWCC Grant Email PDF</p>
                    <p className="text-xs text-slate-500 mt-0.5">Drag & drop or click to upload</p>
                  </div>
                </>
              )}
            </div>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={isSaving || pdfValidating || pdfUploadState === "uploading"}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePdfSelect(file);
                e.target.value = "";
              }}
            />
          </div>

          {/* PDF validation result */}
          {pdfResult && !pdfValidating && (
            <div className="space-y-3">
              {pdfResult.pass ? (
                <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-semibold">
                      Valid WWCC — {pdfResult.extracted.wwcc_number}
                      {pdfResult.extracted.expiry && `, expires ${new Date(pdfResult.extracted.expiry).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`}
                    </span>
                  </div>
                  {pdfResult.issues.some(i => i.includes("expires within")) && (
                    <p className="text-sm text-amber-700 mt-2 flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Your WWCC expires soon. Please renew when possible.
                    </p>
                  )}
                </div>
              ) : grantEmailExpired ? (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <div className="flex items-center gap-2 text-red-700">
                    <XCircle className="h-5 w-5" />
                    <span className="text-sm font-semibold">This WWCC has expired</span>
                  </div>
                  <p className="text-sm text-red-600 mt-1">Please renew your WWCC before continuing.</p>
                </div>
              ) : grantEmailExpiringSoon ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm font-semibold">Your WWCC expires in less than 3 months</span>
                  </div>
                  <p className="text-sm text-amber-700">To provide consistent care for families, we ask that all childcare professionals have at least 3 months remaining on their WWCC.</p>
                  <p className="text-sm text-amber-700">
                    You can apply for a new WWCC at{" "}
                    <a href="https://www.service.nsw.gov.au/transaction/apply-for-a-working-with-children-check" target="_blank" rel="noopener noreferrer" className="underline font-medium text-amber-800 hover:text-amber-900">
                      Service NSW
                    </a>.
                  </p>
                </div>
              ) : (
                <GuidanceCard
                  guidance={
                    pdfResult.needsAIFallback
                      ? GUIDANCE_MESSAGES.PDF_UNREADABLE
                      : pdfResult.issues.some(i => i.toLowerCase().includes("name mismatch"))
                        ? GUIDANCE_MESSAGES.PDF_NAME_MISMATCH
                        : GUIDANCE_MESSAGES.PDF_UNREADABLE
                  }
                  primaryAction={{
                    label: "Upload a different file",
                    onClick: () => { setPdfFileName(null); setPdfResult(null); setPdfUploadState("idle"); setPdfUrl(null); pdfInputRef.current?.click(); },
                  }}
                  secondaryAction={{
                    label: "Enter details manually",
                    onClick: () => handleMethodSelect("manual_entry"),
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Service NSW Screenshot ── */}
      {method === "service_nsw_app" && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">Upload Service NSW Screenshot</Label>
          <div
            onClick={() => !isSaving && screenshotUploadState !== "uploading" && screenshotInputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              if (isSaving || screenshotUploadState === "uploading") return;
              const file = e.dataTransfer.files?.[0];
              if (file) handleScreenshotSelect(file);
            }}
            onDragOver={(e) => e.preventDefault()}
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors ${
              isSaving || screenshotUploadState === "uploading"
                ? "border-slate-200 bg-slate-100"
                : "border-slate-300 bg-slate-50 hover:border-violet-400 hover:bg-violet-50"
            }`}
          >
            {screenshotUploadState === "uploading" ? (
              <div className="flex flex-col items-center gap-2">
                <CircularProgress percent={screenshotUploadProgress} />
                <span className="text-xs text-slate-500">Uploading {screenshotFileName}...</span>
              </div>
            ) : screenshotUploadState === "done" ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">{screenshotFileName}</span>
                {!isSaving && <span className="text-xs text-slate-500 ml-2">Click to replace</span>}
              </div>
            ) : (
              <>
                {screenshotUploadError && <p className="text-xs text-red-500 mb-1">{screenshotUploadError}</p>}
                <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-slate-700">Upload Service NSW Screenshot</p>
                  <p className="text-xs text-slate-500 mt-0.5">Screenshot from your Service NSW wallet</p>
                </div>
              </>
            )}
          </div>
          <input
            ref={screenshotInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isSaving || screenshotUploadState === "uploading"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleScreenshotSelect(file);
              e.target.value = "";
            }}
          />
          <p className="text-xs text-slate-500 italic">Must be the full unedited screenshot from within your Service NSW wallet.</p>
        </div>
      )}

      {/* ── Manual Entry ── */}
      {method === "manual_entry" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="wwcc_number" className="text-sm font-medium text-slate-700">WWCC Number</Label>
            <Input
              id="wwcc_number"
              placeholder="eg: WWC1234567A"
              value={wwccNumber}
              onChange={(e) => handleWwccNumberChange(e.target.value)}
              disabled={isSaving}
              className={wwccNumberError ? "border-red-400 focus:border-red-500 focus:ring-red-500" : ""}
            />
            {wwccNumberError && <p className="text-xs text-red-500">{wwccNumberError}</p>}
            {wwccNumber && !wwccNumberError && <p className="text-xs text-green-600 font-medium">Valid WWCC number format</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="wwcc_expiry_date" className="text-sm font-medium text-slate-700">WWCC Expiry Date</Label>
            <Input
              id="wwcc_expiry_date"
              type="date"
              value={wwccExpiry}
              onChange={(e) => handleWwccExpiryChange(e.target.value)}
              disabled={isSaving}
              className={wwccExpiryError ? "border-red-400 focus:border-red-500 focus:ring-red-500" : ""}
            />
            {wwccExpiryError === "expired" && (
              <p className="text-xs text-red-500">This WWCC has expired. Please apply for a new one before continuing.</p>
            )}
            {wwccExpiryError === "expiring_soon" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 space-y-1">
                <p>To provide consistent care for families, we ask that all childcare professionals have at least 3 months remaining on their WWCC.</p>
                <p>
                  You can apply for a new WWCC at{" "}
                  <a href="https://www.service.nsw.gov.au/transaction/apply-for-a-working-with-children-check" target="_blank" rel="noopener noreferrer" className="underline font-medium text-amber-800 hover:text-amber-900">
                    Service NSW
                  </a>.
                </p>
              </div>
            )}
            {!wwccExpiryError && <p className="text-xs text-slate-500">Found on your WWCC grant email or Service NSW app</p>}
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <input
              id="wwcc_confirmed_manual"
              type="checkbox"
              checked={wwccConfirmed}
              onChange={(e) => setWwccConfirmed(e.target.checked)}
              disabled={isSaving}
              className="mt-0.5 h-4 w-4 accent-violet-600 cursor-pointer flex-shrink-0"
            />
            <Label htmlFor="wwcc_confirmed_manual" className="text-sm text-slate-700 cursor-pointer leading-relaxed">
              I confirm that the WWCC I have provided is genuine, valid, and issued to me.
            </Label>
          </div>
        </>
      )}

      {/* Save button */}
      {method && (canSave || isUploading) && (
        <Button
          type="button"
          onClick={handleSave}
          disabled={!canSave || isSaving || isUploading}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            "Verify"
          )}
        </Button>
      )}
    </div>
  );
}

function emptyExtracted() {
  return { surname: null, first_name: null, other_names: null, wwcc_number: null, clearance_type: null, expiry: null };
}
