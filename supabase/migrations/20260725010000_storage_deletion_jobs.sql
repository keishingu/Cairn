CREATE TABLE storage_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  targets jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE storage_deletion_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE storage_deletion_jobs FROM anon, authenticated;

ALTER TABLE billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE billing_customers, subscriptions, credit_ledger, stripe_events FROM anon, authenticated;
