CREATE TABLE app.analysis (
  analysis_id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  created_by text NOT NULL REFERENCES auth."user"(id) ON DELETE RESTRICT,
  question text NOT NULL,
  status text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_workspace_org_fk FOREIGN KEY (workspace_id, organization_id)
    REFERENCES app.workspace(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT analysis_id_org_workspace_unique UNIQUE (analysis_id, organization_id, workspace_id)
);
CREATE INDEX analysis_scope_created_idx ON app.analysis(organization_id, workspace_id, created_at);

CREATE TABLE app.analysis_approval (
  analysis_id text PRIMARY KEY,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('not_required','pending','approved','rejected','changes_requested')),
  action text CHECK (action IS NULL OR action IN ('approve','reject','request_changes')),
  reviewer_id text REFERENCES auth."user"(id) ON DELETE RESTRICT,
  notes text,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_approval_status_action_consistent CHECK (
    (status = 'pending' AND action IS NULL AND reviewer_id IS NULL AND reviewed_at IS NULL)
    OR (status = 'not_required' AND action IS NULL AND reviewer_id IS NULL AND reviewed_at IS NULL)
    OR (status = 'approved' AND action = 'approve' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (status = 'rejected' AND action = 'reject' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (status = 'changes_requested' AND action = 'request_changes' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT analysis_approval_analysis_scope_fk FOREIGN KEY (analysis_id, organization_id, workspace_id)
    REFERENCES app.analysis(analysis_id, organization_id, workspace_id) ON DELETE RESTRICT
);
CREATE INDEX analysis_approval_pending_idx ON app.analysis_approval(organization_id, workspace_id, status);

CREATE TABLE app.approval_decision (
  id text PRIMARY KEY,
  analysis_id text NOT NULL UNIQUE,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('approve','reject','request_changes')),
  previous_status text NOT NULL CHECK (previous_status = 'pending'),
  new_status text NOT NULL CHECK (new_status IN ('approved','rejected','changes_requested')),
  reviewer_id text NOT NULL REFERENCES auth."user"(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_decision_action_status_consistent CHECK (
    (action = 'approve' AND new_status = 'approved')
    OR (action = 'reject' AND new_status = 'rejected')
    OR (action = 'request_changes' AND new_status = 'changes_requested')
  ),
  CONSTRAINT approval_decision_analysis_scope_fk FOREIGN KEY (analysis_id, organization_id, workspace_id)
    REFERENCES app.analysis(analysis_id, organization_id, workspace_id) ON DELETE RESTRICT
);
CREATE INDEX approval_decision_scope_created_idx ON app.approval_decision(organization_id, workspace_id, created_at);

CREATE TABLE app.audit_event (
  id text PRIMARY KEY,
  analysis_id text NOT NULL,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  event_type text NOT NULL,
  actor_user_id text NOT NULL REFERENCES auth."user"(id) ON DELETE RESTRICT,
  event_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_event_analysis_scope_fk FOREIGN KEY (analysis_id, organization_id, workspace_id)
    REFERENCES app.analysis(analysis_id, organization_id, workspace_id) ON DELETE RESTRICT
);
CREATE INDEX audit_event_scope_created_idx ON app.audit_event(organization_id, workspace_id, created_at);

CREATE FUNCTION app.can_read_workspace(p_organization_id text, p_workspace_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT p_organization_id = nullif(current_setting('app.organization_id', true), '')
    AND p_workspace_id = nullif(current_setting('app.workspace_id', true), '')
    AND EXISTS (
      SELECT 1 FROM auth.member m
      WHERE m.user_id = nullif(current_setting('app.user_id', true), '')
        AND m.organization_id = p_organization_id
    )
    AND (
      EXISTS (
        SELECT 1 FROM auth.member m
        WHERE m.user_id = nullif(current_setting('app.user_id', true), '')
          AND m.organization_id = p_organization_id AND m.role IN ('owner','admin')
      )
      OR EXISTS (
        SELECT 1 FROM app.workspace_membership wm
        WHERE wm.user_id = nullif(current_setting('app.user_id', true), '')
          AND wm.organization_id = p_organization_id AND wm.workspace_id = p_workspace_id
      )
    )
$$;

CREATE FUNCTION app.can_write_analysis(p_organization_id text, p_workspace_id text, p_user_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT app.can_read_workspace(p_organization_id, p_workspace_id)
    AND EXISTS (
      SELECT 1 FROM auth.member m
      WHERE m.user_id = nullif(current_setting('app.user_id', true), '')
        AND m.organization_id = p_organization_id
        AND (m.role IN ('owner','admin') OR (p_user_id = m.user_id AND m.role = 'analyst'))
    )
$$;

CREATE FUNCTION app.can_decide_approval(p_organization_id text, p_workspace_id text, p_user_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT p_user_id = nullif(current_setting('app.user_id', true), '')
    AND app.can_read_workspace(p_organization_id, p_workspace_id)
    AND EXISTS (
      SELECT 1 FROM auth.member m
      WHERE m.user_id = p_user_id AND m.organization_id = p_organization_id
        AND m.role IN ('owner','admin')
    )
$$;

ALTER TABLE app.analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.analysis FORCE ROW LEVEL SECURITY;
CREATE POLICY analysis_read ON app.analysis FOR SELECT
  USING (app.can_read_workspace(organization_id, workspace_id));
CREATE POLICY analysis_create ON app.analysis FOR INSERT
  WITH CHECK (app.can_write_analysis(organization_id, workspace_id, created_by));
CREATE POLICY analysis_update ON app.analysis FOR UPDATE
  USING (app.can_write_analysis(organization_id, workspace_id, created_by))
  WITH CHECK (app.can_write_analysis(organization_id, workspace_id, created_by));

ALTER TABLE app.analysis_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.analysis_approval FORCE ROW LEVEL SECURITY;
CREATE POLICY analysis_approval_read ON app.analysis_approval FOR SELECT
  USING (app.can_read_workspace(organization_id, workspace_id));
CREATE POLICY analysis_approval_create ON app.analysis_approval FOR INSERT
  WITH CHECK (app.can_write_analysis(organization_id, workspace_id, nullif(current_setting('app.user_id', true), '')));
CREATE POLICY analysis_approval_decide ON app.analysis_approval FOR UPDATE
  USING (app.can_decide_approval(organization_id, workspace_id, nullif(current_setting('app.user_id', true), '')))
  WITH CHECK (app.can_decide_approval(organization_id, workspace_id, reviewer_id));

ALTER TABLE app.approval_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.approval_decision FORCE ROW LEVEL SECURITY;
CREATE POLICY approval_decision_read ON app.approval_decision FOR SELECT
  USING (app.can_read_workspace(organization_id, workspace_id));
CREATE POLICY approval_decision_create ON app.approval_decision FOR INSERT
  WITH CHECK (app.can_decide_approval(organization_id, workspace_id, reviewer_id));

ALTER TABLE app.audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_event_read ON app.audit_event FOR SELECT
  USING (app.can_read_workspace(organization_id, workspace_id));
CREATE POLICY audit_event_create ON app.audit_event FOR INSERT
  WITH CHECK (actor_user_id = nullif(current_setting('app.user_id', true), '')
    AND event_type = 'approval.decided'
    AND app.can_decide_approval(organization_id, workspace_id, actor_user_id));

GRANT SELECT, INSERT, UPDATE ON app.analysis, app.analysis_approval TO proofloop_app;
GRANT SELECT, INSERT ON app.approval_decision, app.audit_event TO proofloop_app;
REVOKE UPDATE, DELETE ON app.approval_decision, app.audit_event FROM proofloop_app;
REVOKE DELETE ON app.analysis, app.analysis_approval FROM proofloop_app;
GRANT EXECUTE ON FUNCTION app.can_read_workspace(text,text), app.can_write_analysis(text,text,text), app.can_decide_approval(text,text,text) TO proofloop_app;
