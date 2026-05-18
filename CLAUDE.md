# CLAUDE.md - Baby Bloom Sydney

## ⚠️ TEAM COORDINATION — READ EVEN BEFORE ECC

> **You are part of a multi-agent team.** Multiple Claude sessions, sub-agents, and Bailey himself can be active concurrently. Coordination happens through the OPERATIONS folder at the project root. **This CLAUDE.md is the code-specific layer; the team-coordination layer lives one level up.**

**Mandatory reads at session start (before anything else, including the ECC section below):**

1. **[`/CLAUDE.md`](../../CLAUDE.md)** — top-level project CLAUDE.md. Mandates OPERATIONS reading.
2. **[`/system/OPERATIONS/README.md`](../../system/OPERATIONS/README.md)** — orientation: what's active, who's working what.
3. **[`/system/OPERATIONS/INDEX.md`](../../system/OPERATIONS/INDEX.md)** — current state of every active task.
4. **[`/system/OPERATIONS/PROTOCOLS/PLANNING-VS-IMPLEMENTATION.md`](../../system/OPERATIONS/PROTOCOLS/PLANNING-VS-IMPLEMENTATION.md)** — confirm whether you're a planning agent (writes specs) or coding agent (writes code). **CRITICAL.** Coding agents work from a handoff doc; planning agents do NOT touch app code.
5. **[`/system/OPERATIONS/PROTOCOLS/HANDLE-CONVENTION.md`](../../system/OPERATIONS/PROTOCOLS/HANDLE-CONVENTION.md)** — pick your handle (PREFERRED: actual session name).
6. **[`/system/OPERATIONS/PROTOCOLS/CONTEXT-REFRESH.md`](../../system/OPERATIONS/PROTOCOLS/CONTEXT-REFRESH.md)** — mandatory after every sub-task to prevent drift.
7. **[`/system/OPERATIONS/PROTOCOLS/SIGN-OFF-FORMAT.md`](../../system/OPERATIONS/PROTOCOLS/SIGN-OFF-FORMAT.md)** — every edit signed + timestamped. ANZ format with explicit `+10:00` / `+11:00` offset. Date-only fields banned.

After those reads, the ECC discipline below applies for the actual code work.

The hierarchy if rules conflict (highest wins):
1. `~/.claude/rules/` — base ECC rules.
2. **This file** — code-specific overrides for this project.
3. **`/CLAUDE.md`** + `/system/OPERATIONS/PROTOCOLS/*` — team-coordination layer.
4. Per-task `00-context.md` — task-specific notes.

If something here conflicts with the OPERATIONS protocols, this file wins for code-specific concerns; OPERATIONS wins for team-coordination concerns. Raise conflicts via `/system/OPERATIONS/INDEX.md` "Open KEY decisions" if uncertain.

---

## ECC Discipline (READ FIRST — NON-NEGOTIABLE)

> **ECC = Everything Claude Code** — the full set of skills, agents, rules,
> hooks, and MCP configs built into a production system for AI agent harnesses.
> Source: **https://github.com/affaan-m/everything-claude-code** (Anthropic
> hackathon winner; 140K+ stars). The local installs of ECC rules live at
> `~/.claude/rules/` and ECC skills at `~/.claude/skills/` — those directories
> are what `~/.claude/agents/` and the skill/agent invocation machinery actually
> consult.
>
> **After every compaction**, re-orient on ECC by: (a) re-reading this section,
> (b) if context is fuzzy, re-fetching the repo README with
> `gh api repos/affaan-m/everything-claude-code/readme --jq '.content' | base64 -d`
> to refresh on what the system covers, and (c) checking the agent list at the
> top of the session system prompt for what's currently loaded.
>
> **ECC is NOT design/frontend only.** It covers token optimization, memory
> persistence, continuous learning, verification loops, parallelization,
> security, TDD discipline, code review, architecture — the full engineering
> toolchain. This discipline applies to ALL work on this project — backend
> modules, API routes, tests, refactors, migrations, UI, everything.

