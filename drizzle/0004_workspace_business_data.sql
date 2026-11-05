CREATE TABLE IF NOT EXISTS app.workspace_product (
  id text NOT NULL,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_product_workspace_fk FOREIGN KEY (workspace_id, organization_id)
    REFERENCES app.workspace(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT workspace_product_scope_id_unique UNIQUE (id, organization_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS workspace_product_scope_idx ON app.workspace_product(organization_id, workspace_id);

CREATE TABLE IF NOT EXISTS app.workspace_sale (
  id text NOT NULL,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  order_date text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  CONSTRAINT workspace_sale_workspace_fk FOREIGN KEY (workspace_id, organization_id)
    REFERENCES app.workspace(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT workspace_sale_scope_id_unique UNIQUE (id, organization_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS workspace_sale_scope_date_idx ON app.workspace_sale(organization_id, workspace_id, order_date);

CREATE TABLE IF NOT EXISTS app.workspace_sale_item (
  id text NOT NULL,
  organization_id text NOT NULL,
  workspace_id text NOT NULL,
  sale_id text NOT NULL,
  product_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price real NOT NULL CHECK (unit_price >= 0),
  unit_cost real NOT NULL CHECK (unit_cost >= 0),
  discount real NOT NULL DEFAULT 0 CHECK (discount >= 0),
  CONSTRAINT workspace_sale_item_sale_fk FOREIGN KEY (sale_id, organization_id, workspace_id)
    REFERENCES app.workspace_sale(id, organization_id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT workspace_sale_item_product_fk FOREIGN KEY (product_id, organization_id, workspace_id)
    REFERENCES app.workspace_product(id, organization_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT workspace_sale_item_scope_id_unique UNIQUE (id, organization_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS workspace_sale_item_product_idx ON app.workspace_sale_item(organization_id, workspace_id, product_id);

-- Dedicated business-data write permission check.
-- Requires workspace access and an organization role of owner, admin, or analyst.
-- Explicitly denies read-only viewers and users outside the workspace or organization.
CREATE OR REPLACE FUNCTION app.can_write_business_data(p_organization_id text, p_workspace_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT app.can_read_workspace(p_organization_id, p_workspace_id)
    AND EXISTS (
      SELECT 1 FROM auth.member m
      WHERE m.user_id = nullif(current_setting('app.user_id', true), '')
        AND m.organization_id = p_organization_id
        AND m.role IN ('owner', 'admin', 'analyst')
    )
$$;

-- Enable and force RLS on all business entity tables
ALTER TABLE app.workspace_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_product FORCE ROW LEVEL SECURITY;

ALTER TABLE app.workspace_sale ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_sale FORCE ROW LEVEL SECURITY;

ALTER TABLE app.workspace_sale_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_sale_item FORCE ROW LEVEL SECURITY;

-- Ensure migration idempotency: drop legacy combined policies and existing operation policies
-- before recreation to prevent duplicate-policy errors and eliminate permissive policy leaks.
DROP POLICY IF EXISTS workspace_product_tenant_isolation ON app.workspace_product;
DROP POLICY IF EXISTS workspace_product_select ON app.workspace_product;
DROP POLICY IF EXISTS workspace_product_insert ON app.workspace_product;
DROP POLICY IF EXISTS workspace_product_update ON app.workspace_product;
DROP POLICY IF EXISTS workspace_product_delete ON app.workspace_product;

DROP POLICY IF EXISTS workspace_sale_tenant_isolation ON app.workspace_sale;
DROP POLICY IF EXISTS workspace_sale_select ON app.workspace_sale;
DROP POLICY IF EXISTS workspace_sale_insert ON app.workspace_sale;
DROP POLICY IF EXISTS workspace_sale_update ON app.workspace_sale;
DROP POLICY IF EXISTS workspace_sale_delete ON app.workspace_sale;

DROP POLICY IF EXISTS workspace_sale_item_tenant_isolation ON app.workspace_sale_item;
DROP POLICY IF EXISTS workspace_sale_item_select ON app.workspace_sale_item;
DROP POLICY IF EXISTS workspace_sale_item_insert ON app.workspace_sale_item;
DROP POLICY IF EXISTS workspace_sale_item_update ON app.workspace_sale_item;
DROP POLICY IF EXISTS workspace_sale_item_delete ON app.workspace_sale_item;

-- Separate SELECT, INSERT, UPDATE, DELETE policies for app.workspace_product
CREATE POLICY workspace_product_select ON app.workspace_product
  FOR SELECT
  USING (app.can_read_workspace(organization_id, workspace_id));

CREATE POLICY workspace_product_insert ON app.workspace_product
  FOR INSERT
  WITH CHECK (app.can_write_business_data(organization_id, workspace_id));

CREATE POLICY workspace_product_update ON app.workspace_product
  FOR UPDATE
  USING (app.can_write_business_data(organization_id, workspace_id))
  WITH CHECK (app.can_write_business_data(organization_id, workspace_id));

CREATE POLICY workspace_product_delete ON app.workspace_product
  FOR DELETE
  USING (app.can_write_business_data(organization_id, workspace_id));

-- Separate SELECT, INSERT, UPDATE, DELETE policies for app.workspace_sale
CREATE POLICY workspace_sale_select ON app.workspace_sale
  FOR SELECT
  USING (app.can_read_workspace(organization_id, workspace_id));

CREATE POLICY workspace_sale_insert ON app.workspace_sale
  FOR INSERT
  WITH CHECK (app.can_write_business_data(organization_id, workspace_id));

CREATE POLICY workspace_sale_update ON app.workspace_sale
  FOR UPDATE
  USING (app.can_write_business_data(organization_id, workspace_id))
  WITH CHECK (app.can_write_business_data(organization_id, workspace_id));

CREATE POLICY workspace_sale_delete ON app.workspace_sale
  FOR DELETE
  USING (app.can_write_business_data(organization_id, workspace_id));

-- Separate SELECT, INSERT, UPDATE, DELETE policies for app.workspace_sale_item
CREATE POLICY workspace_sale_item_select ON app.workspace_sale_item
  FOR SELECT
  USING (app.can_read_workspace(organization_id, workspace_id));

CREATE POLICY workspace_sale_item_insert ON app.workspace_sale_item
  FOR INSERT
  WITH CHECK (app.can_write_business_data(organization_id, workspace_id));

CREATE POLICY workspace_sale_item_update ON app.workspace_sale_item
  FOR UPDATE
  USING (app.can_write_business_data(organization_id, workspace_id))
  WITH CHECK (app.can_write_business_data(organization_id, workspace_id));

CREATE POLICY workspace_sale_item_delete ON app.workspace_sale_item
  FOR DELETE
  USING (app.can_write_business_data(organization_id, workspace_id));

-- Table and function permissions for the application runtime role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.workspace_product, app.workspace_sale, app.workspace_sale_item TO proofloop_app;
GRANT EXECUTE ON FUNCTION app.can_write_business_data(text, text) TO proofloop_app;
