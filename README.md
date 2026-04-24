# Baby Bloom Sydney

> A platform connecting parents with trusted nannies in Sydney.

---

## Project Status

🔄 **Currently:** Rebuilding from prototype to production-ready platform

| Current Stack | New Stack |
|---------------|-----------|
| Wix | Next.js 14 |
| Google Sheets | Supabase (PostgreSQL) |
| Make.com | Supabase Edge Functions |
| Various scripts | TypeScript codebase |
| Manual hosting | Vercel |

---

## Quick Navigation

| Section | Description |
|---------|-------------|
| [STRUCTURE-MAP.md](STRUCTURE-MAP.md) | Complete directory structure |
| [docs/01-business/](docs/01-business/) | Business model, revenue, strategy |
| [docs/02-users/](docs/02-users/) | User personas and journeys |
| [docs/03-features/](docs/03-features/) | Feature specifications |
| [docs/04-technical/](docs/04-technical/) | Architecture, database, API |
| [docs/05-ai-integration/](docs/05-ai-integration/) | AI features and prompts |
| [docs/06-existing-system/](docs/06-existing-system/) | Current system documentation |
| [docs/07-business-rules/](docs/07-business-rules/) | Policies and validation rules |
| [docs/08-development/](docs/08-development/) | Developer guides |
| [planning/](planning/) | Timeline, milestones, logs |

---

## Project Structure

```
nanny-platform/
├── README.md                 # This file
├── STRUCTURE-MAP.md          # Complete structure guide
│
├── docs/
│   ├── 01-business/          # Business model & strategy
│   ├── 02-users/             # User types & journeys
│   ├── 03-features/          # Feature specifications
│   │   ├── onboarding/       # Signup, profiles, AI generation
│   │   ├── verification/     # ID, WWCC, badges
│   │   ├── matching/         # Search, geolocation, requests
│   │   ├── communication/    # Email, interviews, notifications
│   │   └── social/           # Facebook integration
│   ├── 04-technical/         # Technical documentation
│   │   ├── architecture/     # System design
│   │   ├── database/         # Schema, relationships
│   │   ├── api/              # Endpoints, auth
│   │   └── frontend/         # Pages, components
│   ├── 05-ai-integration/    # AI strategy & prompts
│   │   └── prompts/          # AI prompt templates
│   ├── 06-existing-system/   # Current Wix/Sheets/Make docs
│   │   ├── wix-scripts/
│   │   ├── gas-scripts/
│   │   ├── make-blueprints/
│   │   └── github-scripts/
│   ├── 07-business-rules/    # Policies & rules
│   └── 08-development/       # Developer guides
│
├── planning/                 # Project planning
│   ├── timeline.md
│   ├── milestones.md
│   ├── daily-logs.md
│   └── decisions.md
│
└── scripts/                  # Utility scripts (future)
```

---

## Getting Started

### Documentation Phase (Current)
1. Review the [STRUCTURE-MAP.md](STRUCTURE-MAP.md) for full directory structure
2. Fill in documentation templates with project specifics
3. Start with `06-existing-system/` to document current prototype
4. Then move to `01-business/` and `02-users/` for requirements

### Development Phase (Future)
```bash
# Clone the repo
git clone [repo-url]
cd baby-bloom-sydney

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local

# Start local Supabase
supabase start

# Run development server
pnpm dev
```

See [docs/08-development/setup-guide.md](docs/08-development/setup-guide.md) for full setup instructions.

---

## AI-Assisted Development — ECC

> **ECC = Everything Claude Code**. Source: https://github.com/affaan-m/everything-claude-code
>
> ECC is the full production harness for Claude Code sessions — a curated set of rules (workflow + style + security), skills (deep how-to references), and specialised agents (review / planning / build repair / etc.). The local install lives at `~/.claude/rules/` and `~/.claude/skills/`; the loaded agent list is visible at the top of every session's system prompt.
>
> **Everything in this repo is built under ECC discipline** — not just UI work. It governs backend modules, API routes, migrations, tests, refactors, docs. The canonical rules and scope for this project are in [`CLAUDE.md`](CLAUDE.md) §"ECC Discipline" — read that first, this section is the overview.

### What ECC gives you

| Layer | Purpose | Where it lives |
|---|---|---|
| **Rules** | Style, testing, security, workflow, code-review, git — the hard rules every change must satisfy | `~/.claude/rules/common/*.md` + `~/.claude/rules/typescript/*.md` + `~/.claude/rules/web/*.md` |
| **Skills** | Deep how-to references invoked via `Skill()` — `database-migrations`, `api-design`, `cost-aware-llm-pipeline`, `frontend-design`, `ai-regression-testing`, `agentic-engineering` | `~/.claude/skills/` |
| **Agents** | Specialised subagents invoked in parallel via `Agent()` — each has a narrow focus and runs in its own context window | `~/.claude/agents/` |
| **Hooks** | PostToolUse format/lint/typecheck, PreToolUse size-guards, Stop build verification | Project `.claude/settings.json` + global `~/.claude/settings.json` |
| **MCP** | Model Context Protocol servers — Gmail, Calendar, Drive, Context7 docs, and more | Configured in Claude Code settings |

### Core workflow for any non-trivial change

