import { dbUpdate, dbDelete } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const { id } = await params;
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const update = {};
  if (Number.isInteger(body.spell_id) && body.spell_id > 0) update.spell_id = body.spell_id;
  if (body.name?.trim())             update.name = body.name.trim();
  if (typeof body.boss === "string") update.boss = body.boss.trim() || null;
  if (typeof body.icon === "string") update.icon = body.icon.trim() || null;

  if (!Object.keys(update).length) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const [row] = await dbUpdate("wcl_spell_filters", id, update);
    return Response.json(row);
  } catch (e) {
    console.error("[wcl/spells PATCH]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await dbDelete("wcl_spell_filters", id);
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error("[wcl/spells DELETE]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}
