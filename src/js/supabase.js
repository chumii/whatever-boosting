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