```
1. RESEARCH & REUSE     ← GitHub code search + library docs + package registries
2. PLAN                 ← planner / code-architect agent (not ad-hoc)
3. TDD                  ← test first (tdd-guide), then minimum implementation
4. CODE REVIEW          ← code-reviewer + typescript-reviewer agents (MANDATORY, parallel)
5. SPECIALISED REVIEW   ← security-reviewer / silent-failure-hunter / type-design-analyzer / database-reviewer as warranted
6. APPLY FIXES          ← HIGH always, MEDIUM where cheap
7. VERIFY               ← npm run lint · npm run typecheck · npm test · npm run build
8. COMMIT               ← conventional commit format, Co-Authored-By trailer
```

### Agent catalogue (project-relevant subset)

| Purpose | Agent | When to use |
|---|---|---|
| **Planning** | `planner` | Complex features, architectural refactoring |
| | `code-architect` | Designing a new feature against existing codebase patterns |
| | `architect` | System-design trade-offs, scalability decisions |
| | `code-explorer` | Tracing execution paths in an existing feature |
| | `Explore` | Fast codebase queries — "where is X defined?" |
| **Test-first** | `tdd-guide` | Enforcing the write-tests-first loop on new code |
| | `pr-test-analyzer` | Reviewing whether new tests cover meaningful behaviour vs. trivial assertions |
| **Code review (MANDATORY after any change)** | `code-reviewer` | General quality, patterns, best practices |
| | `typescript-reviewer` | TypeScript-specific: type safety, async correctness, idioms |
| **Specialised review (invoke alongside review as warranted)** | `security-reviewer` | Auth, user input, API endpoints, secrets, OWASP |
| | `silent-failure-hunter` | Error handling paths — swallowed errors, bad fallbacks |
| | `type-design-analyzer` | Discriminated unions, narrowing, invariant expression |
| | `database-reviewer` | SQL, migrations, RLS, query performance |
| | `a11y-architect` | WCAG 2.2 compliance on UI components |
| | `performance-optimizer` | Bottlenecks, bundle size, render perf |
| | `comment-analyzer` | Comment accuracy, completeness, rot risk |
| **Build repair** | `build-error-resolver` | TypeScript / build errors — minimal-diff fixes |
| **Cleanup** | `refactor-cleaner` | Dead code removal via knip / depcheck / ts-prune |
| | `code-simplifier` | Clarity + consistency without behaviour change |
| **E2E** | `e2e-runner` | Playwright test generation + flakiness triage |
| **Docs** | `doc-updater` | Codemap + README + guide updates |
| | `docs-lookup` | Current library / framework docs via Context7 |

See the full agent list at the top of every Claude Code session's system prompt (`/help` → "Agents available").

### Parallel execution — the rule

Independent reviews run **in parallel**, not sequentially. Example from WU 8.7:

```
Agent({ subagent_type: "code-reviewer", ... })
Agent({ subagent_type: "typescript-reviewer", ... })
Agent({ subagent_type: "silent-failure-hunter", ... })
```
All three in a single tool-call batch. Three complementary findings back; apply the union. Running them one after another wastes your context window and their time.

### Hard rules (from ECC, enforced)

- **80% test coverage minimum** on new code (`common/testing.md`).
- **TDD**: test first, then minimum implementation, then refactor (`common/testing.md`).
- **Files ≤ 800 lines, functions ≤ 50 lines** (`common/coding-style.md`). Split before continuing.
- **No `any` in application code** — use `unknown` + narrow (`typescript/coding-style.md`).
- **Immutable updates** — never mutate, always return new objects (`common/coding-style.md`).
- **`code-reviewer` run after every code change** is MANDATORY (`common/code-review.md`).
- **Secrets via env vars only** — never hardcoded (`security.md`).

### Skill invocation

ECC skills are invoked via `Skill(<name>)` when the task matches a skill's description. Commonly used on this project:

- `agentic-engineering` — decompose into 15-minute verifiable units
- `cost-aware-llm-pipeline` — budget tracking, model routing, prompt caching
- `database-migrations` — safe schema changes, rollback plans
- `api-design` — RESTful routes, streaming, error handling
- `ai-regression-testing` — test AI behaviour stability across changes
- `frontend-design` — Katie's deck UI work, anti-template discipline

### Post-compaction re-orient protocol

Long sessions get compacted. When context is fuzzy after compaction:

1. Re-read [`CLAUDE.md`](CLAUDE.md) §"ECC Discipline".
2. If scope is still unclear, re-fetch the repo README:
   ```bash
   gh api repos/affaan-m/everything-claude-code/readme --jq '.content' | base64 -d
   ```
3. Check the session system prompt's agent list for what's currently loaded.
4. Re-read [`system/APP/BLOOMBOT/PROGRESS.md`](../../system/APP/BLOOMBOT/PROGRESS.md) §"Resume here" for current state + next step.

### Enforcement

If a PR-sized unit of work lands without at least `code-reviewer` + `typescript-reviewer` having run on the new code, that's a process violation — call it out, don't ship it. ECC discipline supersedes conflicting guidance anywhere else in this repo.

---

## Key Information

**Project Owner:** Bailey
**Email:** admin@babybloomsydney.com.au
**Location:** Sydney, Australia

---

## Tech Stack (Target)

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React, Tailwind CSS |
| Backend | Next.js API Routes, Supabase Edge Functions |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Hosting | Vercel |
| Payments | Stripe |
| Email | Resend |
| AI | OpenAI (GPT-4o) |

---

*Last Updated: February 2026*
