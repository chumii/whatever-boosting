import { dbSelect, dbInsert } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await dbSelect("wcl_spell_filters", "order=created_at.asc");
    return Response.json(rows);
  } catch (e) {
    console.error("[wcl/spells GET]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { spell_id, name, boss, icon } = body;
  if (!spell_id || !Number.isInteger(spell_id) || spell_id <= 0 || !name?.trim()) {
    return Response.json({ error: "Missing: spell_id (int), name" }, { status: 400 });
  }

  try {
    const [row] = await dbInsert("wcl_spell_filters", {
      spell_id,
      name: name.trim(),
      boss: boss?.trim() || null,
      icon: icon?.trim() || null,
    });
    return Response.json(row, { status: 201 });
  } catch (e) {
    console.error("[wcl/spells POST]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}
