-- Bind workspace-membership rows to their organization so RLS can enforce
-- workspace membership without recursive policies or caller-supplied context.
ALTER TABLE app.workspace ADD CONSTRAINT workspace_id_organization_unique UNIQUE (id, organization_id);
ALTER TABLE app.workspace_membership ADD COLUMN organization_id text;
ALTER TABLE app.workspace_membership DROP CONSTRAINT workspace_membership_workspace_id_fkey;

-- The base migration forces RLS even for the migration owner. Temporarily
-- disable it only inside this migration transaction for the deterministic backfill.
ALTER TABLE app.workspace_membership NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_membership DISABLE ROW LEVEL SECURITY;
UPDATE app.workspace_membership AS wm
SET organization_id = w.organization_id
FROM app.workspace AS w
WHERE wm.workspace_id = w.id AND wm.organization_id IS NULL;
ALTER TABLE app.workspace_membership ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE app.workspace_membership
  ADD CONSTRAINT workspace_membership_workspace_org_fk
  FOREIGN KEY (workspace_id, organization_id)
  REFERENCES app.workspace (id, organization_id) ON DELETE CASCADE;
ALTER TABLE app.workspace_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_membership FORCE ROW LEVEL SECURITY;

DROP POLICY workspace_tenant_isolation ON app.workspace;
DROP POLICY workspace_membership_tenant_isolation ON app.workspace_membership;

CREATE POLICY workspace_read_isolation ON app.workspace
  FOR SELECT
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')
    AND EXISTS (
      SELECT 1 FROM auth.member AS org_member
      WHERE org_member.user_id = nullif(current_setting('app.user_id', true), '')
        AND org_member.organization_id = app.workspace.organization_id
    )
    AND (
      EXISTS (
        SELECT 1 FROM auth.member AS org_admin
        WHERE org_admin.user_id = nullif(current_setting('app.user_id', true), '')
          AND org_admin.organization_id = app.workspace.organization_id
          AND org_admin.role IN ('owner', 'admin')
      )
      OR EXISTS (
        SELECT 1 FROM app.workspace_membership AS wm
        WHERE wm.workspace_id = app.workspace.id
          AND wm.organization_id = app.workspace.organization_id
          AND wm.user_id = nullif(current_setting('app.user_id', true), '')
      )
    )
  );

CREATE POLICY workspace_admin_write ON app.workspace
  FOR ALL
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')
    AND EXISTS (
      SELECT 1 FROM auth.member AS org_admin
      WHERE org_admin.user_id = nullif(current_setting('app.user_id', true), '')
        AND org_admin.organization_id = app.workspace.organization_id
        AND org_admin.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')
    AND EXISTS (
      SELECT 1 FROM auth.member AS org_admin
      WHERE org_admin.user_id = nullif(current_setting('app.user_id', true), '')
        AND org_admin.organization_id = app.workspace.organization_id
        AND org_admin.role IN ('owner', 'admin')
    )
  );

CREATE POLICY workspace_membership_read_isolation ON app.workspace_membership
  FOR SELECT
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')
    AND (
      user_id = nullif(current_setting('app.user_id', true), '')
      OR EXISTS (
        SELECT 1 FROM auth.member AS org_admin
        WHERE org_admin.user_id = nullif(current_setting('app.user_id', true), '')
          AND org_admin.organization_id = app.workspace_membership.organization_id
          AND org_admin.role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY workspace_membership_admin_write ON app.workspace_membership
  FOR ALL
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')
    AND EXISTS (
      SELECT 1 FROM auth.member AS org_admin
      WHERE org_admin.user_id = nullif(current_setting('app.user_id', true), '')
        AND org_admin.organization_id = app.workspace_membership.organization_id
        AND org_admin.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')
    AND EXISTS (
      SELECT 1 FROM auth.member AS org_admin
      WHERE org_admin.user_id = nullif(current_setting('app.user_id', true), '')
        AND org_admin.organization_id = app.workspace_membership.organization_id
        AND org_admin.role IN ('owner', 'admin')
    )
  );
