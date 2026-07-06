-- active membership の唯一の定義。読み取り系はこのビューを経由することで
-- `membership_status = 'active'` の絞り忘れ（非活性メンバーの露出）を構造的に防ぐ。
CREATE OR REPLACE VIEW active_workspace_members AS
  SELECT *
  FROM workspace_members
  WHERE membership_status = 'active';
