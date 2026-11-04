CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS auth."user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false, image text,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS auth."session" (
  id text PRIMARY KEY, expires_at timestamptz NOT NULL, token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  ip_address text, user_agent text, user_id text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  active_organization_id text
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON auth."session"(user_id);
CREATE TABLE IF NOT EXISTS auth.account (
  id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  access_token text, refresh_token text, id_token text,
  access_token_expires_at timestamptz, refresh_token_expires_at timestamptz,
  scope text, password text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON auth.account(user_id);
CREATE TABLE IF NOT EXISTS auth.verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz, updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON auth.verification(identifier);
CREATE TABLE IF NOT EXISTS auth.organization (
  id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE, logo text, metadata text, created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS auth.member (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES auth.organization(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE, role text NOT NULL, created_at timestamptz NOT NULL,
  CONSTRAINT member_org_user_unique UNIQUE(organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS member_user_id_idx ON auth.member(user_id);
CREATE TABLE IF NOT EXISTS auth.invitation (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES auth.organization(id) ON DELETE CASCADE,
  email text NOT NULL, role text, status text NOT NULL, expires_at timestamptz NOT NULL,
  inviter_id text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitation_org_id_idx ON auth.invitation(organization_id);

CREATE TABLE IF NOT EXISTS app.workspace (
  id text PRIMARY KEY, organization_id text NOT NULL REFERENCES auth.organization(id) ON DELETE CASCADE,
  name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_org_id_idx ON app.workspace(organization_id);
CREATE TABLE IF NOT EXISTS app.workspace_membership (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES app.workspace(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT workspace_member_unique UNIQUE(workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_member_user_id_idx ON app.workspace_membership(user_id);

ALTER TABLE app.workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_tenant_isolation ON app.workspace
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')
    AND EXISTS (
      SELECT 1 FROM auth.member m
      WHERE m.user_id = nullif(current_setting('app.user_id', true), '')
        AND m.organization_id = app.workspace.organization_id
    )
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')
    AND EXISTS (
      SELECT 1 FROM auth.member m
      WHERE m.user_id = nullif(current_setting('app.user_id', true), '')
        AND m.organization_id = app.workspace.organization_id
        AND m.role IN ('owner', 'admin')
    )
  );
ALTER TABLE app.workspace_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_membership FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_membership_tenant_isolation ON app.workspace_membership
  USING (
    workspace_id IN (SELECT id FROM app.workspace WHERE organization_id = nullif(current_setting('app.organization_id', true), ''))
    AND (
      user_id = nullif(current_setting('app.user_id', true), '')
      OR EXISTS (
        SELECT 1 FROM auth.member m
        WHERE m.user_id = nullif(current_setting('app.user_id', true), '')
          AND m.organization_id = nullif(current_setting('app.organization_id', true), '')
          AND m.role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    workspace_id IN (SELECT id FROM app.workspace WHERE organization_id = nullif(current_setting('app.organization_id', true), ''))
    AND (
      user_id = nullif(current_setting('app.user_id', true), '')
      OR EXISTS (
        SELECT 1 FROM auth.member m
        WHERE m.user_id = nullif(current_setting('app.user_id', true), '')
          AND m.organization_id = nullif(current_setting('app.organization_id', true), '')
          AND m.role IN ('owner', 'admin')
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO proofloop_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO proofloop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO proofloop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO proofloop_app;
