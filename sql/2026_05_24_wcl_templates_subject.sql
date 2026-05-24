ALTER TABLE wcl_query_templates
  ADD COLUMN subject text NOT NULL DEFAULT 'source',
  ADD CONSTRAINT wcl_query_templates_subject_check
    CHECK (subject IN ('source', 'target'));
