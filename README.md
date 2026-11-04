# Proofloop

**Proofloop** is an AI-powered Dashboard Intelligence Agent that turns natural-language business questions into verified SQL, interactive visualizations, and evidence-backed insights with human-in-the-loop approval workflows.

---

## 1. Core Architecture & Technologies

- **Framework:** Next.js 16.4.4 (App Router, Turbopack, Partial Prerendering)
- **UI Engine:** React 19, Tailwind CSS 4, Lucide React, Recharts
- **Database & Persistence:** Neon PostgreSQL (connection pooling via `pg`), Drizzle ORM 0.45.4
- **Local Engine & Demo Sandbox:** SQLite (`sql.js`) with read-only query execution
- **Authentication:** Better Auth 1.7.16 with Email OTP (`emailOTP`) & Organization plugins
- **Email Delivery:** Nodemailer with Gmail SMTP (fail-closed security, PII sanitization)
- **Validation & Parsing:** Zod 4, Node SQL Parser
- **Testing & Quality Assurance:** Vitest 4, ESLint 9, TypeScript 5
- **Hosting Target:** Vercel

---

## 2. Environment Variables Matrix

Proofloop enforces strict separation between application runtime and migration roles. All production secrets must be managed securely through the Vercel Dashboard or host environment.

| Variable Name | Required (Prod) | Phase | Description | Format / Example |
| :--- | :---: | :---: | :--- | :--- |
| `DATABASE_URL` | **Yes** | Runtime | Connection string for unprivileged application queries (`proofloop_app` role with RLS forced; pooled). | `postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require` |
| `MIGRATION_DATABASE_URL` | Optional | Deploy / CI | Privileged schema owner connection string used exclusively by `npm run db:migrate` and test fixtures. | `postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require` |
| `TEST_DATABASE_URL` | No | Test CI | Non-owner connection string to run live PostgreSQL RLS integration tests (`src/server/db/rls.integration.test.ts`). | `postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require` |
| `BETTER_AUTH_SECRET` | **Yes** | Runtime | High-entropy cryptographic key (minimum 32 characters) used to sign and encrypt session tokens. | Minimum 32-character random string |
| `BETTER_AUTH_URL` | **Yes** | Runtime | Canonical base URL of the deployment for cookie domains and callback verification. | `https://proofloop-amber.vercel.app` (or `http://localhost:3000` locally) |
| `SMTP_HOST` | **Yes** | Runtime | Outgoing mail server hostname. Default: `smtp.gmail.com`. | `smtp.gmail.com` |
| `SMTP_PORT` | **Yes** | Runtime | Outgoing mail server port. Default: `587`. | `587` (or `465` for SSL) |
| `SMTP_SECURE` | **Yes** | Runtime | Transport Layer Security flag. Set to `false` for port 587 (STARTTLS). | `false` or `true` |
| `SMTP_USER` | **Yes** | Runtime | Authenticated sender email address. | `proofloop.ai@gmail.com` |
| `SMTP_PASS` | **Yes** | Runtime | Outgoing mail server password (e.g., 16-character Google App Password). | 16-character Google App Password |
| `SMTP_FROM` | Optional | Runtime | Display name and sender address. | `"Proofloop" <proofloop.ai@gmail.com>` |
| `PROOFLOOP_DEMO_MODE` | No | Local | Enables unauthenticated local offline exploration without PostgreSQL. Fails closed in production. | `false` (default) or `true` |
| `MODEL_API_KEY` | Optional | Runtime | Meta Model API key for Muse Spark 1.3 LLM. When omitted, system safely falls back to Deterministic Engine. | API Key string |
| `META_MODEL_API_ENDPOINT`| Optional | Runtime | Endpoint URL for Meta Model API completions. | `https://api.meta.ai/v1/chat/completions` |
| `META_MODEL_ID` | Optional | Runtime | Model identifier for Meta Model API. | `muse-spark-1.3` |

### Security & Secret Rotation (`BETTER_AUTH_SECRET`)
- If `BETTER_AUTH_SECRET` is ever exposed, it must be treated as compromised.
- **Rotation Procedure:**
  1. Generate a new cryptographically random 32+ character string (e.g., `openssl rand -base64 32`).
  2. Update `BETTER_AUTH_SECRET` in the Vercel Environment Variables dashboard (Production and Preview environments).
  3. Redeploy the application.
  4. *Note:* Rotating the secret invalidates existing user sessions and requires active users to sign in again.

---

## 3. Local Setup & Development

### Prerequisites
- Node.js 20.x or higher
- npm 10.x or higher

### Installation & Initialization
1. Clone the repository and switch to `develop`:
   ```bash
   git clone https://github.com/OmChavan-21/Proofloop_Final.git
   cd Proofloop_Final
   git checkout develop
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local environment configuration:
   ```bash
   cp .env.example .env.local
   ```
4. Configure required keys in `.env.local`:
   - Set `BETTER_AUTH_SECRET` to a 32+ character string.
   - Set `BETTER_AUTH_URL=http://localhost:3000`.
   - Set `DATABASE_URL` to your Neon PostgreSQL connection (or leave empty and set `PROOFLOOP_DEMO_MODE=true` for offline demo mode).
   - Set your `SMTP_USER` and `SMTP_PASS` (Google App Password) for local email OTP testing.