### Before starting any non-trivial task
1. **Check the relevant ECC rules** under `~/.claude/rules/` — at minimum:
>   - `common/coding-style.md` · `common/testing.md` · `common/code-review.md` ·
>     `common/development-workflow.md` · `common/security.md`
>   - Language-specific overlays: `typescript/*.md` for this repo.
>   - For UI work: `web/design-quality.md` + `web/performance.md` +
>     `web/coding-style.md`.
2. **Pick the right ECC skill/agent** for the job rather than defaulting to
>   general-purpose coding. Examples:
>   - Planning a feature → `planner` or `code-architect` agent, not ad-hoc.
>   - After writing code → `code-reviewer` + `typescript-reviewer` agents
>     (MANDATORY for any TypeScript change per `code-review.md`).
>   - New feature → TDD loop using `tdd-guide` guidance.
>   - Type-heavy design (unions, narrowing, invariants) →
>     `type-design-analyzer`.
>   - Error handling paths → `silent-failure-hunter`.
>   - Build breakage → `build-error-resolver`.
>   - Database/SQL work → `database-reviewer`.
>   - Security-sensitive paths (auth, user input, API endpoints) →
>     `security-reviewer` (also MANDATORY per `security.md`).
3. **Run agents in parallel where they don't conflict.** Independent reviews
>   (code-reviewer + typescript-reviewer + silent-failure-hunter on the same
>   module) should go out in a single tool-call batch.

### Hard rules that come from the ECC rule set
- **80% test coverage minimum** for new code (`common/testing.md`).
- **TDD workflow:** test first, then minimum implementation, then refactor
  (`common/testing.md`). Writing code first without a test is a deviation
  that needs justification.
- **Files ≤ 800 lines, functions ≤ 50 lines** (`common/coding-style.md`).
  If a file is growing past this, split it before continuing.
- **No `any` in application code** — use `unknown` + narrow
  (`typescript/coding-style.md`).
- **Immutable updates** — never mutate, always return new objects
  (`common/coding-style.md`). Language-specific exceptions (e.g. Go pointer
  receivers) don't apply here — this is TypeScript.
- **`code-reviewer` agent run is MANDATORY after any code change**
  (`common/code-review.md`). Not optional, not "when I feel like it".

### Enforcement
- If a PR-sized unit of work lands without at least `code-reviewer` +
  `typescript-reviewer` having run on the new code, that's a process
  violation worth calling out.
- When in doubt about which skill/agent fits, check the agent list at the
  top of the session system prompt — every agent has a one-line description
  that usually answers the question.
- This ECC discipline supersedes anything else in this file if they conflict.

### Agent catalogue — who to invoke, when

Grouped by purpose so you can pick fast. Full one-line descriptions live at the top of every session system prompt; this is the quick-reference for *this* project.

**Planning & exploration**
- `planner` — complex features, architectural refactoring. PROACTIVE for feature requests.
- `code-architect` — designing a new feature against existing codebase patterns (blueprints with concrete files + interfaces + data flow + build order).
- `architect` — system-design trade-offs, scalability, big-picture decisions.
- `code-explorer` — tracing execution paths through an existing feature.
- `Explore` — fast codebase queries (`"where is X defined?"`, `"how do API endpoints work?"`). Specify thoroughness: quick / medium / very thorough.
- `Plan` — software-architect planning agent for implementation strategy.

**Test-first (MANDATORY for new code)**
- `tdd-guide` — enforces write-tests-first loop. PROACTIVE on new features, bug fixes, refactoring.
- `pr-test-analyzer` — reviews whether new tests cover real behaviour or are tautological.

**Code review (MANDATORY after any TypeScript change)**
- `code-reviewer` — general quality, patterns, best practices.
- `typescript-reviewer` — type safety, async correctness, Node/web security, idioms.

**Specialised review (invoke alongside the two above as warranted)**
- `security-reviewer` — auth, user input, API endpoints, secrets, OWASP Top 10. PROACTIVE after any code that handles user input, authentication, sensitive data.
- `silent-failure-hunter` — error handling paths: swallowed errors, bad fallbacks, missing error propagation.
- `type-design-analyzer` — discriminated unions, narrowing, invariant expression, enforcement.
- `database-reviewer` — SQL, migrations, RLS, query performance (Supabase-aware).
- `a11y-architect` — WCAG 2.2 compliance on UI components. PROACTIVE for design-system work.
- `performance-optimizer` — bottlenecks, bundle size, render perf, profiling.
- `comment-analyzer` — comment accuracy, completeness, rot risk.
- `healthcare-reviewer` — clinical safety, PHI compliance (not applicable here but exists).

**Build repair**
- `build-error-resolver` — TypeScript / build errors. Minimal-diff fixes, no architectural edits.

**Cleanup**
- `refactor-cleaner` — dead code removal via knip / depcheck / ts-prune.
- `code-simplifier` — clarity + consistency without behaviour change.

