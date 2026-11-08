# Proofloop

<p align="center">
  <strong>Ask your data. See the proof. Improve your decisions.</strong>
</p>

<p align="center">
  <a href="https://github.com/OmChavan-21/Proofloop_Final"><img src="https://img.shields.io/badge/Repository-Proofloop_Final-blue?style=flat-square&logo=github" alt="GitHub Repository" /></a>
  <img src="https://img.shields.io/badge/Next.js-16.4.4-black?style=flat-square&logo=next.js" alt="Next.js 16.4.4" />
  <img src="https://img.shields.io/badge/React-19.3.0-blue?style=flat-square&logo=react" alt="React 19.3.0" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/TailwindCSS-4.x-38B2AC?style=flat-square&logo=tailwind-css" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-0.45.4-C5F74F?style=flat-square&logo=drizzle" alt="Drizzle ORM 0.45.4" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-00E599?style=flat-square&logo=postgresql" alt="Neon PostgreSQL" />
  <img src="https://img.shields.io/badge/Better_Auth-1.7.16-indigo?style=flat-square" alt="Better Auth 1.7.16" />
  <img src="https://img.shields.io/badge/SQLite-sql.js-003B57?style=flat-square&logo=sqlite" alt="SQLite Engine" />
  <img src="https://img.shields.io/badge/Vitest-4.1.12-yellow?style=flat-square&logo=vitest" alt="Vitest 4" />
  <a href="https://github.com/OmChavan-21/Proofloop_Final/blob/develop/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License MIT" /></a>
</p>

<p align="center">
  <a href="#10-installation-and-local-setup">Quickstart</a> •
  <a href="#8-system-architecture">Architecture</a> •
  <a href="#13-api-and-backend-overview">API Reference</a> •
  <a href="#14-security-and-data-isolation">Security & RLS</a> •
  <a href="https://github.com/OmChavan-21/Proofloop_Final/issues">Report Issue</a>
</p>

---

## Table of Contents