5. Run database migrations (if using PostgreSQL):
   ```bash
   npm run db:migrate
   npm run db:verify
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 4. Authentication & Email OTP Verification

Proofloop integrates **Better Auth** with the official `emailOTP` plugin and Nodemailer:

- **6-Digit Verification Code:** Generated server-side, valid for 5 minutes (300 seconds), maximum 3 verification attempts.
- **Fail-Closed Delivery:** In production, registrations and resend requests fail closed (HTTP 502/503) if SMTP credentials are missing or if the mail server rejects delivery. A user account is never left in an unverified state without an OTP reaching the user.
- **Sanitized Logging & PII Protection:**
  - Recipient email addresses are redacted from all error logs.
  - Passwords, authorization tokens, and API keys are automatically stripped from error logs and API responses.
- **Account Enumeration Protection:**
  - Password reset requests return a uniform HTTP 200 response (`"If this email exists in our system, check your email for the reset link"`) regardless of whether the account exists or if delivery failed. Delivery errors are logged securely to server `stderr`.
- **Session & Tenant Scoping:**
  - User sessions are verified on every protected API call. Unverified users are intercepted both on the client (`VerifyEmailForm`) and on the server (`requireTenant` rejects with HTTP 403).

---

## 5. Database & Multi-Tenancy Architecture

### Dual-Role Architecture
1. **Migration Owner Role (`MIGRATION_DATABASE_URL`):** Owns schemas `auth` and `app`, executes DDL migrations, and manages PostgreSQL RLS policies.
2. **Application Runtime Role (`DATABASE_URL`):** Connects as `proofloop_app` (or unprivileged user). Has `SELECT, INSERT, UPDATE` on necessary tables, but `NO SUPERUSER`, `NO BYPASSRLS`, and `REVOKE DELETE` on audit and analysis tables.

### PostgreSQL Row-Level Security (RLS)
- Every tenant table in schema `app` (`workspace`, `workspace_membership`, `analysis`, `analysis_approval`, `approval_decision`, `audit_event`) has `FORCE ROW LEVEL SECURITY` enabled.
- Queries execute within `withTenantTransaction()`, which sets transaction-scoped session variables:
  ```sql
  SELECT set_config('app.user_id', $1, true),
         set_config('app.organization_id', $2, true),
         set_config('app.workspace_id', $3, true);
  ```
- Cross-tenant queries are blocked at both the application level (`WHERE organization_id = ... AND workspace_id = ...`) and at the PostgreSQL database engine level via RLS policies.

### Durable Approvals & Audit Trail
- Analyses and approvals are linked transactionally.
- An approval decision enforces an atomic check (`WHERE status = 'pending'`). Conflicting simultaneous decisions return HTTP 409 `APPROVAL_CONFLICT`.
- Approval decisions insert an immutable audit record into `app.audit_event`.

---

## 6. Business Intelligence & AI Engine

- **Business Overview & Product Performance:** Computes revenue, costs, gross profit, and margin changes across Q3 2026 (complete) and Q4 2026 (partial to date) using the deterministic SQLite business model (`sql.js`).
- **AI Analysis Provider Resolver:**
  - Checks connectivity to Meta Model API (Muse Spark 1.3) via an unauthenticated health check.
  - If `MODEL_API_KEY` is not provided or the endpoint fails health checks, Proofloop explicitly and transparently falls back to the **Deterministic Engine (Rule-based)**.
  - The UI clearly indicates the active provider (`Deterministic Engine (Rule-based)` vs `Meta Muse`) and never fabricates LLM activity.
- **SQL Validator:** All generated queries pass through strict read-only validation (`SELECT` only, no DDL/DML, catalog table and column whitelisting, explicit quarter date boundaries).

---

## 7. Verification & Testing Quality Gates

Run the verification suite locally or in CI:

```bash
# 1. Typecheck the entire project
npx tsc --noEmit

# 2. Run ESLint checks (0 errors, 0 warnings)
npm run lint

# 3. Run Vitest test suite (unit, route integration, concurrency)
npx vitest run

# 4. Compile optimized production build (Turbopack)
npm run build

# 5. Check git diff for whitespace errors
git diff --check
```

To run the live PostgreSQL RLS integration tests against a disposable test database:
```bash
npm run test:rls
```

---

## 8. Known Limitations & Architectural Boundaries

1. **Dashboard Proposal API:** The schema specification and validated query compiler exist (`src/server/dashboard/`), but an HTTP endpoint returning composed multi-component dashboard previews has not yet been exposed. The `/dashboards` page accurately communicates this state.
2. **Live RLS Integration Test Suite:** The live database test (`src/server/db/rls.integration.test.ts`) requires live PostgreSQL credentials (`TEST_DATABASE_URL` and `MIGRATION_DATABASE_URL`) with dual-role permissions. It is safely skipped in local environments where live database infrastructure is not configured.
3. **AI Model Provider:** Meta AI Muse Spark requires external model keys (`MODEL_API_KEY`). When unconfigured, Proofloop functions deterministically and transparently without simulated or mocked responses.
