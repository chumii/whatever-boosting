import { dbUpdate, dbDelete } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

const ALLOWED_VIEW_TYPES    = ["casts", "amount"];
const ALLOWED_TARGET_SCOPES = ["all", "enemies", "boss"];
const ALLOWED_SUBJECTS      = ["source", "target"];

export async function PATCH(request, { params }) {
  const { id } = await params;
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const update = {};
  if (body.name?.trim())                    update.name              = body.name.trim();
  if (body.data_type)                       update.data_type         = body.data_type;
  if (typeof body.filter_expression === "string") update.filter_expression = body.filter_expression.trim();
  if (typeof body.dashboard === "boolean")  update.dashboard         = body.dashboard;
  if ("dashboard_position" in body) {
    const dp = body.dashboard_position;
    if (dp !== null && (!Number.isInteger(dp) || dp < 0))
      return Response.json({ error: "Invalid dashboard_position" }, { status: 400 });
    update.dashboard_position = dp;
  }

  if (body.view_type != null) {
    if (!ALLOWED_VIEW_TYPES.includes(body.view_type))
      return Response.json({ error: "Invalid view_type" }, { status: 400 });
    update.view_type = body.view_type;
  }
  if (body.target_scope != null) {
    if (!ALLOWED_TARGET_SCOPES.includes(body.target_scope))
      return Response.json({ error: "Invalid target_scope" }, { status: 400 });
    update.target_scope = body.target_scope;
  }
  if (body.subject != null) {
    if (!ALLOWED_SUBJECTS.includes(body.subject))
      return Response.json({ error: "Invalid subject" }, { status: 400 });
    update.subject = body.subject;
  }

  if (!Object.keys(update).length) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const [row] = await dbUpdate("wcl_query_templates", id, update);
    return Response.json(row);
  } catch (e) {
    console.error("[wcl/templates PATCH]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await dbDelete("wcl_query_templates", id);
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error("[wcl/templates DELETE]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}
