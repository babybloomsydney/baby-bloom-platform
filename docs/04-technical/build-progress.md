> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# Baby Bloom Sydney - Build Progress

**Last Updated:** 2026-02-24
**Current Phase:** Verification Pipeline — Fully Tested & Live

---

## Design Decisions (Locked)
- **Primary Color:** Violet (#8B5CF6)
- **UI Style:** Vibrant + minimal, human-feeling
- **Logo:** Text placeholder "Baby Bloom"
- **Components:** shadcn/ui

---

## Phase 3: Core Features Build
**Status:** COMPLETE

### Step 1: Fix Signup Bug
**Status:** COMPLETE
- Created admin client for bypassing RLS during signup
- Updated auth actions to use admin client for post-signup inserts

**Files Created:**
- `src/lib/supabase/admin.ts` - Admin client with service role key

**Files Modified:**
- `src/lib/auth/actions.ts` - Uses admin client for user_roles, user_profiles, nannies/parents, user_progress inserts

---

### Step 2: Nanny Profile Form
**Status:** COMPLETE
- Multi-section tabbed form covering all ~40 nanny fields
- 8 tabs: Basic, Experience, Preferences, Work, Capabilities, Logistics, Personal, Status
- Real-time save with loading/success states

**Files Created:**
- `src/lib/actions/nanny.ts` - getNannyProfile, updateNannyProfile server actions
- `src/components/forms/NannyProfileForm.tsx` - Multi-section form component

**Files Modified:**
- `src/app/nanny/profile/page.tsx` - Server component fetching real data, renders form

---

### Step 3: Browse Nannies with Real Data
**Status:** COMPLETE
- Public browse page fetches real nannies from database
- Parent browse page with "Request Interview" buttons
- Reusable NannyCard component with badges

**Files Created:**
- `src/components/NannyCard.tsx` - Reusable card + skeleton + empty state
- `src/app/parent/browse/ParentBrowseClient.tsx` - Client component for interview modal

**Files Modified:**
- `src/app/(public)/nannies/page.tsx` - Server component with real data
- `src/app/parent/browse/page.tsx` - Server component with real data + interview buttons

---

### Step 4: Parent Position Creation
**Status:** COMPLETE
- Multi-section tabbed form for position creation
- 7 tabs: Timeline, Schedule, Children, Requirements, Preferences, Compensation, Reason
- One active position per parent enforced
- Edit/Close position functionality

**Files Created:**
- `src/lib/actions/parent.ts` - getPosition, createPosition, updatePosition, closePosition
- `src/components/forms/PositionForm.tsx` - Multi-section position form
- `src/app/parent/position/PositionPageClient.tsx` - Client component for create/edit/close

**Files Modified:**
- `src/app/parent/position/page.tsx` - Server component with position summary + form

---

### Step 5: Interview Request Flow
**Status:** COMPLETE
- Parent can request interview with nanny (pick 3 time slots + message)
- Nanny sees pending requests and can accept (select time) or decline
- Parent sees request status (pending/accepted/declined/cancelled)
- Cancel functionality for parents

**Files Created:**
- `src/lib/actions/interview.ts` - createInterviewRequest, getParentInterviewRequests, getNannyInterviewRequests, acceptInterviewRequest, declineInterviewRequest, cancelInterviewRequest
- `src/components/InterviewRequestModal.tsx` - Modal for requesting interviews
- `src/app/nanny/interviews/NannyInterviewsClient.tsx` - Client component for accept/decline
- `src/app/parent/interviews/ParentInterviewsClient.tsx` - Client component for cancel

**Files Modified:**
- `src/app/nanny/interviews/page.tsx` - Server component with pending/past requests
- `src/app/parent/interviews/page.tsx` - Server component with scheduled/pending/past requests

---

## Previous Phases

### Agent 1: Public & Auth Layouts - COMPLETE
### Agent 2: Dashboard Layouts - COMPLETE
### Agent 3: Auth & Middleware - COMPLETE
### Agent 4: Admin Dashboard - COMPLETE

---

## Current State

### What's Working
- **Database:** 23 tables deployed, RLS enabled, 194 postcodes seeded, OCG audit columns + constraints + trigger live
- **Auth:** Signup works (admin client bypasses RLS), login, forgot/reset password
- **Public pages:** Landing, browse nannies (real data), about
- **Nanny dashboard:** Profile editing (all fields), verification status, interview requests
- **Nanny registration:** 7-step funnel for new users with AI bio generation
- **Parent dashboard:** Browse nannies, create/edit position, request interviews, view requests
- **Admin dashboard:** Real data across all pages, all verification statuses displayed correctly
- **Interview flow:** Full request/accept/decline/cancel cycle
- **Verification pipeline:** FULLY TESTED & LIVE
  - Accordion-based per-section verification (identity, WWCC, contact)
  - AI passport verification (GPT-4o vision, 2-attempt retry, 25s timeout)
  - AI WWCC screenshot verification (GPT-4o-mini, 2-attempt retry)
  - Instant PDF validation for grant emails (no AI, pdf-parse)
  - Auto cross-check (passport surname vs WWCC surname)
  - OCG webhook handles ALL 7 statuses (CLEARED, NOT FOUND, EXPIRED, CLOSED, APPLICATION IN PROGRESS, BARRED, INTERIM BAR)
  - OCG is authoritative source for FULLY_VERIFIED — enforced by DB constraint + trigger
  - 9 OCG audit columns for government compliance
  - Gmail Message-ID stored for email tracing
  - 5-minute staleness safety net (processing → review)
  - BARRED users: account suspended, no resubmit button
  - 18 live API tests passing, full code path analysis complete
- **Deployment:** Live on Vercel at `https://app-babybloom.vercel.app`
- **Build:** Passing, TypeScript clean

### What's Complete
- Phase 0: Business Foundation
- Phase 1: Database Schema
- Phase 2: Webapp Shell
- Phase 3: Core Features
- Phase 4: Verification Pipeline — COMPLETE
  - Identity verification (passport + selfie AI)
  - WWCC verification (3 methods: grant email PDF, Service NSW screenshot, manual entry)
  - Cross-check (passport ↔ WWCC surname matching)
  - OCG webhook (all 7 statuses, audit compliance, database-level enforcement)
  - Admin UI (all statuses displayed, filtered, labeled)
  - Comprehensive testing (18 API tests + full code path analysis)
  - OCG audit migration deployed to Supabase
  - Constraint hotfix deployed (wwcc_status + verification_status CHECK constraints)

### What's Next (Priority Order)
1. **Git commit** — All work is uncommitted! Must commit to preserve everything
2. **Make.com update** — Add `message_id` field to OCG webhook HTTP POST (maps Gmail Message-ID)
3. **Nanny detail page** — Full profile view for parents (clickable from browse/matching)
4. **Email notifications** — Interview requests, verification status changes, OCG results
5. **Babysitting request flow** — One-time jobs: post → notify 20 closest nannies → first-to-accept
6. **Matching algorithm** — Hard filters + weighted scoring for nanny positions
7. **AI features** — Facebook post generation, email coordination templates
8. **Activity logging** — Write to `activity_logs` table on key verification events
9. **Admin manual review actions** — Approve/reject identity_status=review and wwcc_status=review from admin UI
10. **Nanny My Team page** — Show paired families for hired nannies

---

## Component Registry

### Layout Components
- `Logo` - Brand text
- `Navbar` - Sticky nav with mobile menu
- `Footer` - 3-column footer
- `Sidebar` - Role-aware dashboard sidebar
- `DashboardHeader` - Dashboard header with user menu
- `MobileNav` - Sheet-based mobile nav

### Dashboard Components
- `StatsCard` - Metric display card
- `StatusBadge` - Status indicator
- `EmptyState` - Empty state with CTA
- `UserAvatar` - User avatar with fallback

### Form Components
- `NannyProfileForm` - 8-tab nanny profile editor (for existing complete profiles)
- `NannyRegistrationFunnel` - 7-step registration wizard (for new/incomplete profiles)
- `PositionForm` - 7-tab position creator/editor
- `InterviewRequestModal` - Interview request modal

### UI Components
- `FunnelProgress` - Multi-step progress indicator
- `Dialog` - shadcn/ui Dialog (Radix)
- `Textarea` - shadcn/ui Textarea

### Admin Components
- `AdminUsersClient` - Top-level Users/Verification tabs with URL sync
- `UsersTab` - User stats, search/filters (role, level 0-4, status group), user table with integer labels
- `UserDetailDrawer` - Sheet drawer with Level + Status badges showing integer labels
- `VerificationTab` - Verification stats, ID/WWCC sub-tabs, integer status labels, copy-to-clipboard
- `IDCheckModal` - Passport/selfie comparison modal with verify/reject
- `VerificationReferencePage` - Admin reference tables for verification level + status systems

### Verification Components
- `VerificationPageClient` - Accordion with 3 sections + polling hook + provisionally verified card
- `IdentitySection` - Identity form with file uploads, status display, guidance card, edit & resubmit
- `WWCCSection` - Method selector (Grant Email / Service NSW / Manual), instant PDF validation, guidance cards
- `ContactSection` - Contact form with save
- `SectionStatusBadge` - Badge component with 8 variants (pending/processing/verified/failed/review/rejected/expired/saved)
- `GuidanceCard` - Renders UserGuidance JSON as recovery card with title, explanation, numbered steps, action buttons

### Shared Components
- `NannyCard` - Nanny card for browse pages
- `NannyCardSkeleton` - Loading skeleton
- `EmptyNannyState` - No nannies found state

---

## Session Notes

### 2026-02-06 - Phase 3 Complete
- Fixed signup bug with admin client
- Built nanny profile form (8 sections, ~40 fields)
- Implemented browse with real data
- Built position creation form (7 sections)
- Implemented interview request flow (create, accept, decline, cancel)
- All builds passing

### 2026-02-06 - Nanny Registration Funnel
- Added 7-step sequential registration wizard for new nannies
- Steps: Basics, Experience, What You Offer, Preferences, Children, About You, Review
- Routing logic: incomplete profiles redirect to /nanny/register, complete profiles to /nanny/profile
- AI bio generation on profile completion (GPT-4o)
- New isProfileComplete() and createNannyProfile() server actions
- FunnelProgress component with mobile/desktop views

**Files Created:**
- `src/app/nanny/register/page.tsx` - Server component with redirect logic
- `src/app/nanny/register/NannyRegistrationFunnel.tsx` - Client wizard component
- `src/app/nanny/register/steps/StepBasics.tsx`
- `src/app/nanny/register/steps/StepExperience.tsx`
- `src/app/nanny/register/steps/StepWhatYouOffer.tsx`
- `src/app/nanny/register/steps/StepPreferences.tsx`
- `src/app/nanny/register/steps/StepChildren.tsx`
- `src/app/nanny/register/steps/StepAboutYou.tsx`
- `src/app/nanny/register/steps/StepReview.tsx`
- `src/components/ui/funnel-progress.tsx` - Progress stepper component

**Files Modified:**
- `src/lib/actions/nanny.ts` - Added isProfileComplete(), createNannyProfile(), generateNannyBio()
- `src/app/nanny/profile/page.tsx` - Added redirect for incomplete profiles

### 2026-02-18 - Admin User Management & Verification Dashboard
- Built unified `/admin/users` section with Users + Verification tabs
- Users tab: stats cards, search/filter (role, status, tier), clickable user table, detail drawer
- Verification tab: pending stats, ID sub-tab (Check ID modal), WWCC sub-tab (copy-to-clipboard, OCG portal, confirm toggle)
- 4 admin server actions: verifyIdentity, rejectIdentity, confirmWWCC, rejectWWCC
- Fixed data issue: switched from `createClient()` to `createAdminClient()` to bypass RLS
- Removed separate Verifications nav item from sidebar
- Old `/admin/verifications` redirects to `/admin/users?tab=verification`

**Files Created:**
- `src/app/admin/users/AdminUsersClient.tsx` - Top-level tabs
- `src/app/admin/users/UsersTab.tsx` - Users stats + filters + table + drawer
- `src/app/admin/users/UserDetailDrawer.tsx` - User detail sheet
- `src/app/admin/users/VerificationTab.tsx` - Verification stats + ID/WWCC sub-tabs
- `src/app/admin/users/IDCheckModal.tsx` - ID verification review modal
- `src/lib/actions/admin.ts` - Admin server actions
- `src/components/ui/dialog.tsx` - shadcn Dialog component
- `src/components/ui/textarea.tsx` - shadcn Textarea component

**Files Modified:**
- `src/app/admin/users/page.tsx` - Rewritten with 5 parallel data fetches via createAdminClient()
- `src/components/layout/Sidebar.tsx` - Removed Verifications nav item
- `src/app/admin/verifications/page.tsx` - Redirects to /admin/users?tab=verification

**Files Deleted:**
- `src/app/admin/users/UsersTableClient.tsx` - Logic absorbed into UsersTab.tsx

### 2026-02-20 - Integer Verification Data Systems
- Implemented two-system verification architecture per verification-data-systems.md
- System 1: `verification_level` (INTEGER 0-4) on nannies table — access control
- System 2: `verification_status` (INTEGER 0-40) on verifications table — communication/UX/emails
- Admin UI now shows labels with integer in brackets: "Pending ID Review (11)", "Fully Verified (4)"
- Created verification reference page at `/admin/verification-reference` (tables for level, status, access matrix, state transitions, synchronisation)
- Updated all 4 admin server actions to set both systems per state transition table
- Updated seed script to use integer values
- DB migration SQL ready to run (SQL_migration_3.sql)
- TypeScript clean, no errors

**Spec Document:**
- `verification/nanny_verification/verification_pipeline/verification-data-systems.md` - Full formal spec

**Files Created:**
- `SQL/SQL_migration_3.sql` - Migration: adds verification_level INTEGER to nannies, changes verification_status to INTEGER on verifications
- `src/app/admin/verification-reference/page.tsx` - Verification reference page with all tables

**Files Modified:**
- `src/lib/actions/admin.ts` - Rewritten: exports VERIFICATION_STATUS, VERIFICATION_LEVEL, STATUS_LABELS, LEVEL_LABELS constants; all 4 actions set both verification_level and verification_status integers per state transition table
- `src/app/admin/users/page.tsx` - UserData interface updated (verification_level/verification_status as numbers); data fetching uses integer verification_status; getVerificationStats uses IN (10,11,20,21) for pending; getPendingIdentityChecks filters by IN (10,11); getPendingWWCCChecks filters by IN (20,21,30)
- `src/app/admin/users/UsersTab.tsx` - Rewritten: filters by level (0-4) and status group (id_stage/wwcc_stage/verified/rejected); columns show Level and Status with integer labels from LEVEL_LABELS/STATUS_LABELS
- `src/app/admin/users/UserDetailDrawer.tsx` - Rewritten: shows Level and Status badges with integer labels; ID/WWCC breakdown uses integer range checks
- `src/app/admin/users/VerificationTab.tsx` - Updated: status badges use STATUS_LABELS; status filtering uses integer constants
- `src/components/layout/Sidebar.tsx` - Added "Verification Ref" nav item pointing to /admin/verification-reference
- `SQL/mock_ver_SQL_1.sql` - Rewritten: uses integer verification_level (0-4) and verification_status (0-40); 5 scenarios: Pending ID Auto (10), ID Rejected (12), Pending WWCC Review (21), WWCC Rejected (22), Fully Verified (40)

### 2026-02-21 — Verification Pipeline: Passport & WWCC AI Verification
- Built complete nanny verification upload flow at `/nanny/verify`
- Passport upload + selfie → AI verification (GPT-4o vision) with data extraction
- WWCC PDF upload → pdf-parse text extraction → 9 authenticity markers → AI cross-check
- WWCC manual entry fallback (status 21 → admin reviews on OCG portal)
- Live progress chain at `/nanny/verification` with 3-second polling during auto-checks
- Verification status API endpoint for polling
- Status 24 (WWCC Document Failed) for unreadable PDFs with resubmit option
- DB migration 6: added extracted fields, AI reasoning columns, WWCC document failed status
- Fixed RLS protection trigger that was blocking admin client updates

**Files Created:**
- `src/app/nanny/verify/page.tsx` - Server component (fetches current verification state)
- `src/app/nanny/verify/VerifyClient.tsx` - Client upload UI with progressive reveal (passport → selfie → WWCC)
- `src/app/nanny/verification/page.tsx` - Server component for status page
- `src/app/nanny/verification/VerificationStatusClient.tsx` - Live progress chain component
- `src/app/api/verify-passport/route.ts` - AI passport verification endpoint (GPT-4o vision)
- `src/app/api/verify-wwcc/route.ts` - AI WWCC verification endpoint (PDF parse + GPT-4o)
- `src/app/api/verification-status/route.ts` - Polling endpoint for live status updates
- `src/lib/verification.ts` - VERIFICATION_STATUS, VERIFICATION_LEVEL constants with labels
- `src/lib/verification/wwcc-pdf-parser.ts` - PDF text extraction + 9 authenticity marker checks
- `src/lib/actions/verification.ts` - submitPassportVerification, submitWWCCVerification server actions
- `SQL/SQL_migration_6.sql` - Added extracted_* columns, AI reasoning columns, status 24

**Files Modified:**
- `src/lib/actions/admin.ts` - Moved constants to `src/lib/verification.ts`, imports from there
- `src/app/admin/users/VerificationTab.tsx` - Imports from `src/lib/verification.ts`
- `src/app/admin/users/UsersTab.tsx` - Imports from `src/lib/verification.ts`
- `src/app/admin/users/UserDetailDrawer.tsx` - Imports from `src/lib/verification.ts`
- `src/app/admin/users/page.tsx` - Added Suspense boundary + `export const dynamic = "force-dynamic"` for Vercel build
- `src/app/nanny/profile/NannyMyProfile.tsx` - Fixed unused vars for ESLint (Vercel build)
- `src/app/nanny/register/steps/StepHelpfulInfo.tsx` - Fixed unused vars for ESLint (Vercel build)

**Dependencies Added:**
- `pdf-parse` - PDF text extraction for WWCC documents

### 2026-02-23 — OCG Email Webhook & Vercel Deployment
- Built OCG employer portal email webhook for automated WWCC confirmation
- Parses OCG HTML emails with structured table data (employer info + results rows)
- Supports batch verifications (multiple nannies in one email)
- CLEARED → status 40, level 4 (fully verified); REJECTED → status 22, level 2
- Matches WWCC number against both `wwcc_number` and `extracted_wwcc_number` columns
- Make.com email hook → HTTP POST with multipart/form-data (single `html` field)
- Auth via Bearer token in Authorization header
- First Vercel deployment — app live at `https://app-babybloom.vercel.app`
- All environment variables configured on Vercel
- SSO protection disabled for public access
- End-to-end flow tested and confirmed working: nanny → status 30 → OCG email → status 40

**Files Created:**
- `src/lib/verification/parse-ocg-email.ts` - OCG email HTML parser (extracts employer info + result rows)
- `src/app/api/webhooks/ocg-verification/route.ts` - Webhook endpoint (Bearer auth, multipart/form-data + JSON)
- `docs/07-business-rules/verification-flow.md` - Formal documentation of complete verification pipeline

**Files Modified:**
- `.env.local` - Added `OCG_WEBHOOK_SECRET`
- `src/app/nanny/verification/VerificationStatusClient.tsx` - Removed unused AlertTriangle import

**External Configuration:**
- Vercel: 9 environment variables set (Supabase, OpenAI, app URL, OCG webhook secret)
- Vercel: SSO protection disabled
- Make.com: Email hook → HTTP POST to `/api/webhooks/ocg-verification` with Bearer auth
- Google Workspace: Gmail filter auto-forwards OCG emails to Make.com

### 2026-02-23 — Accordion Verification Page Redesign
- Replaced fragmented two-page verification (funnel + status) with single accordion page at `/nanny/verification`
- Three independent sections: Identity, WWCC, Contact — each saves independently
- Per-section status tracking with TEXT columns (identity_status, wwcc_status, contact_status, cross_check_status)
- Legacy INTEGER verification_status kept for admin UI backward compat via `deriveOverallStatus()`
- Grant email PDF validated instantly client-side (~1s, no AI) via lightweight API route
- Service NSW screenshot uses AI verification (GPT-4o vision, background processing)
- Manual WWCC entry goes straight to admin review
- AI prompts return `user_guidance` field for user-facing error recovery
- Three-layer error recovery: self-fix (AI guidance) → auto-retry (2 attempts, 25s each) → manual review
- Technical failures set status back to 'pending' (NOT review) with retry button
- Cross-check runs automatically when both identity and WWCC doc are individually verified
- 5-minute staleness safety net escalates stuck 'processing' to 'review'
- Atomic claims prevent double-processing (UPDATE WHERE status='pending' SET 'processing')
- TypeScript clean, zero errors

**DB Migration (must run before deploy):**
- `app/scripts/migration-per-section-verification.sql` — 14 new columns, CHECK constraints, backfill

**Files Created:**
- `app/scripts/migration-per-section-verification.sql` - DB migration for per-section status columns
- `src/components/ui/accordion.tsx` - shadcn/ui Accordion component (Radix)
- `src/app/api/validate-wwcc-pdf/route.ts` - Lightweight instant PDF validation (no auth, no DB)
- `src/app/nanny/verification/VerificationPageClient.tsx` - Accordion with 3 sections + polling
- `src/app/nanny/verification/sections/SectionStatusBadge.tsx` - Badge component (8 variants)
- `src/app/nanny/verification/sections/GuidanceCard.tsx` - User guidance card (title, steps, actions)
- `src/app/nanny/verification/sections/IdentitySection.tsx` - Identity form + status + guidance
- `src/app/nanny/verification/sections/WWCCSection.tsx` - Method selector + 3 input modes + guidance
- `src/app/nanny/verification/sections/ContactSection.tsx` - Contact form

**Files Modified:**
- `src/lib/verification.ts` - Added IDENTITY_STATUS, WWCC_STATUS, CONTACT_STATUS, CROSS_CHECK_STATUS enums, UserGuidance interface, GUIDANCE_MESSAGES, deriveOverallStatus()
- `src/lib/ai/verify-passport.ts` - Added user_guidance to prompt and return type
- `src/lib/ai/verify-wwcc.ts` - Added user_guidance to prompt and return type
- `src/lib/ai/verification-pipeline.ts` - Completely rewritten: runIdentityPhase(), runWWCCDocPhase(), runCrossCheckPhase(), triggerCrossCheck() with 2-attempt retry
- `src/lib/actions/verification.ts` - Completely rewritten: submitIdentitySection(), submitWWCCSection(), submitContactSection(), getVerificationData()
- `src/lib/actions/admin.ts` - All 4 admin actions now write per-section status columns + trigger cross-check
- `src/app/api/run-verification/route.ts` - Accepts { phase: 'identity' | 'wwcc' } parameter
- `src/app/api/verification-status/route.ts` - Returns per-section statuses, 5-min staleness net
- `src/app/api/webhooks/ocg-verification/route.ts` - Writes per-section status columns
- `src/app/nanny/verification/page.tsx` - Calls getVerificationData(), passes to VerificationPageClient
- `src/app/nanny/verify/page.tsx` - Now redirects to /nanny/verification
- `src/components/layout/Sidebar.tsx` - Removed /nanny/verify nav item
- `src/components/layout/MobileNav.tsx` - Removed /nanny/verify nav item

### 2026-02-23 — Complete OCG Status Handling + Audit Compliance
- Handle ALL 7 OCG verification statuses: CLEARED, NOT FOUND, EXPIRED, CLOSED, APPLICATION IN PROGRESS, BARRED, INTERIM BARRED
- OCG is now the AUTHORITATIVE source for Fully Verified — enforced by database CHECK constraint + trigger
- 9 OCG audit columns added for government compliance assessments
- Database trigger `sync_nanny_from_ocg_result()` auto-updates nannies table when OCG result is recorded
- BARRED/INTERIM BARRED → account suspended, no retry allowed, profile hidden
- NOT FOUND dual surname search (checks both `user_profiles.last_name` and `verifications.surname`)
- Added `message_id` field to webhook for Gmail Message-ID audit tracing (Make.com must send this)
- New verification statuses: WWCC_CLOSED (27), WWCC_APPLICATION_PENDING (28)
- New WWCC statuses: `closed`, `application_pending`, `barred`
- 4 new guidance messages with OCG-specific recovery instructions
- Admin UI updated to display and filter all new statuses
- TypeScript clean, zero errors

**DB Migration (must run BEFORE deploy):**
- `docs/04-technical/database/migrations/20260224_add_ocg_audit_columns.sql` — 9 OCG columns, CHECK constraint, trigger, updated expiry cron

**Files Created:**
- `docs/04-technical/database/migrations/20260224_add_ocg_audit_columns.sql` - OCG audit columns + database-level enforcement

**Files Modified:**
- `src/lib/verification.ts` - Added WWCC_CLOSED (27), WWCC_APPLICATION_PENDING (28), BARRED/CLOSED/APPLICATION_PENDING WWCC statuses, 4 new GUIDANCE_MESSAGES, updated deriveOverallStatus()
- `src/app/api/webhooks/ocg-verification/route.ts` - Complete rewrite: handles all 7 OCG statuses via mapOCGStatus(), accepts message_id, dual surname search, BARRED suspends account, comprehensive logging
- `src/app/nanny/verification/sections/WWCCSection.tsx` - Added expired/closed/application_pending to needsAction; barred users see guidance without resubmit button
- `src/app/api/verification-status/route.ts` - Added ocg_result_status, ocg_verified_at to SELECT and response
- `src/app/admin/users/UsersTab.tsx` - Status 26/27/28 in failed variant and rejected filter
- `src/app/admin/users/UserDetailDrawer.tsx` - Shows BARRED, OCG Not Found, Closed, Application Pending labels
- `src/app/admin/users/VerificationTab.tsx` - Status 26/27/28 in failed badge variant
- `docs/04-technical/database/schema.md` - Complete verifications table rewrite with OCG audit columns + status code tables
- `docs/07-business-rules/verification-rules.md` - Added OCG verification results matrix + expiry handling

**External Configuration Required:**
- Make.com: Add `message_id` multipart field to HTTP POST (map Gmail trigger's Message ID)
- Supabase: Run SQL migration in SQL Editor before deploying

**Files Deleted:**
- `src/app/nanny/verify/IDVerificationFunnel.tsx` - Old funnel component
- `src/app/nanny/verify/steps/StepVerifyIntro.tsx` - Old funnel step
- `src/app/nanny/verify/steps/StepIdentification.tsx` - Old funnel step
- `src/app/nanny/verify/steps/StepWWCC.tsx` - Old funnel step
- `src/app/nanny/verify/steps/StepContactDetails.tsx` - Old funnel step
- `src/app/nanny/verification/VerificationStatusClient.tsx` - Old status page client

### 2026-02-24 — OCG Deployment, Debugging, & Comprehensive Testing

**Deployment & Debugging:**
- Deployed OCG changes to Vercel (3 deploy attempts to fix ESLint issues)
- Fixed ESLint: removed unused `RESUBMIT_STATUSES` and `PENDING_STATUSES` constants
- Fixed `chk_wwcc_status` CHECK constraint — original migration only allowed 8 values, added `ocg_not_found`, `closed`, `application_pending`, `barred`
- Fixed `verifications_verification_status_check` CHECK constraint — added integers 24, 25, 26, 27, 28
- Fixed WWCC number lookup filters — changed from restrictive `.in('verification_status', [30, 21])` to broad `.not('verification_status', 'eq', FULLY_VERIFIED)` — was root cause of CLEARED not finding records after NOT FOUND
- Added error logging to all nanny update paths (previously silent failures)
- Fixed `VerificationPageClient.tsx` `getBadgeStatus()` — added mappings for `ocg_not_found`→failed, `closed`→failed, `application_pending`→review, `barred`→rejected, `expired`→expired
- Fixed `VerificationPageClient.tsx` `getDefaultOpen()` — auto-opens WWCC section for all OCG failure statuses

**Comprehensive Testing (18 live API tests, all passed):**
- OCG webhook: all 7 individual statuses parsed, mapped, routed correctly
- OCG webhook: multi-row email (3 mixed statuses) processed independently
- OCG webhook: form-data path (Make.com format) works with message_id
- OCG webhook: wrong auth → 401, no html → 400, malformed HTML → 422, empty results → 422, unknown status → graceful "unknown_status"
- PDF validation: no file → needsAIFallback, fake file → issues returned
- Auth-protected endpoints: all return 401 without auth
- Full code path analysis: traced every branch through all 12 verification functions/routes

**Bug Found & Fixed:**
- `submitWWCCSection` didn't reset `cross_check_status` on WWCC resubmission
- Impact: Service NSW resubmission path wouldn't re-trigger cross-check (grant email path was fine)
- Fix: Added `cross_check_status: NOT_STARTED` reset to wwccFields in submitWWCCSection

**Files Created:**
- `SQL/SQL_migration_7_hotfix_constraints.sql` - Both CHECK constraint fixes in one file
- `SQL/SQL_migration_7_ocg_audit.sql` - Full OCG migration with constraint fixes included

**Files Modified:**
- `src/app/api/webhooks/ocg-verification/route.ts` - ESLint fix, broadened lookup filters, added nanny update error logging
- `src/app/nanny/verification/VerificationPageClient.tsx` - getBadgeStatus() and getDefaultOpen() handle all OCG statuses
- `src/lib/actions/verification.ts` - submitWWCCSection resets cross_check_status on resubmission
- `docs/04-technical/database/migrations/20260224_add_ocg_audit_columns.sql` - Added verification_status_check constraint fix

**DB Migrations Run (by user in Supabase SQL Editor):**
- `SQL_migration_7_hotfix_constraints.sql` — both CHECK constraint fixes
- `20260224_add_ocg_audit_columns.sql` — 9 OCG columns, authority constraint, trigger, expiry cron

**Live Testing Confirmed:**
- NOT FOUND: verification updated to status 26, surname-based lookup works
- CLEARED: verification updated to status 40, nanny updated to level 4 and active

### 2026-03-31 — Education App: Activities Tab, Layout Redesign, AI Prompt Improvements

**Activities Tab (new):**
- Added Activities as a dedicated tab in the education app bottom nav
- Server action `getActivities()` with cursor-based pagination (activity-type logs only)
- `BAppActivitiesView` component with infinite scroll + ActivityDetailSheet wired up
- Route pages for both nanny and parent at `/development/[childId]/activities`

**ActivityTile Redesign:**
- Removed description paragraph and recommendation line clutter
- Now shows: title (creativeName), recommendation line (blue), selected objectives as domain badge + milestone description rows (like report tile, without mastery levels)
- Badge always says "Activity" (not "Completed" after completion)
- "View Activity →" button opens ActivityDetailSheet from both feed and activities tab

**Activity Detail — Unlimited Completions:**
- "Complete & Report" button (now labeled "Log Activity") always shows regardless of activity status
- Activities can be completed and reported on unlimited times

**Activity AI Prompt Overhaul:**
- Rewrote system prompt to ban defaulting to peek-a-boo games
- Added rules: read milestone descriptions carefully, match activity to specific skill described
- Provided concrete milestone-to-activity mapping examples
- Listed diverse activity types (messy play, water play, music, sorting, construction, etc.)
- Reinforced specificity in user prompt

**Layout Redesign — Hub-Style Hero Card:**
- Removed fixed header bar and fixed bottom nav from BAppLayout
- Added hero card matching nanny/parent hub pattern: `rounded-2xl border bg-white shadow-sm` with emerald gradient strip, child initial avatar overlapping with `border-4 border-white shadow-md`, child name in `text-2xl font-bold`
- Tab bar moved inside hero card, styled as icon-only pills: `gap-0.5 rounded-lg bg-slate-100 p-0.5`, active `bg-white text-slate-900 shadow-sm`
- Tab icons: Home (Feed), Volleyball (Activities), BarChart3 (Progress), ImageIcon (Library)
- Tab order: Feed, Activities, Progress, Library
- FAB repositioned to `bottom-6` (no bottom nav bar)
- Content centered with `max-w-lg`
- Back button removed from hero card

**Feed View — Filter Tabs Removed:**
- Removed filter bar (All/Activities/Obs/Growth/Insights tabs) from feed
- Feed now shows all `context='adhoc'` items unfiltered

**Library View — Card Tile Wrapper:**
- Photo grid wrapped in `rounded-2xl border border-slate-200 bg-white shadow-sm` card
- Individual thumbnails now have `rounded-lg` corners
- Matches site-wide card aesthetic

**Files Created:**
- `src/app/nanny/development/[childId]/activities/page.tsx` — Activities route (nanny)
- `src/app/parent/development/[childId]/activities/page.tsx` — Activities route (parent)
- `src/lib/actions/bapp/activities-feed.ts` — Server action for activity-only feed

**Files Modified:**
- `src/components/bapp/BAppLayout.tsx` — Complete rewrite: hero card + icon-only tab bar replacing header + bottom nav
- `src/components/bapp/BAppFeedView.tsx` — Removed filter tabs and filterFeed logic
- `src/components/bapp/BAppActivitiesView.tsx` — Added ActivityDetailSheet, milestones prop, removed onViewActivity prop
- `src/components/bapp/BAppLibraryView.tsx` — Wrapped grid in card tile, added rounded-lg thumbnails
- `src/components/bapp/tiles/ActivityTile.tsx` — Replaced description with objectives list (DomainBadge + desc), kept recommendedLine, badge always "Activity"
- `src/components/bapp/sheets/ActivityDetailSheet.tsx` — "Log Activity" button always visible (unlimited completions)
- `src/lib/ai/prompts/bapp-activity-generation.ts` — Overhauled system + user prompts for activity variety and specificity

### 2026-05-07 — V1.1 A-09 polish wave (settings rebuild, tile improvements, FAB redesign, diary "Update", Katie polish)

Multi-surface ship covering ~30 user-visible changes. Full detail in `system/APP/Ammendments/V 1.1/PROGRESS.md` under A-09. Headlines:

**Settings (parent + nanny)** — formal sidebar/detail tree (Profile · Account · Linked children · Contact Us). Nanny Account contains a nested Verification sub-branch (Identity, WWCC). Internal verification-level numbers + tier names ("Level 4", "Provisionally verified") removed from all user copy — public language is binary Verified / Action required / Not started. Address picker reuses GNAF + Sydney service-area filter from verification. AU mobile validated client- and server-side, required at all times. Password change wired via Supabase reset-password email. Email change locked read-only (server flow + DB trigger left in place). Close-account is a small grey link at the bottom of Account view only.

**Tile system** — 3-dot delete menu on every tile (`TileActionMenu` + `softDeleteBAppLog` server action). Insight panel converted to expandable `InsightAccordion` with violet-gradient chrome matching CustomTile. ObservationTile no longer renders the "General" pill. CustomTile uses `data.title` as label and hides inline author. ActivityTile icon → Volleyball. CustomTile icon → SparkleIcon. New `hideAuthor` + `logId` props on TileHeader.

**FAB** — centred at viewport bottom, smaller, brand violet. Pop-up colours: Design Activity (was Plan Activity) = indigo + violet SparkleIcon; Observation = emerald-100/600 (matches Growth tile); Diary Entry = violet-100/600.

**Diary "Update"** — new free-form parent-update subtype mirroring General Observation. New `UpdateData` type, `UpdateTile` branch, top-of-list selection in `DiarySheet`, dynamic placeholder using `childFirstName`. Katie `log_update` tool (propose + apply) registered in diaryModule + `apply.ts` dispatch. 9 new tests.

**Hero card** — live age display (from DOB), pencil-edit dialog for name + DOB (`ChildDetailsEditor` + `updateChildDetails` action), back arrow to hub, Baby icon as default avatar.

**Children tab** — profile picture rendering, Baby fallback, full-width "Add Child" CTA when empty / inline link when populated, label fixed.

**Katie chat** — opens at bottom on load + on deck switch (`useLayoutEffect`); SparkleIcon only on streaming + most recent assistant message; user bubbles match universal tile chrome; lilac bg replaces beige; bottom-pinned input fixed (overflow-hidden on outer h-dvh wrapper); rounded chrome-tab silhouette via SVG; hover changes only text + icon to violet; tabs hidden on settings paths.

**Library grid** — flush Instagram-style (no rounded thumbnails, gap-0, uniform p-3 container padding).

**Tab reorders**:
- Parent: Children, Childcare, Babysitting
- Nanny main: Nannying, Children, Babysitting
- Nanny sub-tabs: Connections, Jobs (default Connections)

**Public /contact page** — rebuilt with `PublicContactForm`; `submitContactRequest` (auth) + `submitPublicContactRequest` (anon) emailing admin@babybloomsydney.com.au via Resend.

**Global sticky-footer** — `<MiniFooter />` passed as separate slot to `KatieShell` so it pins to viewport bottom on short pages and sits at end-of-content on long pages.

**Migrations applied to repo**:
- `supabase/migrations/katie-internal-notes.sql` — adds `bapp_logs.internal_notes TEXT`. App-layer SELECT enumeration in `getFeed` / `library` / `activities-feed` / `getActivity` excludes it from user-facing reads. Katie's `read_recent_feed` includes it for LLM context. **Apply to prod via Studio SQL editor before deploy.**
- `supabase/migrations/sync-user-profile-email.sql` — auth.users → user_profiles email mirror trigger. Studio rejected (auth.users ownership). App-level fallback lives in `/api/auth/callback/route.ts` (`syncUserProfileEmailIfNeeded`) — load-bearing path.

**Verification**: typecheck 0 · 60 test files / 741 tests passing · `npm run build` green · code-reviewer + typescript-reviewer + security-reviewer + database-reviewer + silent-failure-hunter ran in parallel across multiple rounds. HIGH findings closed before commit.

---

## 2026-05-15 — T-021 Parent mobile collection at signup (uncommitted)

**Mission:** Mandatory AU mobile capture at all parent signup entry points; `/signup/nanny` + apply funnel + parent settings + invite ergonomics untouched. No DB migration (`user_profiles.mobile_number text` already nullable).

**Files modified:**
- `src/lib/auth/actions.ts` — `signUp()` now reads `mobile_number` from FormData, role-conditionally normalises + validates against `^04\d{8}$` via `lib/au-contact.ts` helpers, persists `mobile_number: normalisedMobile` (string for parents, null for nannies) in the `user_profiles` insert.
- `src/app/(auth)/signup/page.tsx` · `src/app/(auth)/signup/parent/page.tsx` · `src/app/(funnel)/matchmaking/signup/MatchmakingSignupClient.tsx` — added `mobile` Zod field + `<FormField>` block mirroring `(funnel)/apply/components/stages/n1/N1Contact.tsx` UX (tel input, +61 prefix, real-time validation, formatted-number checkmark).

**Files created:**
- `src/__tests__/auth/signUp.spec.ts` — first unit tests for `signUp()` (6 cases). vi.hoisted shared mock state.

**Verification:** typecheck ✓ (after `rm -rf .next` to clear stale generated types) · vitest 1206/1206 ✓ · lint clean for diff (warnings exist in unrelated files) · 5-agent ECC review batch (code + ts + security + silent-failure + a11y) returned 0 CRITICAL · 4 HIGH · 11 MEDIUM · 1 LOW; 9 in-scope fixes applied (HIGH: actions.ts double-guard simplify, a11y live-region for valid cue, +61 prefix aria-hidden; MEDIUM: drop client-side normalise (server-canonical), fieldState.invalid for aria-invalid, text-green-700 WCAG AA contrast, hoist InsertCall type, mockClear test hygiene; LOW: tighten nanny test to toBeNull). Out-of-scope/pre-existing items logged in `system/OPERATIONS/ACTIVE/T-021-.../PROGRESS.md` Outstanding follow-ups.

**🚨 BLOCKER for ANY production deploy (NOT T-021):** `npm run build` fails at `app/src/app/admin/users/[userId]/subscription/page.tsx:221` with `react/no-children-prop` (`children={children}` prop usage). From prior payments-frontend commits `ab87961` + `4e8de33` (`builder090526`). T-021 push is gated on this being fixed first.

**State:** Phases A-E ☑ Shipped locally · Push HELD pending Bailey 3-step approval (commit, push, preview→promote) + pre-existing build blocker resolution. Visual baselines `signup-parent-{desktop,mobile,tablet}` need `--update-snapshots` against live dev server (out-of-band).
