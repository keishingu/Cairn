DO $$
BEGIN
  CREATE TYPE profile_kind AS ENUM ('human', 'bot');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kind profile_kind NOT NULL DEFAULT 'human';