**E2E + UI verification**
- `e2e-runner` — Playwright test generation, maintenance, flakiness triage.

**Docs**
- `doc-updater` — codemap + README + guide updates. Runs `/update-codemaps` and `/update-docs`.
- `docs-lookup` — current library/framework docs via Context7 MCP.

**Meta / tooling**
- `harness-optimizer` — analyse + improve the local agent harness configuration.
- `loop-operator` — operate autonomous agent loops, intervene when stalled.
- `conversation-analyzer` — find behaviours worth preventing with hooks.
- `opensource-forker` / `opensource-sanitizer` / `opensource-packager` — three-stage open-source release pipeline.
- `claude-code-guide` — answers "how do I do X in Claude Code" questions.

### Common workflow recipes

**New feature (TDD loop)**
```
1. planner  → break into 15-min units, identify critical files
2. tdd-guide → write failing test
3. implement minimum to pass
4. [code-reviewer + typescript-reviewer + silent-failure-hunter]  ← parallel
5. apply HIGH + MEDIUM fixes
6. npm run lint && npm run typecheck && npm test && npm run build
7. commit with conventional-commit format
```

**Bug fix**
```
1. Reproduce with a failing test (tdd-guide)
2. Fix the root cause (not the symptom — no --no-verify shortcuts)
3. [code-reviewer + typescript-reviewer]  ← parallel
4. Verify test now passes + no regressions in full suite
5. Commit
```

**Security-sensitive path (auth, user input, API route)**
```
1. Implement with security-first mindset
2. [code-reviewer + typescript-reviewer + security-reviewer]  ← parallel
3. Address every CRITICAL + HIGH before commit
```

**Database / migration work**
```
1. [code-architect for schema design]
2. Write migration SQL + rollback SQL
3. [database-reviewer + code-reviewer]  ← parallel
4. Apply to local Supabase first, verify RLS
5. User applies to prod manually (never auto-apply production migrations)
```

**Build breakage**
```
1. build-error-resolver agent
2. Apply minimal-diff fix
3. Verify typecheck + build green
4. Commit
```

### Parallel invocation — the rule

Independent reviews run in a **single tool-call batch**, not one-after-another. Example from WU 8.7:

```
Agent({ subagent_type: "code-reviewer",           prompt: "..." })
Agent({ subagent_type: "typescript-reviewer",     prompt: "..." })
Agent({ subagent_type: "silent-failure-hunter",   prompt: "..." })
```

All three fire at once, return complementary findings. Applying them sequentially wastes parent-context tokens and review wall-clock time.

### Skill invocation

Skills are invoked via `Skill(<name>)` when the task matches the skill's description. Relevant for this project:

- `agentic-engineering` — decompose into 15-min verifiable units, cost-aware routing.
- `cost-aware-llm-pipeline` — Gemini budget tracking, prompt caching, fallback tiers.
- `database-migrations` — safe Supabase schema changes with rollback plans.
- `api-design` — RESTful + streaming API patterns, error envelopes.
- `ai-regression-testing` — AI behaviour stability across prompt/model changes.
- `frontend-design` — Katie's deck UI, anti-template discipline.

Available skills are listed in every session's system prompt. If a skill name isn't listed, **don't guess** — either the skill isn't installed or it has a different name.

### Research & reuse (before writing new code)

Per `common/development-workflow.md` §0:

1. **GitHub code search first** — `gh search repos`, `gh search code`. Find existing implementations / templates / patterns.
2. **Library docs second** — Context7 MCP or primary vendor docs for API behaviour + version specifics.
3. **Exa only when those two are insufficient** — broader web research.
4. **Check package registries** — npm, crates, etc. before hand-rolling utility code.
5. **Search for adaptable implementations** — open-source projects solving 80%+ of the problem.

Prefer adopting or porting a proven approach over writing net-new.

## Verification system — canonical references

> - Nanny: [`system/verification/nanny_verification/nanny_verification-data-systems.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/system/verification/nanny_verification/nanny_verification-data-systems.md)
> - Parent: [`system/verification/parent_verification/parent_verification_status_codes.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/system/verification/parent_verification/parent_verification_status_codes.md)
> - Code constants: `app/src/lib/verification.ts`
> **The old Tier 1-2-3 system is deprecated. Use `verification_level` (nanny 0-4, parent 0-1) + `verification_status` (grouped by tens). Do not use "Tier" language in new code or copy.**

