ALTER TABLE wcl_query_templates
  ADD COLUMN dashboard_position integer;

-- Migrate existing dashboard=true templates: assign positions in created_at order
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at) - 1)::integer AS pos
  FROM wcl_query_templates
  WHERE dashboard = true
)
UPDATE wcl_query_templates t
SET dashboard_position = o.pos
FROM ordered o
WHERE t.id = o.id;
