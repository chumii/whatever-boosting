import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Members
export const listMembers = () =>
  supabase.from("members").select("*").order("name").then(unwrap);

export const createMember = (row) =>
  supabase.from("members").insert(row).select().single().then(unwrap);

export const updateMember = (id, row) =>
  supabase.from("members").update(row).eq("id", id).select().single().then(unwrap);

export const deleteMember = (id) =>
  supabase.from("members").delete().eq("id", id).then(unwrap);

// Vacations
export const listVacations = () =>
  supabase.from("vacations").select("*").order("start_date").then(unwrap);

export const createVacation = (row) =>
  supabase.from("vacations").insert(row).select().single().then(unwrap);

export const updateVacation = (id, row) =>
  supabase.from("vacations").update(row).eq("id", id).select().single().then(unwrap);

export const deleteVacation = (id) =>
  supabase.from("vacations").delete().eq("id", id).then(unwrap);

// Realtime
const SYNCED_TABLES = ["members", "vacations"];

export function createLiveChannel({ onDbChange, onReconnect } = {}) {
  const channel = supabase.channel("offi-stuff-live");
  for (const table of SYNCED_TABLES) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        try { onDbChange?.(table, payload); } catch (e) { console.error(e); }
      }
    );
  }
  let wasSubscribed = false;
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      if (wasSubscribed) onReconnect?.();
      wasSubscribed = true;
    }
  });
  return channel;
}
