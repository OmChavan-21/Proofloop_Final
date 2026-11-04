\# PROOFLOOP V2 Ã¢â‚¬â€ ENGINEERING CONTRACT



Version: 1.0

Status: Initial specification

Project: Proofloop V2



\## 1. Product Mission



Proofloop is an AI-powered dashboard intelligence agent that converts natural-language business questions into verified SQL queries, interactive visualizations, and evidence-backed explanations.



Core workflow:



MONITOR Ã¢â€ â€™ UNDERSTAND Ã¢â€ â€™ INSPECT Ã¢â€ â€™ QUERY Ã¢â€ â€™ VALIDATE Ã¢â€ â€™ EXECUTE Ã¢â€ â€™ VERIFY Ã¢â€ â€™ VISUALIZE Ã¢â€ â€™ EXPLAIN Ã¢â€ â€™ APPROVE



Primary demonstration question:



"Which products are affecting our current quarter's profit margin, and why?"



\## 2. Architecture



\- Framework: Next.js App Router

\- Language: TypeScript

\- UI: Tailwind CSS, shadcn/ui

\- Charts: Recharts

\- Database: SQLite-compatible storage

\- Testing: Vitest

\- AI: Provider abstraction, with Meta models as the intended integration target.



All database access and AI API calls must happen server-side.



No API keys or credentials may be exposed to the browser.



\## 3. Workspace Ownership



CODEX Ã¢â‚¬â€ ENGINE



Owns:

\- Database schema and seed data

\- Schema inspection

\- SQL generation interfaces

\- SQL parsing and validation

\- Read-only query execution

\- Query limits and safety

\- Evidence structures

\- Engine tests



ANTIGRAVITY Ã¢â‚¬â€ AI WORKFLOW



Owns:

\- AI provider abstraction

\- Model integration

\- Natural-language question processing

\- Ask Ã¢â€ â€™ Validate Ã¢â€ â€™ Execute Ã¢â€ â€™ Explain orchestration

\- Approval workflow endpoints

\- Audit history

\- Server-side configuration



CURSOR Ã¢â‚¬â€ USER INTERFACE



Owns:

\- Dashboard layout

\- Navigation and sidebar

\- Business Overview

\- Product Performance

\- AI Analysis workspace

\- Charts and KPI components

\- SQL and evidence viewer

\- Approval interface

\- Responsive styling



Shared files must follow this contract. No agent may independently overwrite another workspace.



\## 4. Core Data Model



Initial business entities:



\- products

\- orders

\- order\_items

\- product\_costs

\- channels



The database must contain realistic seeded demonstration data, including products whose gross margins decline during the current quarter.



All demonstration data must be clearly labelled as demo data.



\## 5. SQL Safety Requirements



Only read-only SQL is permitted.



Reject:

\- INSERT

\- UPDATE

\- DELETE

\- DROP

\- ALTER

\- CREATE

\- TRUNCATE

\- Multiple SQL statements

\- Unauthorized tables or columns

\- Unsafe or unsupported SQL constructs



Additional requirements:

\- Validate parsed SQL before execution.

\- Apply query timeouts.

\- Apply row limits.

\- Restrict database access.

\- Never execute unvalidated model-generated SQL.

\- Never expose database credentials to the client.



\## 6. Standard API Workflow



POST /api/analysis



Request:



{

&#x20; "question": "Which products are affecting our current quarter's profit margin, and why?"

}



Response:



{

&#x20; "analysisId": "analysis-id",

&#x20; "status": "completed",

&#x20; "question": "Business question",

&#x20; "sql": "SELECT ...",

&#x20; "validation": {

&#x20;   "status": "passed",

&#x20;   "errors": \[]

&#x20; },

&#x20; "execution": {

&#x20;   "status": "completed",

&#x20;   "rowCount": 0

&#x20; },

&#x20; "results": \[],

&#x20; "evidence": \[],

&#x20; "explanation": {

&#x20;   "summary": "Evidence-backed explanation",

&#x20;   "findings": \[]

&#x20; },

&#x20; "approval": {

&#x20;   "status": "not\_required"

&#x20; }

}



This is the target response contract. Implementations must validate it and must not fabricate successful results.



\## 7. Analysis Statuses



Allowed workflow statuses:



\- pending

\- understanding

\- inspecting

\- generating\_sql

\- validating

\- executing

\- explaining

\- completed

\- failed



Failed stages must return meaningful errors.



\## 8. Evidence Requirements



Every numerical claim in an explanation must be traceable to query results.



Evidence should include:

\- Source table

\- Relevant columns

\- Query reference

\- Result reference

\- Calculation or comparison used



Unsupported claims must be identified as unverified.



\## 9. Human Approval



Proofloop may recommend improvements.



It must not automatically change business data, production schemas, or production configurations.



Approval actions:



\- Approve

\- Reject

\- Request changes



Every decision must be recorded in an audit history.



\## 10. UI Requirements



Main application sections:



1\. Business Overview

2\. AI Analysis

3\. Product Performance



The AI Analysis workspace is the primary demonstration experience.



Use consistent typography, spacing, components, and navigation.



All displayed figures must originate from the database or be explicitly labelled as illustrative.



\## 11. Testing Requirements



\- Unit tests for SQL validation.

\- Unit tests for query execution restrictions.

\- Tests for evidence generation.

\- API contract tests.

\- AI provider mock tests.

\- End-to-end analysis workflow tests.



Mock responses must never be presented as real AI provider responses.



\## 12. Security Requirements



\- Keep .env out of Git.

\- Keep API keys server-side.

\- Validate incoming requests.

\- Restrict SQL execution.

\- Do not expose internal errors or secrets.

\- Use seeded demonstration data only.

\- Do not connect to real customer databases in this MVP.



\## 13. Definition of Done



The MVP is complete when:



1\. The application starts successfully.

2\. A user can ask the primary business question.

3\. The application inspects the database schema.

4\. SQL is generated and independently validated.

5\. Safe read-only SQL executes successfully.

6\. Results generate interactive visualizations.

7\. Explanations reference actual query evidence.

8\. Approval actions work and are audited.

9\. Automated tests pass.

10\. The complete demonstration works without fabricated provider or database success.



\## 14. Development Rule



Build one integrated product.



Do not create disconnected demos.



Do not silently substitute mocks for real integrations.



Do not claim a feature is complete until it has been implemented and tested.



When a feature cannot be completed, report its actual status and limitation.
