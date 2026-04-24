> **Verification system — canonical references:**
> - Nanny: [`system/verification/nanny_verification/nanny_verification-data-systems.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/system/verification/nanny_verification/nanny_verification-data-systems.md)
> - Parent: [`system/verification/parent_verification/parent_verification_status_codes.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/system/verification/parent_verification/parent_verification_status_codes.md)
> - Code constants: `app/src/lib/verification.ts`
> **The old Tier 1-2-3 system is deprecated. Use `verification_level` (nanny 0-4, parent 0-1) + `verification_status` (grouped by tens). Do not use "Tier" language in new code or copy.**

# Baby Bloom Sydney — Comprehensive Project Context

**Last Updated:** 2026-02-18
**Author:** Bailey (Founder) + Claude Code
**Purpose:** Full context document for continuing development across sessions

---

## 1. VISION & END RESULT

### What We're Building
Baby Bloom Sydney is a **free AI-powered nanny matching platform** for Sydney, Australia. It replaces a manual system (Wix website + Google Sheets + Make.com automations) with a modern, automated web app.

### The End Product
A fully automated platform where:
- **Nannies** create professional profiles via a guided form, get AI-generated bios, verify their identity, and receive interview requests and babysitting jobs — all without manual admin work
- **Parents** browse verified nannies, create nanny positions with detailed requirements, get AI-matched nanny recommendations, request interviews, and post one-time babysitting jobs
- **Admins** monitor the pipeline, review AI verification decisions, handle edge cases, and track metrics — but 95% of operations are automated by AI

### Why It's Free
Baby Bloom is a **lead magnet** for a future premium product: an EYLF-based educational tracking app for parents. The matching platform builds trust and a user base. Competitors charge $400–$1,200 for nanny placement — Baby Bloom charges $0.

### Future Revenue (Out of Current Scope)
1. Parent subscriptions to the educational tracking app
2. Nanny commissions on parent signups they facilitate
3. Optional training bundles (Baby Bloom trains nannies in child development)

### Geographic Scope
Sydney suburbs only. 194 suburbs seeded with lat/lng coordinates for geolocation matching.

---

