CREATE TABLE wcl_spell_filters (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spell_id   integer     NOT NULL,
  name       text        NOT NULL,
  boss       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
