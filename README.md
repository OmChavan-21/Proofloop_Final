# Proofloop_Final
AI-powered dashboard intelligence agent that turns natural-language business questions into verified SQL, interactive visualizations, and evidence-backed insights.

## Authentication and tenant foundation

Better Auth and PostgreSQL-backed organization/workspace access are enabled when the following server-only environment variables are configured:

- `DATABASE_URL`: PostgreSQL connection for the application runtime. Use the `proofloop_app` role (or equivalent) with no superuser, table ownership, or `BYPASSRLS` privileges.
- `MIGRATION_DATABASE_URL`: separate privileged connection that owns the `auth` and `app` schemas and applies tracked SQL migrations.
- `BETTER_AUTH_SECRET`: high-entropy secret with at least 32 characters.
- `BETTER_AUTH_URL`: canonical application origin, such as `https://proofloop.example.com`.

Provision distinct database roles using [roles.example.sql](drizzle/roles.example.sql), set their credentials outside source control, then run `npm run db:migrate`. This applies the ordered SQL migrations in `drizzle/`. `MIGRATION_DATABASE_URL` is used only by that command and test fixtures; normal app queries use `DATABASE_URL`.

When PostgreSQL is configured, analysis records, current approval state, approval decisions and audit events are stored transactionally in PostgreSQL. Analysis creation also creates its initial approval row in one transaction. An approval transition updates the approval row and analysis response and inserts its decision and audit event in one transaction. RLS and the server session scope all persistent reads and writes. The existing sql.js seeded analytics database remains independent. When PostgreSQL is absent in local development, analysis and approval APIs continue in openly unauthenticated seeded-demo mode; production never uses this fallback and fails closed if authentication is not configured.

Organizations and organization memberships are managed through Better Auth's organization API. Workspaces are created through `POST /api/workspaces`; membership additions use `POST /api/workspaces/{id}/members`. Protected API handlers resolve user and organization from the Better Auth session, resolve membership roles from the server database, and verify any requested workspace against both organization and membership records. A workspace selector UI is not included in this foundation.

PostgreSQL RLS is enabled and forced for workspace, analysis, approval and audit tables. Tenant context is transaction-local and must be set only from a verified server session. For real RLS tests, apply migrations to a disposable database and set `TEST_DATABASE_URL` to the non-owner runtime role, `MIGRATION_DATABASE_URL` to the migration owner, and `DATABASE_URL` to the same runtime test connection. The integration test uses random fixture IDs and removes only those fixtures; it is skipped when the two test URLs are absent. It temporarily disables RLS on its fixture tables only inside cleanup transactions on the disposable test database. Never point these variables at production data. Email verification and password-reset delivery still require a configured mail provider. This is a foundation, not a production security certification.