1. [Project Introduction](#1-project-introduction)
2. [Problem Statement](#2-problem-statement)
3. [Our Solution](#3-our-solution)
4. [Key Features](#4-key-features)
5. [How Proofloop Works](#5-how-proofloop-works)
6. [Screenshots and Product Preview](#6-screenshots-and-product-preview)
7. [Technology Stack](#7-technology-stack)
8. [System Architecture](#8-system-architecture)
9. [Project Structure](#9-project-structure)
10. [Installation and Local Setup](#10-installation-and-local-setup)
11. [Environment Variables](#11-environment-variables)
12. [Available npm Scripts](#12-available-npm-scripts)
13. [API and Backend Overview](#13-api-and-backend-overview)
14. [Security and Data Isolation](#14-security-and-data-isolation)
15. [Testing and Validation](#15-testing-and-validation)
16. [Current Limitations](#16-current-limitations)
17. [Future Roadmap](#17-future-roadmap)
18. [Contributing](#18-contributing)
19. [License](#19-license)
20. [Closing Statement](#20-closing-statement)

---

## 1. Project Introduction

**Proofloop** is an AI-powered business intelligence and decision governance platform. It empowers operators, finance teams, and executives to ask complex business questions in natural language and receive analytical insights backed by auditable mathematical proof, interactive visualizations, and human-in-the-loop approval workflows.

Instead of treating analytical AI as an opaque black box that hallucinates numbers, Proofloop enforces a **closed-loop verification lifecycle**: natural language questions are translated into constrained SQL, validated through AST inspection, executed in sandboxed read-only environments, enriched with formula-backed margin deltas and evidence trails, and gated behind multi-auditor approval mechanisms before any strategic decision is accepted.

Proofloop bridges the gap between conversational accessibility and enterprise data integrity, enabling non-technical stakeholders to interrogate enterprise metrics without writing SQL or navigating sprawling spreadsheets.

---

## 2. Problem Statement

Modern organizations face severe friction in turning transactional data into trusted operational decisions:

- **The Hallucination Dilemma in Generative BI:** General-purpose Large Language Models (LLMs) frequently fabricate aggregate calculations, misapply fiscal calendar boundaries, or conflate revenue with margin when asked direct quantitative questions.
- **The SQL Bottleneck:** Business operators are dependent on specialized data engineers to construct and tune SQL queries, creating multi-day turnarounds for straightforward cohort or margin questions.
- **Unverified Recommendations:** Off-the-shelf conversational interfaces offer suggestions without surfacing the underlying raw row counts, exact calculations, or SQL queries that generated them.
- **Lack of Governance & Audit Trails:** When AI tools suggest pricing shifts, product phase-outs, or discount terminations, there is no formal record of who approved the change, what evidence was evaluated, or what state the business was in at decision time.
- **Multi-Tenant Data Bleed:** Cloud business intelligence systems often fail to enforce strict tenant boundary isolation at the database layer, relying solely on error-prone application-level `WHERE` clauses.

---

## 3. Our Solution

Proofloop eliminates these failure modes with an architecture built around **provable correctness, verifiable SQL, and governed decision execution**:

1. **Deterministic-First AI Orchestration:** Proofloop couples conversational LLMs (Meta Muse Spark 1.3) with an internal Deterministic Rule Engine. If an external model API is unavailable, unconfigured, or produces non-compliant SQL, the system safely falls back to a deterministic semantic evaluator.
2. **AST-Enforced SQL Validation:** Every query is parsed into an Abstract Syntax Tree (AST). Proofloop strictly whitelists table schemas, columns, aggregation operators, and enforces immutable quarter boundaries (`[2026-10-01, 2027-01-01)` for Q4 2026), outright rejecting DDL, DML, or destructive statements before execution.
3. **Dual Execution Engines:**
   - **Local Sandbox:** Instantaneous, zero-dependency in-memory execution via SQLite (`sql.js`) with `PRAGMA query_only = ON`.
   - **Production PostgreSQL:** Multi-tenant persistence backed by Neon PostgreSQL with database-enforced Row-Level Security (RLS) on all application tables.
4. **Evidence-Backed Insight Cards:** Every insight includes explicit row counts, raw revenue deltas, unit margin contributions, and exact SQL expressions so operators can independently verify the numbers.
5. **Human-in-the-Loop Approval & Immutable Audit:** Recommendations are staged in a pending state until reviewed by an authorized user (`owner`, `admin`, or `analyst`). Approvals or rejections are atomically persisted alongside user attribution and tamper-evident timestamps.

---

## 4. Key Features

- **Natural Language Business Querying:** Ask questions such as *"Which product had the highest margin drop between Q3 and Q4?"* or *"What is our overall revenue trajectory?"* and receive structured analytical breakdowns.
- **Executive Business Overview:** Real-time KPI summaries tracking gross revenue, cost of goods sold (COGS), gross profit, and overall profit margin with percentage deltas across quarters.
- **Quarter-over-Quarter Comparison:** Deep comparison comparing complete Q3 2026 performance against partial Q4 2026 performance to date, complete with explicit date boundary notices.
- **Product Catalog & Unit Economics:** SKU-level breakdowns detailing sales velocity, average sale prices, production costs, and margin trajectories across product categories.
- **Transparent AI Provider Status:** Real-time system status indicator reporting whether the analytical pipeline is operating via `Meta Muse Spark 1.3` or the fallback `Deterministic Engine (Rule-based)`.
- **Durable Approval Workflow:** Two-phase governance requiring human sign-off for proposed strategic actions, with optimistic locking and atomic conflict prevention (`APPROVAL_CONFLICT`).
- **Cryptographic & Immutable Audit Log:** Append-only transaction audit logging capturing every analysis request, approval, rejection, and reviewer notation.
- **Fail-Closed Email OTP Authentication:** Enterprise security powered by Better Auth, requiring 6-digit email verification with PII redaction and account enumeration resistance.
- **Strict PostgreSQL Row-Level Security:** Dual-role security model (`proofloop_migrator` vs `proofloop_app`) ensuring runtime application queries cannot bypass tenant isolation or alter schema objects.

---

## 5. How Proofloop Works

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PROOFLOOP LIFECYCLE                             │
└────────────────────────────────────────────────────────────────────────┘

  1. ASK                2. PARSE & REASON           3. VALIDATE
┌─────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│ Business User   │──>│ AI Model / Engine       │──>│ AST SQL Validator       │
│ Natural Language│   │ Analyzes intent, schema,│   │ Restricts to SELECT,    │
│ Question        │   │ and quarter boundaries  │   │ checks table whitelist  │
└─────────────────┘   └─────────────────────────┘   └───────────┬─────────────┘
                                                                │
                                                                ▼
  6. AUDIT              5. GOVERN                   4. EXECUTE & PROVE
┌─────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│ Immutable Audit │<──│ Human Approval Gateway  │<──│ Sandboxed Engine        │
│ Append-only log │   │ Reviewer validates      │   │ Extracts metrics,       │
│ with attribution│   │ findings & signs off    │   │ margins & SQL evidence  │
└─────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

1. **Question Ingestion:** The user enters a question via the interactive analysis console or selects a pre-configured analytical prompt.
2. **Intent Reasoning & Query Synthesis:** The orchestration layer dispatches the question to the configured AI provider (Meta Muse Spark) or Deterministic Rule Engine. The engine synthesizes a structured SQL query conforming to the internal business catalog.
3. **AST Safety & Date Boundary Validation:** `src/engine/sql-validator.ts` parses the generated SQL using `node-sql-parser`. It confirms the query contains zero mutations (`INSERT`, `UPDATE`, `DELETE`, `DROP`), queries only whitelisted tables, and respects the fiscal window (`2026-10-01` to `2027-01-01`).
4. **Execution & Evidence Compilation:** The query runs against the active workspace database. Aggregates are computed and converted into structured evidence points, including percentage deltas, absolute margin shifts, and chart coordinates.
5. **Human Approval Gateway:** If the analysis identifies critical operational issues (such as margin collapse on flagship SKUs), an approval record is staged in `app.analysis_approval` with a status of `pending`.
6. **Audit Trail Recording:** When an authorized reviewer approves or rejects the recommendation, Proofloop atomically updates the approval status, records reviewer notes, and commits an immutable event to `app.audit_event`.

---

## 6. Screenshots and Product Preview

### 1. Executive Business Overview (`/`)
The primary executive command center displays core enterprise metrics with quarter-over-quarter trend indicators, interactive margin comparison bar charts, and category revenue distributions.

*(Illustrative UI preview based on canonical Q3 complete vs Q4 partial seeded business data)*

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PROOFLOOP | Executive Business Overview                             [Q4 2026 Partial] │
├──────────────────┬──────────────────┬──────────────────┬───────────────────────────────┤
│ Gross Revenue    │ Cost of Goods    │ Gross Profit     │ Profit Margin                 │
│ $12,410.00       │ $8,236.00        │ $4,174.00        │ 33.63%                        │
│ (Q3: $17,340)    │ (Q3: $7,695)     │ (Q3: $9,645)     │ ▼ -21.99% pts vs Q3 (55.62%)  │
├──────────────────┴──────────────────┴──────────────────┴───────────────────────────────┤
│ Quarter-over-Quarter Category Breakdown & Margin Trajectory                            │
│ [ Interactive Recharts Visualizations: Bags, Footwear, Apparel, Electronics ]          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2. Natural Language Analysis Workspace (`/analysis`)
The conversational exploration environment allows operators to pose ad-hoc queries, inspect synthesized SQL, review raw calculation evidence, and review confidence metrics.

*(Illustrative UI preview showing analysis of canonical seeded product P001)*

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PROOFLOOP | Analysis Workspace                     Active Provider: Deterministic [●]  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [ Which products suffered the greatest margin compression in Q4 2026?            ] [Run]│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ INSIGHT SUMMARY                                                                        │
│ "Classic Backpack (P001) experienced an 18.16% margin drop from 55.0% to 36.84%       │
│ due to unit procurement costs increasing from $45 to $60 with an added $5 discount."   │
│                                                                                        │
│ VERIFIED SQL STATEMENT (Read-Only AST Passed):                                         │
│   SELECT p.name, p.category, SUM(si.quantity * (si.unit_price - si.discount)) ...    │
│   WHERE s.order_date >= '2026-10-01' AND s.order_date < '2027-01-01' ...               │
│                                                                                        │
│ EVIDENCE TRAIL                                                                         │
│ • Q3 Margin: 55.00%  (Revenue: $3,800.00, COGS: $1,710.00, 38 units sold)             │
│ • Q4 Margin: 36.84%  (Revenue: $3,895.00, COGS: $2,460.00, 41 units sold)             │
│ • Actual Data Coverage: October 8, 2026 through November 2, 2026 (Partial Quarter)     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Human Approval Gateway (`/approvals`)
Enforces institutional governance. Analysts review AI-recommended interventions, examine supporting evidence, input justification notes, and execute atomic approvals or rejections.

*(Illustrative governance interface preview for staged mitigation proposal)*

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PROOFLOOP | Pending Decisions & Governance                                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PROPOSAL #A-1082: Re-negotiate Classic Backpack (P001) Unit Procurement Costs         │
│ Status: PENDING REVIEW                                  Created: 2026-11-04 14:22 UTC  │
│ Recommended Action: Terminate $5 promotional discount and renegotiate $60 supplier    │
│ procurement cost back toward $45 baseline to recover 18.16% margin.                    │
│ Supporting Proof: Analysis #AN-9481 (Classic Backpack Q3 vs Q4 Margin Comparison)      │
│                                                                                        │
│ Reviewer Notes: [ Supplier renegotiation initiated with vendor; pending pricing sheet ] │
│                                         [ Reject Proposal ]    [ Approve & Apply ]     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4. Immutable Audit Trail (`/audit`)
Chronological record of every analytical inquiry, proposal generation, human approval, and rejection decision, complete with user identity and timestamp attribution.

---

## 7. Technology Stack

### Core Framework & Runtime
- **Next.js 16.4.4:** Modern React framework utilizing App Router, Server Components, Turbopack, and Partial Prerendering.
- **React 19.3.0 & React DOM 19.3.0:** High-concurrency UI rendering engine.
- **TypeScript 5.x:** Strict static typing across domain models, server actions, and API boundaries.
- **Tailwind CSS 4.x:** Utility-first design system with responsive layouts and dark/light color tokens.

### Database, ORM & Query Engines
- **Neon PostgreSQL:** Serverless cloud PostgreSQL with connection pooling.
- **Drizzle ORM 0.45.4:** Type-safe SQL schema mapping and query generation.
- **Node-Postgres (`pg` 8.23.1):** High-performance pooled client with transaction isolation.
- **SQLite (`sql.js` 1.15.2):** In-memory WebAssembly SQLite engine powering local offline sandboxes and deterministic business modeling.

### Authentication & Security
- **Better Auth 1.7.16:** Modular authentication system with plugins for Email OTP (`emailOTP`) and Organization Multi-Tenancy (`organization`).
- **Nodemailer 10.3.1:** Production SMTP transport with fail-closed delivery, TLS verification, and PII sanitization.
- **Node SQL Parser 5.4.0:** Abstract Syntax Tree (AST) query inspection and read-only validation.
- **Zod 4.6.7:** Strict schema parsing for incoming API payloads and environment variables.

### Analytics & Visualization
- **Recharts 3.10.1:** Declarative, responsive charting library for margin deltas, category splits, and time-series trends.
- **Lucide React 1.67.0:** Consistent iconography across dashboard workspaces.

### Testing & Development Tooling
- **Vitest 4.1.12:** Unit, mock, and integration test runner.
- **ESLint 9.x:** Code quality and formatting enforcement.

---

## 8. System Architecture

### Component Architecture
The following diagram illustrates how browser clients interact with Next.js App Router endpoints, session resolvers, analytical engines, and database layers:

```mermaid
flowchart TD
    Client["User Browser Client\n(React 19 / Tailwind CSS 4)"]

    subgraph NextServer["Next.js 16.4.4 Server (App Router / Turbopack)"]
        AuthLayer["Better Auth 1.7.16\n(Session & Email OTP Resolver)"]
        TenantResolver["Tenant & Workspace Resolver\n(requireTenant / withTenantTransaction)"]
        APIRoutes["Next.js API Route Handlers\n(/api/analysis, /api/dashboard, /api/approvals)"]

        subgraph Orchestration["AI & Intelligence Orchestrator"]
            ProviderSelector{"Active AI Provider\nConfigured?"}
            MetaModel["Meta Muse Spark 1.3\n(External Model API)"]
            Deterministic["Deterministic Engine\n(Rule-Based Fallback)"]
            SQLValidator["AST SQL Validator\n(node-sql-parser: Read-Only Check)"]
        end
    end

    subgraph StorageEngines["Analytical & Persistence Engines"]
        SQLiteEngine[("SQLite In-Memory Engine\n(sql.js: PRAGMA query_only = ON)")]
        NeonDB[("Neon PostgreSQL\n(Drizzle ORM / pg Pooler)")]
        RLSPolicies["PostgreSQL Row-Level Security\n(FORCED on all 9 app.* tables)"]
    end

    Client -->|"HTTP Requests / Cookies"| AuthLayer
    AuthLayer -->|"Authenticated Session"| TenantResolver
    TenantResolver -->|"Scoped Context"| APIRoutes
    APIRoutes -->|"Natural Language Query"| ProviderSelector
    ProviderSelector -->|"API Key Available"| MetaModel
    ProviderSelector -->|"Missing / Failed Key"| Deterministic
    MetaModel -->|"Synthesized SQL"| SQLValidator
    Deterministic -->|"Deterministic SQL"| SQLValidator

    SQLValidator -->|"Execute Local Business Query"| SQLiteEngine
    SQLValidator -->|"Persist Analysis & Approvals"| NeonDB
    NeonDB --- RLSPolicies

    SQLiteEngine -->|"Metrics & Evidence"| APIRoutes
    NeonDB -->|"Durable Records & Audit Log"| APIRoutes
    APIRoutes -->|"Verified JSON Responses"| Client
```

### Analysis & Governance Workflow
The step-by-step lifecycle from a natural language question to an auditable decision:

```mermaid
sequenceDiagram
    autonumber
    actor User as Business Operator / Analyst
    participant UI as Next.js Workspace UI
    participant Orch as Orchestration Service
    participant AI as AI / Deterministic Provider
    participant Guard as AST SQL Validator
    participant Engine as Query Engine (SQLite / Neon)
    participant DB as Persistence (app.analysis / app.audit_event)
    actor Approver as Designated Reviewer

    User->>UI: Enters business question
    UI->>Orch: POST /api/analysis { question, workspaceId }
    Orch->>AI: Reason over question + catalog schema
    AI-->>Orch: Generated SQL + hypothesis
    Orch->>Guard: Validate SQL (AST inspection)
    alt SQL contains DML / DDL or invalid catalog table
        Guard-->>Orch: Validation Error (REJECTED)
        Orch-->>UI: HTTP 400 Bad Request (Safety Rejection)
    else SQL is Safe & Read-Only
        Guard-->>Orch: Validation Passed
        Orch->>Engine: Execute query within quarter boundaries
        Engine-->>Orch: Result rows & aggregate metrics
        Orch->>Orch: Calculate margins, percentage deltas & evidence
        Orch->>DB: Persist analysis (status = 'pending')
        DB-->>Orch: Staged Analysis ID
        Orch-->>UI: Render verified insight, evidence cards & chart
    end

    opt Action Requires Governance Sign-Off
        Approver->>UI: Reviews pending proposal in /approvals
        Approver->>UI: Enters review notes & clicks "Approve"
        UI->>Orch: POST /api/approvals { analysisId, action: "approve" }
        Orch->>DB: Atomic update (status = 'approved') + Insert app.audit_event
        DB-->>Orch: Commit Confirmed
        Orch-->>UI: Decision recorded in permanent audit trail
    end
```

---

## 9. Project Structure

```
proofloop/
├── drizzle/                             # PostgreSQL database migrations & DDL
│   ├── 0001_auth_and_tenant_base.sql    # Base schemas (auth.* and app.workspace)
│   ├── 0002_workspace_rls_hardening.sql # Workspace RLS isolation hardening
│   ├── 0003_durable_analysis_approval_audit.sql # Analysis, approvals, and audit events
│   ├── 0004_workspace_business_data.sql # Product and sales tables with RLS
│   ├── 0005_demo_workspace_seed.sql     # Showcase demo workspace & read exception
│   └── roles.example.sql                # Production role creation & grants template
├── public/                              # Static public assets (SVGs, icons)
├── scripts/                             # Database administration & verification scripts
│   ├── diagnose-db.mjs                  # Database connection & pooling diagnostic
│   ├── migrate.mjs                      # Preflight-validated migration runner
│   ├── setup-app-role.mjs               # Helper to provision unprivileged runtime role
│   └── verify-db.mjs                    # Post-migration RLS and privilege assertions
├── src/
│   ├── app/                             # Next.js 16 App Router pages & API routes
│   │   ├── (auth)/                      # Authentication views
│   │   │   ├── login/page.tsx           # User sign-in interface
│   │   │   ├── signup/page.tsx          # Account registration with email OTP
│   │   │   └── verify-email/page.tsx    # 6-digit verification code input
│   │   ├── analysis/page.tsx            # Interactive natural language analysis console
│   │   ├── approvals/page.tsx           # Human-in-the-loop governance dashboard
│   │   ├── audit/page.tsx               # Immutable audit log timeline viewer
│   │   ├── dashboards/page.tsx          # Dashboard catalog & proposal preview
│   │   ├── products/                    # Product catalog & performance views
│   │   │   ├── page.tsx                 # Product catalog directory
│   │   │   └── [id]/page.tsx            # SKU-level unit economics detail
│   │   ├── api/                         # Backend REST API route handlers
│   │   │   ├── ai/status/route.ts       # AI provider availability healthcheck
│   │   │   ├── analysis/                # Query creation & analysis retrieval
│   │   │   ├── approvals/               # Pending proposals & decision submissions
│   │   │   ├── audit/route.ts           # Audit log history retrieval
│   │   │   ├── auth/[...all]/route.ts   # Better Auth request handler
│   │   │   ├── dashboard/route.ts       # Executive aggregate metrics
│   │   │   ├── products/                # Product performance queries
│   │   │   └── workspaces/              # Workspace creation & membership
│   │   ├── layout.tsx                   # Root HTML shell with providers
│   │   └── page.tsx                     # Executive Overview root dashboard
│   ├── components/                      # Modular UI components
│   │   ├── analysis/                    # Analysis query input & result panels
│   │   ├── approvals/                   # Approval action cards & audit tables
│   │   ├── auth/                        # Sign-in, sign-up, and OTP forms
│   │   ├── charts/                      # Recharts visualizations (Margin, Category)
│   │   ├── dashboard/                   # Business overview KPI grids
│   │   ├── products/                    # Product performance tables & filters
│   │   ├── shell/                       # Application navigation & tenant context
│   │   └── ui/                          # Primitive badges, cards, and banners
│   ├── engine/                          # Deterministic business analytics engine
│   │   ├── comparison.ts                # Quarter-over-quarter calculation engine
│   │   ├── database.ts                  # In-memory SQLite initialization (sql.js)
│   │   ├── evidence.ts                  # Proof compiler & formula resolver
│   │   ├── metrics.ts                   # Financial aggregations (Revenue, COGS, Margins)
│   │   ├── query-executor.ts            # Safe read-only execution harness
│   │   ├── schema.ts                    # SQLite business schema definitions
│   │   ├── seed.ts                      # Standard Q3/Q4 2026 enterprise dataset
│   │   ├── sql-validator.ts             # AST inspection & AST safety checks
│   │   └── workspace-manager.ts         # Multi-workspace SQLite instance manager
│   ├── lib/                             # Shared utility libraries
│   │   ├── auth-api.ts                  # Client-side authentication wrappers
│   │   ├── auth-client.ts               # Better Auth browser client initialization
│   │   ├── frontend-access.ts           # Role-based UI visibility helpers
│   │   └── tenant-api.ts                # Workspace & tenant network helpers
│   └── server/                          # Server-side business logic & persistence
│       ├── ai/                          # AI model providers (Meta Muse Spark & Deterministic)
│       ├── auth/                        # Server session resolution & RBAC permissions
│       ├── dashboard/                   # Dashboard query specifications & catalog
│       ├── db/                          # PostgreSQL connection pooling & Drizzle schema
│       │   ├── index.ts                 # Dual-role connection pool & tenant context
│       │   ├── persistence.ts           # Durable PostgreSQL CRUD operations
│       │   └── schema.ts                # Drizzle schema definitions (auth.* and app.*)
│       ├── email/                       # Nodemailer transport & OTP templating
│       ├── demo-mode.ts                 # Safe local demo fallback guards
│       ├── orchestration.ts             # End-to-end question analysis workflow
│       └── validation.ts                # Zod request validators
├── .env.example                         # Environment configuration template
├── CONTRACT.md                          # Engineering boundary and role contract
├── LICENSE                              # MIT License
├── next.config.ts                       # Next.js build and Turbopack configuration
├── package.json                         # Dependencies and build scripts
└── tsconfig.json                        # Strict TypeScript compiler options
```

---

## 10. Installation and Local Setup

### Prerequisites
- **Node.js:** `v20.x` or higher (verified with Node.js 24)
- **npm:** `v10.x` or higher
- **PostgreSQL Database (Optional for offline demo):** A Neon PostgreSQL database instance. If running without PostgreSQL, Proofloop includes an offline demo mode.

### Step-by-Step Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/OmChavan-21/Proofloop_Final.git
   cd Proofloop_Final
   git checkout develop
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create your local environment file from the provided template:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and configure your settings:
   - For **Offline Local Exploration (No PostgreSQL required):**
     ```env
     BETTER_AUTH_SECRET=a_random_32_character_string_for_local_testing_12345
     BETTER_AUTH_URL=http://localhost:3000
     PROOFLOOP_DEMO_MODE=true
     ```
   - For **Full Database Integration:**
     Provide your Neon PostgreSQL connection strings (`DATABASE_URL` and `MIGRATION_DATABASE_URL`) along with your Gmail SMTP credentials for email OTP verification.

4. **Run Database Migrations (If connecting to PostgreSQL):**
   ```bash
   npm run db:migrate
   npm run db:verify
   ```

5. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

---

## 11. Environment Variables

Proofloop enforces strict separation between application runtime privileges and migration owner roles. Production secrets must never be committed to source control.

| Variable Name | Required (Prod) | Phase | Description | Example / Format |
| :--- | :---: | :---: | :--- | :--- |
| `DATABASE_URL` | **Yes** | Runtime | Pooled PostgreSQL connection string for unprivileged application queries (`proofloop_app` role with RLS forced; `pg` pooler). | `postgresql://proofloop_app:pass@ep-...-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `MIGRATION_DATABASE_URL` | Optional | Deploy / CI | Unpooled connection string for the privileged schema owner (`proofloop_migrator`) used exclusively by migration scripts. | `postgresql://proofloop_migrator:pass@ep-....us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `DATABASE_URL_UNPOOLED` | Optional | Setup | Direct unpooled admin connection string used by `scripts/setup-app-role.mjs` to provision `proofloop_app`. | `postgresql://admin:pass@ep-....us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `TEST_DATABASE_URL` | No | Test CI | Non-owner connection string for live PostgreSQL RLS integration tests (`src/server/db/rls.integration.test.ts`). | `postgresql://proofloop_app:pass@ep-....us-east-2.aws.neon.tech/testdb?sslmode=require` |
| `BETTER_AUTH_SECRET` | **Yes** | Runtime | Cryptographic secret (minimum 32 characters) used to sign and encrypt session cookies and tokens. | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | **Yes** | Runtime | Canonical base URL of the deployment for cookie scoping and callback validation. | `https://your-domain.vercel.app` (or `http://localhost:3000`) |
| `PROOFLOOP_DEMO_MODE` | No | Local | When set to `true` with `NODE_ENV=development` and unset `DATABASE_URL`, enables local offline exploration using SQLite. Strictly fails closed in production. | `false` (default) or `true` |
| `MODEL_API_KEY` | Optional | Runtime | Meta Model API key for Muse Spark 1.3 LLM. When omitted or unreachable, system automatically resolves to Deterministic Engine. | `sk-meta-...` |
| `META_MODEL_API_ENDPOINT`| Optional | Runtime | HTTP endpoint URL for Meta Model completions. Default: `https://api.meta.ai/v1/chat/completions`. | `https://api.meta.ai/v1/chat/completions` |
| `META_MODEL_ID` | Optional | Runtime | Model identifier for Meta Model completions. Default: `muse-spark-1.3`. | `muse-spark-1.3` |
| `SMTP_HOST` | **Yes** | Runtime | Outgoing SMTP mail server hostname. Default: `smtp.gmail.com`. | `smtp.gmail.com` |
| `SMTP_PORT` | **Yes** | Runtime | Outgoing SMTP port (587 for STARTTLS, 465 for TLS). Default: `587`. | `587` |
| `SMTP_SECURE` | **Yes** | Runtime | Set to `false` for port 587 (opportunistic STARTTLS) or `true` for port 465. Default: `false`. | `false` |
| `SMTP_USER` | **Yes** | Runtime | Authenticated email address used to dispatch verification OTPs. | `notifications@proofloop.ai` |
| `SMTP_PASS` | **Yes** | Runtime | Outgoing mail server password or Google App Password (16 characters). | `xxxx xxxx xxxx xxxx` |
| `SMTP_FROM` | Optional | Runtime | Formatted sender name and email address. Default: `"Proofloop" <SMTP_USER>`. | `"Proofloop Intelligence" <notifications@proofloop.ai>` |

---

## 12. Available npm Scripts

All scripts defined in `package.json` are verified and runnable from the repository root. Database and test scripts utilize Node's native `--env-file=.env.local` to safely load configuration:

| Command | Action / Purpose |
| :--- | :--- |
| `npm run dev` | Starts the Next.js development server using Turbopack at `http://localhost:3000`. |
| `npm run build` | Compiles the production application, runs full TypeScript validation, and generates static pages. |
| `npm run start` | Boots the optimized Next.js production server. |
| `npm run lint` | Runs ESLint 9 across all source files, checking for code quality and syntax standards. |
| `npm run db:migrate` | Runs migration scripts in `drizzle/` with preflight connectivity and role assertions via `scripts/migrate.mjs`. |
| `npm run db:verify` | Performs deep read-only inspection asserting RLS policies, table grants, and non-owner runtime privileges via `scripts/verify-db.mjs`. |
| `npm run db:setup-role`| Executes `scripts/setup-app-role.mjs` to provision or configure the least-privilege `proofloop_app` role. |
| `npm run test:rls` | Executes the live PostgreSQL Row-Level Security integration test suite against a test database instance. |

---

## 13. API and Backend Overview

Proofloop exposes structured REST API endpoints secured with session resolution, tenant verification, and Zod input validation.

### Authentication Endpoints
- `GET, POST /api/auth/[...all]`
  Unified Better Auth route handler managing user registration, credential login, session verification, email OTP generation and validation, and organization membership.

### Intelligence & Orchestration Endpoints
- `GET /api/ai/status`
  Returns the active AI provider status (`Deterministic Engine (Rule-based)` vs `Meta Muse Spark 1.3`), endpoint connectivity, and model configuration.
- `POST /api/analysis`
  Accepts a natural language business question (`{ question: string, workspaceId: string }`), executes AST validation and query execution, and returns structured findings, SQL statements, and evidence records.
- `GET /api/analysis`
  Retrieves a paginated list of historical analyses conducted within the active tenant workspace.
- `GET /api/analysis/[id]`
  Fetches full details for a specific analysis, including synthesized SQL, raw query rows, margin deltas, and current approval state.

### Governance & Approvals Endpoints
- `GET /api/approvals/pending` (and alias `/api/approval/pending`)
  Returns all analyses currently staged in `pending` state awaiting human review in the active workspace.
- `POST /api/approvals` (and alias `/api/approval`)
  Submits an approval or rejection decision (`{ analysisId, action: "approve" | "reject", notes?: string }`). Enforces optimistic locking; simultaneous conflicting decisions return HTTP 409 `APPROVAL_CONFLICT`.
- `GET /api/approvals` (and alias `/api/approval`)
  Retrieves historical approval decisions and reviewer actions within the active workspace.
- `POST /api/analysis/[id]/approval`
  Dedicated parameterized route to submit an approval decision for a specific analysis.
- `GET /api/audit`
  Returns an immutable, chronologically ordered audit log of all decisions and operational interventions recorded in `app.audit_event`.

### Business Data & Workspace Endpoints
- `GET /api/dashboard`
  Computes aggregated executive metrics (Revenue, COGS, Profit, Margin) across Q3 and Q4 2026 for the active workspace.
- `GET /api/products`
  Lists products within the active workspace, with optional category filtering and search queries.
- `POST /api/products`
  Creates a new product record in the active workspace (`{ name: string, category: string }`).
- `GET /api/products/[id]`
  Returns SKU-level sales velocity, historical unit economics, and quarter-over-quarter margin trajectories.
- `GET /api/workspaces`
  Lists all workspaces belonging to the authenticated user's active organization.
- `POST /api/workspaces`
  Creates a new isolated workspace within the user's active organization.
- `POST /api/workspaces/[id]/members`
  Invites or adds a user to a specific workspace with an assigned role (`owner`, `admin`, `analyst`, `viewer`).

---

## 14. Security and Data Isolation

### Dual-Role Least Privilege Architecture
To prevent privilege escalation and SQL injection bypasses, Proofloop strictly segregates database operations across two PostgreSQL roles as defined in `drizzle/roles.example.sql` and `scripts/setup-app-role.mjs`:

1. **Migration Owner Role (`proofloop_migrator`):**
   - Owns schemas `auth` and `app` and all underlying tables.
   - Executes DDL migrations, creates tables, and manages RLS policies.
   - Configured with `NOBYPASSRLS`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`.
   - Used exclusively in CI/CD or controlled deployment contexts via `MIGRATION_DATABASE_URL`.
2. **Runtime Application Role (`proofloop_app`):**
   - Configured with `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`.
   - Cannot execute DDL or create schema objects (`REVOKE CREATE ON SCHEMA public, auth, app`).
   - Granted schema `USAGE` on `auth` and `app`, plus execution on security functions in `app`.
   - Granular table permissions:
     - `auth` tables: `SELECT, INSERT, UPDATE, DELETE` (managed by Better Auth).
     - `app.workspace`, `app.workspace_membership`: `SELECT, INSERT, UPDATE, DELETE` (governed by workspace RLS).
     - `app.workspace_product`, `app.workspace_sale`, `app.workspace_sale_item`: `SELECT, INSERT, UPDATE, DELETE` (governed by business data RLS).
     - `app.analysis`, `app.analysis_approval`: `SELECT, INSERT, UPDATE` (`DELETE` is permanently revoked).
     - `app.approval_decision`, `app.audit_event`: `SELECT, INSERT` (`UPDATE` and `DELETE` are permanently revoked for append-only audit trail integrity).

### PostgreSQL Row-Level Security (RLS)
All 9 application tables in schema `app` have `ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` enabled, protected by **26 active RLS policies** across migrations 0001–0005:
- `app.workspace` (2 policies: `workspace_read_isolation`, `workspace_admin_write`)
- `app.workspace_membership` (2 policies: `workspace_membership_read_isolation`, `workspace_membership_admin_write`)
- `app.analysis` (3 policies: `analysis_read`, `analysis_create`, `analysis_update`)
- `app.analysis_approval` (3 policies: `analysis_approval_read`, `analysis_approval_create`, `analysis_approval_decide`)
- `app.approval_decision` (2 policies: `approval_decision_read`, `approval_decision_create`)
- `app.audit_event` (2 policies: `audit_event_read`, `audit_event_create`)
- `app.workspace_product` (4 policies: `workspace_product_select`, `workspace_product_insert`, `workspace_product_update`, `workspace_product_delete`)
- `app.workspace_sale` (4 policies: `workspace_sale_select`, `workspace_sale_insert`, `workspace_sale_update`, `workspace_sale_delete`)
- `app.workspace_sale_item` (4 policies: `workspace_sale_item_select`, `workspace_sale_item_insert`, `workspace_sale_item_update`, `workspace_sale_item_delete`)

Every runtime query executes within a tenant transaction that sets session variables:
```sql
SELECT set_config('app.user_id', $1, true),
       set_config('app.organization_id', $2, true),
       set_config('app.workspace_id', $3, true);
```
Policies evaluate these session settings at the database engine level via security invoker helper functions (`app.can_read_workspace`, `app.can_write_analysis`, `app.can_decide_approval`, `app.can_write_business_data`). Even if an attacker manipulates application parameters, cross-organization and cross-workspace access is blocked by the database kernel.

### AST-Based SQL Guardrails
User questions are never interpolated into raw SQL strings. All queries generated by the AI provider pass through `src/engine/sql-validator.ts`:
- **Read-Only Enforcement:** Queries must be pure `SELECT` statements. Any presence of `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, or `CREATE` triggers an immediate validation error.
- **Catalog Whitelisting:** Only recognized business catalog tables (`products`, `sales`, `sale_items`) and approved metric columns can be queried.
- **Date Boundary Locking:** Queries covering Q4 2026 are strictly checked to enforce the interval `[2026-10-01, 2027-01-01)`.

### Authentication Hardening
- **Mandatory 6-Digit Email OTP:** Users cannot authenticate or query tenant data until their email address is verified via a cryptographically random 6-digit code.
- **Timing & Enumeration Resistance:** Password reset and OTP endpoints return uniform success responses regardless of whether the requested email address exists in the system.
- **PII & Credential Scrubbing:** All outgoing loggers redact email addresses, passwords, tokens, and authorization headers from stdout and stderr.

---

## 15. Testing and Validation

Proofloop maintains comprehensive automated test coverage spanning unit calculations, AST parsing, concurrency control, and database isolation.

### Running Local Automated Tests
The local test suite runs entirely offline using Vitest and requires no external network or database connections:

```bash
# Run the complete local test suite (28 passed, 1 skipped by design, 179 passing tests)
npx vitest run
```

- **Total Test Suites:** 29 test files
- **Passing Suites:** 28 passed
- **Skipped Suites:** 1 skipped (`src/server/db/rls.integration.test.ts`, which skips by design when live database credentials `TEST_DATABASE_URL` and `MIGRATION_DATABASE_URL` are unset)
- **Total Tests:** 180 tests (179 passing, 1 skipped)
- **Execution Time:** ~9.1s locally without live database overhead.

### Static Analysis & Production Build Validation
Verify code quality, strict typing, and build artifact creation:

```bash
# 1. Typecheck the entire codebase with strict TypeScript settings
npx tsc --noEmit

# 2. Run ESLint checks across all routes and components
npm run lint

# 3. Compile an optimized production build using Turbopack
npm run build

# 4. Confirm zero whitespace or merge conflict markers
git diff --check
```

### Live PostgreSQL Integration Tests
To verify PostgreSQL Row-Level Security, role constraints, and multi-tenant isolation against a live database instance:

```bash
# Requires TEST_DATABASE_URL and MIGRATION_DATABASE_URL in .env.local
npm run test:rls
```

*Note: The live RLS test suite is designed to run in CI/CD pipelines or staging environments with dedicated database instances. It safely skips execution when live database credentials are not present.*

---

## 16. Current Limitations

In adherence to Proofloop's engineering standards, we document current system boundaries transparently:

1. **Live Production Deployment & Migrations:** Migrations 0001–0005 are fully tested locally and validated via `scripts/verify-db.mjs`. However, live execution against a remote Neon PostgreSQL cluster requires providing production database credentials and executing `npm run db:migrate` and `npm run db:setup-role`.
2. **Production Authentication & Email OTP:** In production, account registration and login require active SMTP credentials (`SMTP_USER`, `SMTP_PASS`) and a reachable PostgreSQL database with the non-owner `proofloop_app` role configured; otherwise, Better Auth fails closed with HTTP 502/503.
3. **Local In-Memory Demo vs. PostgreSQL Showcase:**
   - **Local In-Memory Demo Mode:** Enabled via `PROOFLOOP_DEMO_MODE=true` only when `NODE_ENV=development` and `DATABASE_URL` is unset. Strictly fails closed in production.
   - **PostgreSQL Showcase Workspace:** Seeded in migration 0005 (`ws_demo_showcase` in `org_demo_showcase`). Authenticated users across organizations can read showcase data, but mutations are strictly blocked by RLS (`app.can_write_business_data`).
4. **AI Model Provider Resolution & Fallback:** Meta Muse Spark 1.3 requires `MODEL_API_KEY`. When unconfigured or when the status endpoint fails reachability checks, Proofloop resolves upfront to the Deterministic Engine. If Muse returns SQL that fails AST validation at runtime, orchestration catches the error and falls back to deterministic execution. The response metadata always discloses the actual active provider (`providerName` and `providerType`).
5. **Dashboard Proposal API:** While the dashboard specification and query compiler exist in `src/server/dashboard/`, the dynamic multi-widget composition HTTP route is internal. The `/dashboards` view provides an informative catalog preview.

---

## 17. Future Roadmap

- [ ] **External Data Connectors:** Native ETL integrations for Shopify, Stripe, Snowflake, BigQuery, and QuickBooks.
- [ ] **Streaming AI Responses:** Real-time token streaming for analytical explanations and multi-turn conversational exploration.
- [ ] **Custom RBAC Policy Editor:** Interface allowing enterprise administrators to define granular data-access policies down to specific product categories or geographic regions.
- [ ] **Webhook & Alert Integrations:** Automated notifications via Slack, Microsoft Teams, and email when significant margin drops are detected.
- [ ] **Automated Compliance Reports:** One-click generation of digitally signed PDF and CSV executive audit summaries.

---

## 18. Contributing

We welcome contributions from developers, data engineers, and AI researchers.

### Contribution Guidelines
1. **Fork the Repository:** Create your own branch from `develop`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Adhere to Code Standards:**
   - Maintain strict TypeScript typing (`noImplicitAny`, strict null checks).
   - Ensure all ESLint rules pass without warnings (`npm run lint`).
   - Add comprehensive tests in Vitest for new analytical logic or API endpoints.
3. **Verify Quality Gates:**
   Before opening a pull request, ensure all gates pass cleanly:
   ```bash
   npx tsc --noEmit && npm run lint && npx vitest run && npm run build
   ```
4. **Submit a Pull Request:** Target the `develop` branch of [OmChavan-21/Proofloop_Final](https://github.com/OmChavan-21/Proofloop_Final/pulls) with a clear description of changes, motivation, and test evidence.

---

## 19. License

This project is licensed under the terms of the **MIT License**.

See the full text in the [LICENSE](https://github.com/OmChavan-21/Proofloop_Final/blob/develop/LICENSE) file:

```
MIT License

Copyright (c) 2026 Om Chavan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 20. Closing Statement

Data-driven decision making should not require choosing between conversational accessibility and enterprise-grade accuracy.

**Proofloop** delivers the best of both worlds: the intuitive speed of natural-language interaction combined with the uncompromising rigor of verifiable SQL, strict tenant isolation, and auditable human governance.

**Ask your data. See the proof. Improve your decisions.**
