CREATE TABLE credit_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ledger_id uuid NOT NULL REFERENCES credit_ledger(id) ON DELETE CASCADE,
  placed_by uuid NOT NULL REFERENCES profiles(id),
  x numeric(8, 6) NOT NULL,
  y numeric(8, 6) NOT NULL,
  rotation numeric(8, 6) NOT NULL,
  shape text NOT NULL DEFAULT 'regular',
  placed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_placements_ledger_unique UNIQUE (ledger_id)
);
--> statement-breakpoint
CREATE INDEX idx_credit_placements_workspace_placed
  ON credit_placements (workspace_id, placed_at);
--> statement-breakpoint
ALTER TABLE credit_placements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE credit_placements FROM anon, authenticated;
