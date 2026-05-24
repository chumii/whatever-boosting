// Thin server-side wrapper for Supabase REST API.
// Uses SUPABASE_URL + SUPABASE_ANON_KEY — never imported client-side.

const BASE = () => `${process.env.SUPABASE_URL}/rest/v1`;

function headers(extra = {}) {
  const key = process.env.SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

export async function dbSelect(table, query = "") {
  const url = `${BASE()}/${table}${query ? `?${query}` : ""}`;
  const res  = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function dbInsert(table, data) {
  const res = await fetch(`${BASE()}/${table}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function dbUpdate(table, id, data) {
  const res = await fetch(`${BASE()}/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function dbDelete(table, id) {
  const res = await fetch(`${BASE()}/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: headers({ Prefer: "return=minimal" }),
  });
  if (!res.ok) throw new Error(await res.text());
}