## Efficiency Rules (READ FIRST — ALL AGENTS MUST FOLLOW)

### Context Loading Rules
Every task: Read CLAUDE.md + build-progress.md. Stop there unless task requires more.

**Bug fix:** Read ONLY the broken file. Check build-progress.md Known Bugs first.

**New page/component:** Read build-progress.md Component Registry + the closest existing page as reference. Do not read unrelated pages.

**Styling change:** Read ONLY the file being styled. No other files.

**Auth/middleware change:** Read src/lib/auth/actions.ts + src/lib/supabase/middleware.ts + src/middleware.ts. Nothing else.

**Database change:** Read docs/04-technical/database/schema.md. Nothing else from docs/.

**API/backend logic:** Read the relevant route file + schema.md if querying DB.

**Business logic features** (verification, matching, tiers): Also read docs/07-business-rules/.

**Do NOT read unless explicitly needed:**
- baby-bloom-master-blueprint.md
- baby-bloom-architecture-roadmap.md
- project-roles-and-workflow.md
- relationships.md
- best-practices-analysis.md
- Any file in docs/01-business/ or docs/02-users/
- Any file in planning/

**After completing any task:** Update build-progress.md with files created/modified.

### Response Style:
- Don't explain what you're about to do — just do it
- Don't repeat file contents back after editing — just confirm the file path and what changed
- Don't narrate your thought process — execute, then give a brief summary
- When fixing bugs, make the minimal change needed. Don't refactor surrounding code

### Agent Strategy
Classify every task before starting. Do not deliberate — pick one and go.

**Small** (1-5 files OR any bug fix):
→ Sequential. No agents. No exceptions.

**Large** (6+ new independent files):
→ Spawn 2-3 Sonnet agents. Never Opus agents.
→ No agent touches a file another agent touches.
→ Each agent reads CLAUDE.md + build-progress.md + only their files.
→ Max 3 agents. Never more.
→ Before spawning, verify enough context window remains for all agents to complete. If unsure, go sequential.

**Always sequential regardless of size:**
- Bug fixes
- Refactoring
- Anything touching shared files (auth, layouts, utilities, types)
- Any task where step order matters
- Database changes

**Agent failure recovery:**
If any agent fails or creates a conflict, stop all agents. Continue sequentially from the last working state.

### Dependency Awareness:
- Before creating any new component, check the Component Registry in build-progress.md
- Before installing any package, check if it's already in package.json
- Before creating utility functions, check src/lib/ for existing ones
- Don't create duplicate files — check first

### Compaction Protocol:
- Monitor context usage throughout the session
- Compact proactively at logical breakpoints — after completing each major task, not mid-task
- BEFORE every compact, update ALL of:
  - This CLAUDE.md (if project state changed — new phase, new decisions)
  - docs/04-technical/build-progress.md with:
    - Files created (full paths)
    - Files modified (full paths + what changed)
    - Current bugs/issues
    - Updated component registry
    - Exact next task to pick up
- Never compact mid-task. Finish the current logical unit first
- The build-progress.md file must always reflect the true current state so any new context window can resume perfectly

---

## Project Overview
Baby Bloom Sydney is a nanny matching platform for Sydney, Australia. We're rebuilding it from a manual Wix + Google Sheets system into a modern automated web app with AI-powered features.

**Tech Stack:** Next.js 14 (App Router), Supabase (PostgreSQL + Auth + Storage), OpenAI API (GPT-4o), Cloudinary (images), Vercel (hosting)

---

## Architecture Summary

### Database: 23 Tables across 6 domains (DEPLOYED to Supabase)

**Core Identity (2 tables + auth.users):**
- `auth.users` - Supabase Auth managed (not in public schema)
- `user_roles` - nanny, parent, admin
- `user_profiles` - shared data (name, email, location, profile pic)

**Nanny Domain (7 tables):**
- `nannies` - profile, experience, rates, status, verification tier
- `nanny_availability` - weekly schedule (JSONB)
- `nanny_credentials` - qualifications + certifications
- `nanny_assurances` - police checks, references
- `nanny_images` - ad images (Cloudinary URLs)
- `nanny_ai_content` - AI-generated bios, Facebook posts
- `verifications` - WWCC + passport verification tracking

**Parent Domain (4 tables):**
- `parents` - family info, current_nanny_id
- `nanny_positions` - open positions (ONE active per parent, enforced by unique index)
- `position_schedule` - weekly needs (JSONB)
- `position_children` - 1-3 children, ages stored in months (INTEGER)

