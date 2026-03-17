"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { IdentitySection } from "./sections/IdentitySection";
import { WWCCSection } from "./sections/WWCCSection";
import { ContactSection } from "./sections/ContactSection";
import { SectionStatusBadge } from "./sections/SectionStatusBadge";
import { Shield, Check, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { VerificationData } from "@/lib/actions/verification";
import type { UserGuidance } from "@/lib/verification";

interface VerificationPageClientProps {
  initialData: VerificationData | null;
}

type PollResponse = {
  identity_status: string;
  identity_verified: boolean;
  identity_rejection_reason: string | null;
  identity_user_guidance: UserGuidance | null;
  surname: string | null;
  given_names: string | null;
  date_of_birth: string | null;
  extracted_passport_number: string | null;
  extracted_nationality: string | null;
  wwcc_status: string;
  wwcc_number: string | null;
  wwcc_expiry_date: string | null;
  wwcc_doc_verified: boolean;
  wwcc_verified: boolean;
  wwcc_rejection_reason: string | null;
  wwcc_user_guidance: UserGuidance | null;
  contact_status: string;
  cross_check_status: string;
  cross_check_reasoning: string | null;
  status: number;
};

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

export function VerificationPageClient({ initialData }: VerificationPageClientProps) {
  const router = useRouter();
  const [verification, setVerification] = useState<VerificationData | null>(initialData);

  // Determine which sections are unlocked
  const identityStatus = verification?.identity_status ?? "not_started";
  const wwccStatus = verification?.wwcc_status ?? "not_started";
  const contactStatus = verification?.contact_status ?? "not_started";
  const crossCheckStatus = verification?.cross_check_status ?? "not_started";

  const identityInReview = identityStatus === "review";
  const wwccLocked = identityStatus === "not_started" || identityInReview;
  const contactLocked = wwccStatus === "not_started";

  // Determine which sections to open by default
  const getDefaultOpen = useCallback((): string[] => {
    if (identityStatus === "not_started") return ["identity"];
    if (identityInReview) return ["identity"];
    if (wwccStatus === "not_started" && !wwccLocked) return ["wwcc"];
    if (contactStatus === "not_started" && !contactLocked) return ["contact"];
    if (identityStatus === "processing") return ["wwcc"];
    if (["failed", "rejected"].includes(identityStatus)) return ["identity"];
    if (["failed", "review", "rejected", "ocg_not_found", "closed", "application_pending", "barred", "expired"].includes(wwccStatus)) return ["wwcc"];
    return ["identity"];
  }, [identityStatus, wwccStatus, contactStatus, wwccLocked, contactLocked, identityInReview]);

  const [openSections, setOpenSections] = useState<string[]>(getDefaultOpen());

  // Poll for status updates when sections are processing or pending
  const isProcessing =
    identityStatus === "processing" || identityStatus === "pending" ||
    wwccStatus === "processing" || wwccStatus === "pending";

  useEffect(() => {
    if (!isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/verification-status");
        if (!res.ok) return;
        const data: PollResponse = await res.json();

        setVerification((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            identity_status: data.identity_status,
            identity_verified: data.identity_verified,
            identity_rejection_reason: data.identity_rejection_reason,
            identity_user_guidance: data.identity_user_guidance,
            surname: data.surname ?? prev.surname,
            given_names: data.given_names ?? prev.given_names,
            date_of_birth: data.date_of_birth ?? prev.date_of_birth,
            extracted_passport_number: data.extracted_passport_number ?? prev.extracted_passport_number,
            extracted_nationality: data.extracted_nationality ?? prev.extracted_nationality,
            wwcc_status: data.wwcc_status,
            wwcc_number: data.wwcc_number ?? prev.wwcc_number,
            wwcc_expiry_date: data.wwcc_expiry_date ?? prev.wwcc_expiry_date,
            wwcc_doc_verified: data.wwcc_doc_verified,
            wwcc_verified: data.wwcc_verified,
            wwcc_rejection_reason: data.wwcc_rejection_reason,
            wwcc_user_guidance: data.wwcc_user_guidance,
            contact_status: data.contact_status,
            cross_check_status: data.cross_check_status,
            cross_check_reasoning: data.cross_check_reasoning,
            verification_status: data.status ?? prev.verification_status,
          };
        });
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isProcessing]);

  const handleIdentitySaved = (verificationId: string, data: { surname: string; givenNames: string; dob: string }) => {
    setVerification((prev) => {
      if (prev) {
        return { ...prev, identity_status: "processing", identity_user_guidance: null, surname: data.surname, given_names: data.givenNames, date_of_birth: data.dob };
      }
      // First save — create minimal verification data
      return {
        id: verificationId,
        identity_status: "processing",
        wwcc_status: "not_started",
        contact_status: "not_started",
        cross_check_status: "not_started",
        verification_status: 10,
        identity_verified: false,
        identity_rejection_reason: null,
        identity_user_guidance: null,
        extracted_passport_number: null,
        extracted_nationality: null,
        wwcc_verification_method: null,
        wwcc_number: null,
        wwcc_expiry_date: null,
        wwcc_grant_email_url: null,
        wwcc_service_nsw_screenshot_url: null,
        wwcc_doc_verified: false,
        wwcc_verified: false,
        wwcc_rejection_reason: null,
        wwcc_user_guidance: null,
        phone_number: null,
        address_line: null,
        city: null,
        state: null,
        postcode: null,
        country: null,
        cross_check_reasoning: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        surname: data.surname,
        given_names: data.givenNames,
        date_of_birth: data.dob,
        passport_country: null,
        passport_upload_url: null,
        identification_photo_url: null,
      } as VerificationData;
    });
    setOpenSections(["wwcc"]);
  };

  const handleManualReview = () => {
    setVerification((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        identity_status: "review",
        identity_user_guidance: null,
        // Wipe WWCC data client-side to match server
        wwcc_status: "not_started",
        wwcc_verification_method: null,
        wwcc_number: null,
        wwcc_expiry_date: null,
        wwcc_grant_email_url: null,
        wwcc_service_nsw_screenshot_url: null,
        wwcc_doc_verified: false,
        wwcc_verified: false,
        wwcc_rejection_reason: null,
        wwcc_user_guidance: null,
        cross_check_status: "not_started",
        cross_check_reasoning: null,
      };
    });
    setOpenSections(["identity"]);
  };

  const handleWWCCSaved = () => {
    setVerification((prev) => {
      if (!prev) return prev;
      return { ...prev, wwcc_status: "pending", wwcc_user_guidance: null };
    });
    setOpenSections(["contact"]);
  };

  const handleContactSaved = () => {
    setVerification((prev) => {
      if (!prev) return prev;
      return { ...prev, contact_status: "saved" };
    });
    setOpenSections([]);
  };

  const getBadgeStatus = (sectionStatus: string) => {
    switch (sectionStatus) {
      case "not_started": return null;
      case "pending": return "processing" as const;
      case "processing": return "processing" as const;
      case "verified": case "doc_verified": case "passed": return "verified" as const;
      case "saved": return "verified" as const;
      case "review": case "application_pending": return "review" as const;
      case "rejected": case "barred": return "rejected" as const;
      case "failed": case "ocg_not_found": case "closed": return "failed" as const;
      case "expired": return "expired" as const;
      default: return null;
    }
  };

  const allVerified =
    crossCheckStatus === "passed" &&
    contactStatus === "saved" &&
    identityStatus === "verified" &&
    (wwccStatus === "doc_verified" || wwccStatus === "verified");

  // Auto-redirect to hub after verification is complete
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  useEffect(() => {
    if (!allVerified) return;
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          router.push("/nanny");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [allVerified, router]);

  // Stepper states
  const identityStep: StepState = identityStatus === "verified" ? "completed" : "current";
  const wwccStep: StepState = ["verified", "doc_verified"].includes(wwccStatus) ? "completed" : wwccLocked ? "future" : "current";
  const contactStep: StepState = contactStatus === "saved" ? "completed" : contactLocked ? "future" : "current";
  const goalStep: StepState = allVerified ? "completed" : "future";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Verification</h1>
        {allVerified ? (
          <p className="text-sm text-green-600 mt-1 font-medium flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            Your account is fully verified!
          </p>
        ) : (
          <p className="text-sm text-slate-500 mt-1">
            For the protection of our childcare professionals and families, all users must complete the same gold-standard verification before we will connect them with each other.
          </p>
        )}
      </div>

      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
        {/* Step 1: Verify ID */}
        <div className="flex gap-3">
          <StepIndicator state={identityStep} isFirst />
          <div className="flex-1 pb-3">
            <AccordionItem value="identity" className="border-0">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-slate-800">Verify ID</span>
                  {getBadgeStatus(identityStatus) && (
                    <SectionStatusBadge
                      status={getBadgeStatus(identityStatus)!}
                      customLabel={identityInReview ? "Pending review" : undefined}
                    />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent forceMount>
                <IdentitySection
                  verification={verification}
                  onSaved={handleIdentitySaved}
                  onManualReview={handleManualReview}
                />
              </AccordionContent>
            </AccordionItem>
          </div>
        </div>

        {/* Step 2: Verify WWCC */}
        <div className="flex gap-3">
          <StepIndicator state={wwccStep} topLineColor={stepLineColor(identityStep)} />
          <div className="flex-1 pb-3">
            <AccordionItem value="wwcc" className="border-0" disabled={wwccLocked}>
              <AccordionTrigger className="hover:no-underline" disabled={wwccLocked}>
                <div className="flex items-center gap-3">
                  <span className={`text-base font-semibold ${wwccLocked ? "text-slate-400" : "text-slate-800"}`}>
                    Verify WWCC
                  </span>
                  {identityInReview && <span className="text-xs text-amber-600">Waiting for ID review</span>}
                  {!wwccLocked && getBadgeStatus(wwccStatus) && (
                    <SectionStatusBadge status={getBadgeStatus(wwccStatus)!} />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent forceMount>
                <WWCCSection
                  verification={verification}
                  locked={wwccLocked}
                  identityInReview={identityInReview}
                  onSaved={handleWWCCSaved}
                />
              </AccordionContent>
            </AccordionItem>
          </div>
        </div>

        {/* Step 3: Verify Contact Information */}
        <div className="flex gap-3">
          <StepIndicator state={contactStep} topLineColor={stepLineColor(wwccStep)} />
          <div className="flex-1 pb-3">
            <AccordionItem value="contact" className="border-0" disabled={contactLocked}>
              <AccordionTrigger className="hover:no-underline" disabled={contactLocked}>
                <div className="flex items-center gap-3">
                  <span className={`text-base font-semibold ${contactLocked ? "text-slate-400" : "text-slate-800"}`}>
                    Verify Contact Information
                  </span>
                  {!contactLocked && getBadgeStatus(contactStatus) && (
                    <SectionStatusBadge status={getBadgeStatus(contactStatus)!} />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent forceMount>
                <ContactSection
                  verification={verification}
                  locked={contactLocked}
                  onSaved={handleContactSaved}
                />
              </AccordionContent>
            </AccordionItem>
          </div>
        </div>

        {/* Step 4: Connect with Families (goal step — no accordion) */}
        <div className="flex gap-3">
          <StepIndicator state={goalStep} isLast topLineColor={stepLineColor(contactStep)} />
          <div className="py-4">
            <span className={`text-base font-semibold ${allVerified ? "text-green-700" : "text-slate-300"}`}>
              Connect with Families
            </span>
          </div>
        </div>
      </Accordion>

      {allVerified && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 p-6">
          <CheckCircle className="h-8 w-8 text-green-500" />
          <p className="text-lg font-semibold text-green-700">You&apos;re fully verified!</p>
          <p className="text-sm text-green-600">
            Redirecting you to your hub in {redirectCountdown}...
          </p>
        </div>
      )}

      {/* Cross-check review */}
      {crossCheckStatus === "review" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <p className="font-medium">Cross-check under review</p>
          <p className="mt-1">
            {verification?.cross_check_reasoning ?? "Our team is reviewing a discrepancy between your passport and WWCC details."}
          </p>
        </div>
      )}
    </div>
  );
}
