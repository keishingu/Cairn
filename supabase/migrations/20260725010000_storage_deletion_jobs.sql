CREATE TABLE storage_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  targets jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