**Matching & Requests (5 tables):**
- `interview_requests` - parent → nanny interview coordination
- `babysitting_requests` - one-time jobs
- `bsr_time_slots` - multiple time slots per babysitting request
- `bsr_notifications` - 20 closest nannies notified per job
- `nanny_placements` - hired nanny tracking (permanent record)

**Reference & Logs (5 tables):**
- `sydney_postcodes` - 194 suburbs with lat/lng for geolocation (SEEDED)
- `activity_logs` - complete audit trail
- `email_logs` - all system emails
- `user_progress` - funnel tracking
- `file_retention_log` - 5-year file deletion tracking

---

## Key Business Rules

### Verification (current system — see canonical docs linked at top)
**Nanny access gate = `nannies.verification_level` (integer 0-4):**
- 0 Signed Up · 1 Registered · 2 ID Verified · 3 Provisionally Verified (visible to parents, cannot accept engagements) · 4 Fully Verified (OCG confirmed, full access)

**Parent access gate = `parents.verification_level` (integer 0-1):**
- 0 Unverified · 1 Verified (ID + selfie confirmed)

**Communication / UI layer = `verification_status` (integer, grouped by tens)** on the `verifications` / `parent_verifications` tables. Drives dashboard copy, emails, admin queues, forms rendered. Nanny range: 0, 10–12, 20–29, 30, 40. Parent range: 0, 10–13, 20.

**Babysitting eligibility:** `verification_level >= 4 AND babysitter_eligible = true` on `nannies`.

### Constraints:
- ONE active position per parent (unique index)
- ONE active placement per parent (unique index)
- WWCC expiry auto-detected via daily cron → nanny `verification_level` drops to 2, `verification_status` → 23
- File retention: 5 years after account deactivation, then auto-delete

### Matching Algorithm:
**Regular Matching (nanny positions):**
- Hard filters: availability overlap, location proximity, child age experience, `verification_level >= 3`
- Weighted scoring: Rate 30%, Experience 25%, Qualifications 20%, Skills 15%, Other 10%

**Babysitting Matching (one-time jobs):**
- Find all nannies with `verification_level >= 4 AND babysitter_eligible = true` available at the requested time
- Calculate distance using sydney_postcodes lat/lng
- Select 20 closest, notify all simultaneously
- First to accept wins (timestamp determines)

---

## Database Design Decisions
- CITEXT for email fields (case-insensitive)
- UUID primary keys on all tables
- Child ages as INTEGER in months (0-180+)
- Merged qualifications + certifications into single `nanny_credentials` table
- Computed columns enforce business rules (visibility flags)
- Nanny placements have bidirectional references (parent.current_nanny_id ↔ nanny.current_placement_id)
- Partial indexes on active records only (performance)
- GIN indexes on JSONB columns (availability schedules)
- Foreign key cascades for referential integrity
- `updated_at` auto-update triggers on every table
- `placement_duration_days` computed only when ended (NULL while active - PG17 immutability requirement)

---

## User Journeys

### Nanny Flow:
Signup (level 0) → AI bio generated → Complete profile (level 1) → Submit passport + selfie + WWCC form → AI ID check passes (level 2) → WWCC auto-check passes (level 3, visible to parents, silent manual review queued) → Admin confirms WWCC on OCG portal (level 4) → Receive interview + babysitting requests → Get hired → Placement tracked

### Parent Flow:
Browse nannies publicly → Signup → See availability calendars → Create position (42-field form, ONE at a time) → See matched nannies → Request interview (pick 3 times) → AI emails nanny → Interview → Hire → Placement created → Can also post babysitting requests

### Admin Flow:
Monitor signups → Review/override AI verifications → Handle disputes → Track conversion metrics

---

## AI Integration Points
- **Provider:** OpenAI API (GPT-4o) — client at `app/src/lib/ai/client.ts`
- **Content generation:** Nanny bios (from 40-field form), Facebook posts (viral growth), interview emails
- **Verification:** Passport photo matching, WWCC document parsing, Facebook screenshot validation
- **Coordination:** Email sequencing (request → accept → confirm → remind), calendar invite generation

---

## File Structure

