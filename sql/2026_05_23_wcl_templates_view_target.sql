ALTER TABLE wcl_query_templates
  ADD COLUMN view_type    text NOT NULL DEFAULT 'casts',
  ADD COLUMN target_scope text NOT NULL DEFAULT 'all',
  ADD CONSTRAINT wcl_query_templates_view_type_check
    CHECK (view_type IN ('casts', 'amount')),
  ADD CONSTRAINT wcl_query_templates_target_scope_check
    CHECK (target_scope IN ('all', 'enemies', 'boss'));