## 2. TECH STACK

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Database | Supabase (PostgreSQL 17.6 + Auth + Storage) |
| AI | OpenAI API (GPT-4o) |
| Images | Cloudinary |
| UI | shadcn/ui (violet #8B5CF6 theme) |
| Hosting | Vercel |
| Region | ap-northeast-1 (Tokyo) |

**Supabase Project:** `umkqevipzmoovyrnynrf`

---

## 3. USER ROLES & JOURNEYS

### 3.1 Nanny Journey (`verification_level` 0–4)

Access gate is a single integer on `nannies.verification_level`. See canonical doc for the full status-code table that drives dashboard copy + emails.

**Level 0 — Signed Up:** Account created; profile form not yet completed.
**Level 1 — Registered:** 9-step registration filled, AI bio generated. Profile NOT visible to parents yet. Cannot receive any requests.
**Level 2 — ID Verified:** Passport + selfie confirmed (AI auto-pass OR admin manual verify). Still not visible to parents; waiting on WWCC.
**Level 3 — Provisionally Verified:** WWCC auto-check passed. Profile visible to parents in search, but still CANNOT accept interview or babysitting requests. Admin reviews WWCC silently on OCG portal.
**Level 4 — Fully Verified:** Admin confirmed WWCC on OCG. Full access — accept interviews + (if `babysitter_eligible=true`) babysitting jobs.

**Receiving Opportunities:**
- Interview Requests: Email with parent info + 3 proposed times → nanny picks one → calendar invites sent
- Babysitting: Notified when in closest 20 nannies to a job → first to accept wins

### 3.2 Parent Journey (`verification_level` 0–1)

Binary gate on `parents.verification_level`. Verification happens once; there is no downgrade path.

**Level 0 — Unverified:** Account exists. Can browse nanny profiles, view availability, read inbox. Cannot send connection requests or babysitting requests.
**Level 1 — Verified:** Photo ID + selfie confirmed (AI auto-pass OR admin manual verify). Full parent-side access.

**Position creation** (creating an open nanny position) is available to parents at any level — position setup is independent of verification. The gate only kicks in at the *connection / babysitting request* step.

**Babysitting:** Posts a babysitting request (up to 7 time slots). System notifies the 20 closest nannies with `verification_level >= 4 AND babysitter_eligible = true`. First to accept wins.
- First nanny to accept wins

### 3.3 Admin
- Monitor signups, review AI verification decisions (approve/override/reject)
- Handle edge cases, disputes, email bounces
- Track conversion metrics across the funnel
- Quality control: spot-check AI bios, audit verification accuracy

---

## 4. DATABASE — 23 Tables (All Deployed to Supabase)

### Core Identity
| Table | Purpose |
|-------|---------|
| `user_roles` | Maps auth.users → role (nanny/parent/admin/super_admin) |
| `user_profiles` | Shared profile data (name, email, mobile, location, picture) |
| `verifications` | WWCC + passport verification tracking, status, rejection reasons |

### Nanny Domain
| Table | Purpose |
|-------|---------|
| `nannies` | Main nanny entity (~50 columns): experience, preferences, rates, status, verification tier, computed visibility flags |
| `nanny_availability` | Weekly schedule (JSONB), days available |
| `nanny_credentials` | Qualifications + certifications (merged table) |
| `nanny_assurances` | Police checks, references |
| `nanny_images` | Cloudinary image URLs for ads/gallery |
| `nanny_ai_content` | AI-generated bios, headlines, pitches |
| `sydney_postcodes` | 194 suburbs with lat/lng (seeded reference data) |

### Parent Domain
| Table | Purpose |
|-------|---------|
| `parents` | Main parent entity: family info, current nanny/placement refs |
| `nanny_positions` | Open positions (ONE active per parent — unique index) |
| `position_schedule` | Weekly schedule requirements (JSONB) |
| `position_children` | 1-3 children per position (age in months, gender, label A/B/C) |

### Matching & Requests
| Table | Purpose |
|-------|---------|
| `interview_requests` | Parent→nanny interview coordination (proposed times, status, outcome) |
| `babysitting_requests` | One-time jobs (location, rate, status, ratings) |
| `bsr_time_slots` | Multiple time slots per babysitting request |
| `bsr_notifications` | 20 closest nannies notified per job (tracks acceptance) |
| `nanny_placements` | Hired nanny tracking (permanent record, satisfaction ratings) |

### Reference & Logs
| Table | Purpose |
|-------|---------|
| `user_progress` | Funnel stage tracking (signup → tier upgrades → first hire) |
| `activity_logs` | Complete audit trail (30+ action types) |
| `email_logs` | All system emails (status, provider response) |
| `file_retention_log` | 5-year file deletion tracking (GDPR compliance) |

### Key Computed Columns on `nannies`:
- `fully_verified` = `wwcc_verified AND identity_verified`
- `visible_in_match_making` = `status = 'active' AND wwcc_verified AND identity_verified`
- `visible_in_bsr` = same as match_making (Tier 3 check done at query time)
- `profile_visible` = `status IN ('active', 'pending_verification')`

### Key Constraints:
- ONE active position per parent (unique partial index)
- ONE active placement per parent (unique partial index)
- WWCC expiry auto-disables via daily cron
- File retention: 5 years after account deactivation

### Deployed SQL Files:
1. `docs/04-technical/database/supabase-setup.sql` — 23 tables, 7 functions, triggers, indexes (235 commands)
2. `docs/04-technical/database/rls-policies.sql` — RLS on all 23 tables, helper functions, granular policies (253 commands)
3. `docs/04-technical/database/seed.sql` — 194 Sydney postcodes with lat/lng

---

## 5. AI INTEGRATION POINTS

### Implemented:
- **Nanny Bio Generation** (`lib/actions/nanny.ts` → `generateNannyBio`): GPT-4o generates 150-250 word professional bio from form data. Third person, warm but professional. Fires in background after profile creation.

### Designed (Prompts Written, Not Yet Wired):
- **Passport Verification** (`docs/05-ai-integration/prompts/passport-verification.md`): Extract document data, detect tampering, check expiry, return confidence score + recommendation (APPROVE/MANUAL_REVIEW/REJECT). Thresholds: 95%+ auto-approve, 70-94% manual review, <70% reject.
- **WWCC Verification** (`docs/05-ai-integration/prompts/wwcc-verification.md`): Extract WWCC number from card photo, validate format (`WWC` + 7 digits + P/V), check card type (Paid only, not Volunteer). Assists admin manual check via NSW portal.
- **Email Coordination** (`docs/05-ai-integration/prompts/email-coordination.md`): Generate personalized interview request emails, confirmation emails, and reminder emails. Under 200 words, warm professional tone.
- **Facebook Post Generation**: AI generates viral-style post scripts for nannies to share. Not yet documented in detail.

---

## 6. WHAT'S BEEN BUILT (Current State)

### Phase 0: Business Foundation — COMPLETE
All business docs, user journeys, revenue model, competitive analysis documented.

### Phase 1: Database Schema — COMPLETE
23 tables designed, documented, and deployed to Supabase with RLS policies and seed data.

### Phase 2: Webapp Shell — COMPLETE
- Public pages: Landing, browse nannies, about, how it works, pricing, contact
- Auth: Signup (role-based), login, forgot/reset password
- Route protection middleware (role-based)
- Dashboard layouts for nanny, parent, admin (sidebar + mobile nav)
- Admin dashboard with REAL Supabase data
- Dev mode: auth bypass, mock data, DevSidebar for navigation

### Phase 3: Core Features — COMPLETE
- **Signup bug fix**: Admin client bypasses RLS during signup
- **Nanny profile form**: 8-section tabbed editor for existing profiles (~40 fields)
- **Browse nannies**: Public + authenticated views with real data
- **Parent position creation**: 7-section tabbed form, one-active-position enforcement
- **Interview request flow**: Full create/accept/decline/cancel cycle

### Phase 3.5: Form Rebuild to Match Wix Specs — COMPLETE (Current Session)

All 3 forms rebuilt as multi-step funnels matching the original Wix form specifications exactly:

#### Nanny Registration Form (9 steps + review)
**Route:** `/nanny/register`
**Funnel:** `NannyRegistrationFunnel.tsx` — `NannyRegistrationData` interface
**Steps:**
1. **StepIntro** — Welcome page, "Create your nanny profile" + Start button
2. **StepExperience** — 4 experience dropdowns (0-10+) + details textarea, progressive reveal
3. **StepQualifications** — Qualification dropdown → assurances tags → certificates tags, progressive reveal
4. **StepPreferences** — Role types → support level → max children → age range → additional needs, progressive reveal
5. **StepAvailability** — Days multi-select → per-day time slots → start timing → placement duration
6. **StepSalary** — Hourly rate tags ($35/$40/$45/$50) → pay frequency tags
7. **StepHelpfulInfo** — DOB → 18+ check → languages → license → car → pets → vaccination → non-smoker, progressive reveal
8. **StepResidency** — Nationality dropdown (~170 countries) → conditional residency status → right to work → Sydney resident → suburb/postcode
9. **StepAboutYou** — 3 textareas + photo upload + confirmation checkbox
10. **StepReview** — 8 section cards displaying all data, submit button

**Server Action:** `createNannyProfile()` in `lib/actions/nanny.ts` — transforms form data → DB format, triggers AI bio generation

#### Parent Nanny Request Form (5 steps)
**Route:** `/parent/request`
**Funnel:** `ParentRequestFunnel.tsx` — `ParentRequestData` interface
**Steps:**
1. **StepPlacement** — Urgency tags, start date, placement length tags, conditional end date
2. **StepRoster** — Schedule type tags, hours/week, day selection, per-day time blocks, roster details textarea
3. **StepRequirements** — ALL optional: language, age, experience, qualification, certificates, assurances, residency, Yes/No attributes, hourly rate, pay frequency
4. **StepChildren** — Number of children (1/2/3), conditional child age + gender per child, child needs
5. **StepAboutRole** — Suburb, postcode, reason for nanny (multi-select), support level, responsibilities, about family

**Server Action:** `// TODO: wire to server action` — not yet connected to Supabase

#### ID Verification Form (4 steps)
**Route:** `/nanny/verify`
**Funnel:** `IDVerificationFunnel.tsx` — `IDVerificationData` interface
**Steps:**
1. **StepVerifyIntro** — Checklist of items needed (passport, photo, WWCC)
2. **StepIdentification** — Surname, given names, DOB, passport country dropdown, 2 file upload zones, confirmation checkbox
3. **StepWWCC** — Method selection (Grant Email/Service NSW/Manual Entry), all require WWCC number entry, conditional file uploads, confirmation checkbox
4. **StepContactDetails** — Phone (AU flag), address fields (line, city, state dropdown, postcode, country=Australia readonly)

**Server Action:** `// TODO: wire to server action` — not yet connected to Supabase

---

## 7. ALL ROUTES (34 Pages)

### Public
| Route | Page |
|-------|------|
| `/` | Landing page |
| `/nannies` | Browse all nannies (public) |
| `/nannies/[id]` | Individual nanny profile |
| `/how-it-works` | How it works |
| `/pricing` | Pricing |
| `/contact` | Contact |
| `/about` | About |

### Auth
| Route | Page |
|-------|------|
| `/login` | Login |
| `/signup` | Signup role selector |
| `/signup/nanny` | Nanny signup |
| `/signup/parent` | Parent signup |
| `/forgot-password` | Forgot password |
| `/reset-password` | Reset password |

### Nanny Dashboard
| Route | Page |
|-------|------|
| `/nanny/dashboard` | Dashboard |
| `/nanny/register` | Registration form (9-step funnel) |
| `/nanny/profile` | View/edit profile (8-tab form) |
| `/nanny/verify` | ID verification form (4-step funnel) |
| `/nanny/verification` | Verification status page |
| `/nanny/interviews` | Interview requests |
| `/nanny/babysitting` | Babysitting opportunities |
| `/nanny/settings` | Settings |

### Parent Dashboard
| Route | Page |
|-------|------|
| `/parent/dashboard` | Dashboard |
| `/parent/browse` | Browse nannies (authenticated) |
| `/parent/position` | Create/manage nanny position (7-tab form) |
| `/parent/request` | Nanny request form (5-step funnel) |
| `/parent/interviews` | Interview requests |
| `/parent/babysitting` | Babysitting |
| `/parent/settings` | Settings |

### Admin Dashboard
| Route | Page |
|-------|------|
| `/admin/dashboard` | Dashboard (real Supabase data) |
| `/admin/users` | User management |
| `/admin/verifications` | Verification queue |
| `/admin/pipeline` | User pipeline |
| `/admin/analytics` | Analytics |
| `/admin/settings` | Settings |

---

## 8. SERVER ACTIONS (What's Wired to Supabase)

### `src/lib/actions/nanny.ts`
| Function | Status | Description |
|----------|--------|-------------|
| `getNannyProfile()` | WORKING | Fetches user_profiles + nannies for auth user |
| `updateNannyProfile(data)` | WORKING | Updates both tables, revalidates |
| `isProfileComplete()` | WORKING | Checks required fields exist |
| `createNannyProfile(data)` | WORKING | Creates profile, fires AI bio generation |
| `generateNannyBio()` | WORKING | GPT-4o bio, saves to nanny_ai_content |

### `src/lib/actions/parent.ts`
| Function | Status | Description |
|----------|--------|-------------|
| `getParentId()` | WORKING | Returns parent record ID |
| `getPosition()` | WORKING | Fetches active position + children |
| `createPosition(data)` | WORKING | Inserts position + children, enforces one-active |
| `updatePosition(id, data)` | WORKING | Updates position, recreates children |
| `closePosition(id)` | WORKING | Sets status to cancelled |

### `src/lib/actions/interview.ts`
| Function | Status | Description |
|----------|--------|-------------|
| `createInterviewRequest(nannyId, times, msg)` | WORKING | Creates request, prevents duplicates |
| `getParentInterviewRequests()` | WORKING | All requests for parent with nanny details |
| `getNannyInterviewRequests()` | WORKING | All requests for nanny with parent details |
| `acceptInterviewRequest(id, time)` | WORKING | Sets accepted + selected time |
| `declineInterviewRequest(id)` | WORKING | Sets declined |
| `cancelInterviewRequest(id)` | WORKING | Sets cancelled |

### NOT YET WIRED:
- Parent nanny request form (`/parent/request`) → no server action yet
- ID verification form (`/nanny/verify`) → no server action yet
- Babysitting request flow → no server action yet
- File uploads to Supabase Storage → not implemented
- Email sending → not implemented
- Matching algorithm → not implemented

---

## 9. KEY DESIGN PATTERNS

### Form Pattern: Multi-Step Funnel
- `FunnelProgress` component shows step indicators (mobile: dots, desktop: labeled steps)
- Each step is a separate component receiving `StepProps` (data, updateData, goNext, goBack)
- Progressive reveal: fields appear one-by-one as previous fields are answered
- Tag/pill UI for single-select and multi-select (violet selected, slate unselected)
- Conditional rendering based on answers (e.g., residency status only shows if not Australian)
- Dev mode: `NEXT_PUBLIC_DEV_MODE=true` pre-fills mock data, bypasses auth

### Form Pattern: Tabbed Editor
- Used for editing existing profiles/positions (NannyProfileForm, PositionForm)
- All sections visible via tabs, save button per section

### Auth Pattern
- Supabase Auth handles signup/login
- `createAdminClient()` bypasses RLS for post-signup inserts
- Middleware protects routes by role
- Dev mode bypasses all auth

### Component Conventions
- Named exports only (not default)
- `"use client"` only when needed
- shadcn/ui components in `src/components/ui/`
- Violet (#8B5CF6) primary color throughout

---

## 10. WHAT'S NOT BUILT YET (Remaining Work)

### High Priority (Makes Forms Functional)
1. **Wire Parent Request form to Supabase** — create server action for `/parent/request`
2. **Wire ID Verification form to Supabase** — create server action for `/nanny/verify`, write to `verifications` table
3. **File uploads to Supabase Storage** — passport photos, WWCC docs, profile pictures (currently just storing file names)

### Medium Priority (Core Platform Features)
4. **Nanny detail page** — full profile view for parents at `/nannies/[id]` (exists but may need enhancement)
5. **Matching algorithm** — weighted scoring for nanny positions, geolocation for babysitting
6. **Babysitting request flow** — create/accept/notify cycle, 20-closest-nannies logic
7. **Email notifications** — interview requests, confirmations, reminders, babysitting alerts (prompts designed, sending not implemented)
8. **AI verification flows** — passport photo analysis, WWCC document parsing, Facebook screenshot validation (prompts designed, not wired)

### Lower Priority (Polish & Scale)
9. **Facebook post generation** — AI creates viral post scripts for nannies
10. **Facebook screenshot verification** — Tier 3 unlock flow
11. **Parent ID verification for babysitting** — admin review flow
12. **WWCC expiry monitoring** — daily cron alerts at 30/7/0 days
13. **Position auto-close** — 30+ day inactivity detection + AI email
14. **Calendar invite generation** — for confirmed interviews
15. **Activity logging** — write to activity_logs on all actions
16. **Admin verification queue** — review AI decisions, approve/override/reject
17. **Admin user management** — suspend/reinstate users
18. **Visual polish** — form styling refinement, responsive tweaks, loading states

### Out of Current Scope
- Educational tracking app (future product)
- Payment system
- Geographic expansion beyond Sydney
- Mobile app

---

## 11. FILE STRUCTURE (Key Directories)

```
BB/nanny-platform/
├── CLAUDE.md                         ← AI agent instructions
├── docs/
│   ├── 01-business/                  ← Business model, revenue, growth strategy
│   ├── 02-users/                     ← User types, journeys, permissions
│   ├── 03-features/                  ← Feature specs (onboarding, verification, matching, comms, social)
│   ├── 04-technical/
│   │   ├── database/                 ← schema.md, supabase-setup.sql, rls-policies.sql, seed.sql
│   │   └── build-progress.md         ← Session-by-session build tracking
│   ├── 05-ai-integration/            ← AI prompt templates (bio, passport, wwcc, email)
│   ├── 06-existing-system/           ← Wix/Sheets migration docs (templates, not filled)
│   ├── 07-business-rules/            ← Verification, matching, access control rules
│   └── 08-development/               ← Dev workflow, testing strategy
├── planning/                         ← Roadmap, milestones, decisions, daily logs
├── app/
│   └── src/
│       ├── app/
│       │   ├── (public)/             ← Landing, browse, about, how-it-works, pricing, contact
│       │   ├── (auth)/               ← Login, signup, forgot/reset password
│       │   ├── nanny/                ← Dashboard, register, profile, verify, verification, interviews, babysitting, settings
│       │   ├── parent/               ← Dashboard, browse, position, request, interviews, babysitting, settings
│       │   └── admin/                ← Dashboard, users, verifications, pipeline, analytics, settings
│       ├── components/
│       │   ├── ui/                   ← shadcn/ui (button, card, input, sheet, dialog, funnel-progress, etc.)
│       │   ├── layout/               ← Navbar, Footer, Sidebar, SidebarItem, DashboardHeader, MobileNav
│       │   ├── dashboard/            ← StatsCard, StatusBadge, EmptyState, UserAvatar
│       │   ├── forms/                ← NannyProfileForm, PositionForm (tabbed editors)
│       │   ├── dev/                  ← DevSidebar (all-routes navigator in dev mode)
│       │   └── providers/            ← SessionProvider
│       ├── contexts/                 ← AuthContext
│       ├── lib/
│       │   ├── supabase/             ← client.ts, server.ts, admin.ts, middleware.ts
│       │   ├── auth/                 ← types.ts, roles.ts, actions.ts
│       │   ├── actions/              ← nanny.ts, parent.ts, interview.ts (server actions)
│       │   ├── ai/                   ← client.ts (OpenAI)
│       │   └── utils.ts              ← cn() helper
│       └── middleware.ts             ← Route protection
```

---

## 12. DEVELOPMENT ENVIRONMENT

### Dev Mode (`NEXT_PUBLIC_DEV_MODE=true`)
- Auth bypassed entirely
- Forms pre-filled with realistic mock data
- DevSidebar shows all 34 routes organized by section
- Server actions work with mock user IDs

### Running Locally
```bash
cd BB/nanny-platform/app
npm run dev  # → http://localhost:3000
```

### Environment Variables (`.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_DEV_MODE`

---

## 13. KNOWN ISSUES

- 2 pre-existing TypeScript errors in `nanny/profile/page.tsx` (unrelated to recent work)
- Form RTF source files referenced in earlier sessions may not exist in the repo (they were external documents used for spec reference)
- Growth strategy doc (`docs/01-business/growth-strategy.md`) is a template — no concrete figures filled in
- Migration docs (`docs/06-existing-system/`) are templates — no actual migration executed yet

---

## 14. SESSION HISTORY (Key Milestones)

| Date | What Was Done |
|------|--------------|
| 2026-02-05 | Database schema finalized (v3.0), deployed to Supabase |
| 2026-02-06 | Phase 2 (webapp shell) + Phase 3 (core features) completed |
| 2026-02-06 | Nanny registration funnel v1 (7 steps) |
| 2026-02-18 | All 3 forms rebuilt to match Wix specs exactly |
| 2026-02-18 | Nanny registration: 9 steps + review (10 step components) |
| 2026-02-18 | Parent nanny request: 5 steps (new form) |
| 2026-02-18 | ID verification: 4 steps (new form) |
| 2026-02-18 | Navigation updated (Sidebar, MobileNav, DevSidebar) |
| 2026-02-18 | WWCC fix: all methods require manual number entry |
