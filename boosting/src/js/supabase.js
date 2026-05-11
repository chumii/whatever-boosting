import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Players
export const listPlayers = () =>
  supabase.from("players").select("*").order("name").then(unwrap);

export const createPlayer = (row) =>
  supabase.from("players").insert(row).select().single().then(unwrap);

export const updatePlayer = (id, row) =>
  supabase.from("players").update(row).eq("id", id).select().single().then(unwrap);

export const deletePlayer = (id) =>
  supabase.from("players").delete().eq("id", id).then(unwrap);

// Characters
export const listCharacters = () =>
  supabase
    .from("characters")
    .select("*")
    .order("name")
    .then(unwrap);

export const createCharacter = (row) =>
  supabase.from("characters").insert(row).select().single().then(unwrap);

export const updateCharacter = (id, row) =>
  supabase.from("characters").update(row).eq("id", id).select().single().then(unwrap);

export const deleteCharacter = (id) =>
  supabase.from("characters").delete().eq("id", id).then(unwrap);

// Classes
export const listClasses = () =>
  supabase.from("wow_classes").select("*").order("name").then(unwrap);

// Seasons
export const listSeasons = () =>
  supabase.from("seasons").select("*").order("name").then(unwrap);

export const createSeason = (row) =>
  supabase.from("seasons").insert(row).select().single().then(unwrap);

export const updateSeason = (id, row) =>
  supabase.from("seasons").update(row).eq("id", id).select().single().then(unwrap);

export const deleteSeason = (id) =>
  supabase.from("seasons").delete().eq("id", id).then(unwrap);

// Dungeons
export const listDungeons = () =>
  supabase.from("dungeons").select("*").order("name").then(unwrap);

export const createDungeon = (row) =>
  supabase.from("dungeons").insert(row).select().single().then(unwrap);

export const updateDungeon = (id, row) =>
  supabase.from("dungeons").update(row).eq("id", id).select().single().then(unwrap);

export const deleteDungeon = (id) =>
  supabase.from("dungeons").delete().eq("id", id).then(unwrap);

// App state (shared generator UI)
const APP_STATE_ID = "generator";

export const getAppState = () =>
  supabase
    .from("app_state")
    .select("*")
    .eq("id", APP_STATE_ID)
    .maybeSingle()
    .then(unwrap);

export const updateAppState = (patch) =>
  supabase
    .from("app_state")
    .update(patch)
    .eq("id", APP_STATE_ID)
    .select()
    .single()
    .then(unwrap);

// Realtime
const SYNCED_TABLES = ["players", "characters", "seasons", "dungeons"];

export function createLiveChannel({ onDbChange, onAppStateChange, onReconnect } = {}) {
  const channel = supabase.channel("whatever-boosting-live");
  for (const table of SYNCED_TABLES) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        try { onDbChange?.(table, payload); } catch (e) { console.error(e); }
      }
    );
  }
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "app_state" },
    (payload) => {
      try { onAppStateChange?.(payload); } catch (e) { console.error(e); }
    }
  );
  let wasSubscribed = false;
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      if (wasSubscribed) onReconnect?.();
      wasSubscribed = true;
    }
  });
  return channel;
}
