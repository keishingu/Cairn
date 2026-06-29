-- workspace memberの在籍状態（active / inactive）
CREATE TYPE workspace_member_status AS ENUM ('active', 'inactive');

ALTER TABLE workspace_members
  ADD COLUMN membership_status workspace_member_status NOT NULL DEFAULT 'active',
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_by uuid REFERENCES profiles(id);
