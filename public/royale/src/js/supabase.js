import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export const listSessions = () =>
  supabase.from("wr_sessions").select("*").order("start_time", { ascending: false }).then(unwrap);

export const listCharacters = () =>
  supabase.from("wr_characters").select("*").then(unwrap);

export async function upsertSession(row) {
  // First import wins (sessions are immutable after completion).
  const { error } = await supabase.from("wr_sessions")
    .upsert(row, { onConflict: "session_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function upsertCharacter(row) {
  // Newest exportedAt wins — only update if our data is more recent.
  const existing = await supabase.from("wr_characters")
    .select("last_export_at")
    .eq("character_id", row.character_id)
    .maybeSingle()
    .then(unwrap);

  if (!existing) {
    const { error } = await supabase.from("wr_characters").insert(row);
    if (error) throw error;
    return;
  }

  const existingTs = existing.last_export_at ? new Date(existing.last_export_at).getTime() : 0;
  const incomingTs = row.last_export_at ? new Date(row.last_export_at).getTime() : 0;
  if (incomingTs <= existingTs) return;

  const { error } = await supabase.from("wr_characters")
    .update(row)
    .eq("character_id", row.character_id);
  if (error) throw error;
}