```
~/Desktop/BB/nanny-platform/
├── app/                              ← Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── (public)/             ← Public pages: landing, browse, about
│   │   │   ├── (auth)/               ← Auth pages: login, signup, forgot-password
│   │   │   ├── nanny/                ← Nanny dashboard (6 pages)
│   │   │   ├── parent/               ← Parent dashboard (6 pages)
│   │   │   ├── admin/                ← Admin dashboard (6 pages, real data)
│   │   │   └── api/                  ← API routes
│   │   ├── components/
│   │   │   ├── ui/                   ← shadcn/ui components
│   │   │   ├── layout/               ← Navbar, Footer, Sidebar, etc.
│   │   │   ├── dashboard/            ← StatsCard, StatusBadge, etc.
│   │   │   └── providers/            ← SessionProvider
│   │   ├── contexts/                 ← AuthContext
│   │   ├── lib/
│   │   │   ├── supabase/             ← Client, server, middleware
│   │   │   ├── auth/                 ← Types, roles, actions
│   │   │   └── ai/                   ← OpenAI client
│   │   └── middleware.ts             ← Route protection
│   └── .env.local                    ← Environment variables
├── docs/
│   ├── 01-business/                  ← business model, revenue (COMPLETE)
│   ├── 02-users/                     ← user journeys, permissions (COMPLETE)
│   ├── 04-technical/
│   │   ├── database/                 ← schema.md, supabase-setup.sql, rls-policies.sql (ALL DEPLOYED)
│   │   ├── build-progress.md         ← Session tracking (ACTIVE — agents must update this)
│   │   ├── prompt-templates.md       ← Reusable Claude Code prompts
│   │   └── api/                      ← API docs (TODO)
│   ├── 05-ai-integration/            ← AI overview (TODO)
│   └── 07-business-rules/            ← verification, access control, matching rules (COMPLETE)
└── planning/                         ← roadmap, blueprint, roles doc
```

---

## Database Deployment Status

### Supabase Project
- **Project Ref:** umkqevipzmoovyrnynrf
- **Region:** ap-northeast-1 (Tokyo)
- **PostgreSQL:** 17.6
- **Pooler:** aws-1-ap-northeast-1.pooler.supabase.com:5432

### Deployed Files (in order):
1. `supabase-setup.sql` — 23 tables, 7 functions, triggers, indexes, constraints (235 commands)
2. `rls-policies.sql` — RLS enabled on all 23 tables, helper functions, protection triggers, granular policies (253 commands)
3. `seed.sql` — 194 Sydney postcodes seeded (test user data requires auth users to be created first)

### Deployment Fixes Applied:
- `placement_duration_days` generated column: removed `now()` (not immutable in PG17), computes only when `ended_at` is set
- Verification block table count: corrected from 24 to 23 (auth.users is in auth schema, not public)

---

## Current Progress
- **Phase 0:** Business Foundation ✅ COMPLETE
- **Phase 1:** Database Schema ✅ COMPLETE — designed, documented, and DEPLOYED to Supabase
- **Phase 2:** Webapp Shell ✅ COMPLETE — layouts, auth, admin dashboard
  - Public pages: Landing, browse nannies, about ✅
  - Auth system: Signup (role-based), login, forgot/reset password ✅
  - Route protection middleware (role-based) ✅
  - Dashboard layouts for nanny, parent, admin ✅
  - Admin dashboard with REAL Supabase data ✅
  - Design: Violet (#8B5CF6), shadcn/ui components ✅
- **Phase 3:** Core Features ✅ COMPLETE
  - Signup bug fixed (admin client bypasses RLS) ✅
  - Nanny profile form (8-section, ~40 fields) ✅
  - Browse nannies with real data ✅
  - Parent position creation (7-section form) ✅
  - Interview request flow (create/accept/decline/cancel) ✅
- **Phase 4:** AI Integration — NOT STARTED
- **Phase 5:** Polish & Deploy — NOT STARTED

**Next priorities:**
- Verification upload flow (WWCC + Passport)
- Nanny detail page (full profile view for parents)
- Babysitting request flow
- Email notifications

---

## Code Style & Conventions
- PostgreSQL with Supabase extensions (uuid-ossp, citext, pg_trgm)
- SQL: lowercase keywords, snake_case table/column names
- Use `TIMESTAMPTZ` for all timestamps (UTC)
- All tables get: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
- Use `REFERENCES` with `ON DELETE` clauses for all foreign keys
- Comment all tables and complex columns in SQL
- TypeScript strict mode
- React Server Components by default, 'use client' only when needed
- shadcn/ui for all UI components — check Component Registry before creating custom ones
