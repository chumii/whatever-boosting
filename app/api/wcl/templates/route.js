import { dbSelect, dbInsert } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

const ALLOWED_VIEW_TYPES    = ["casts", "amount"];
const ALLOWED_TARGET_SCOPES = ["all", "enemies", "boss"];
const ALLOWED_SUBJECTS      = ["source", "target"];

export async function GET() {
  try {
    const rows = await dbSelect("wcl_query_templates", "order=created_at.asc");
    return Response.json(rows);
  } catch (e) {
    console.error("[wcl/templates GET]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { name, data_type, filter_expression, dashboard, view_type, target_scope, subject } = body;
  if (!name?.trim() || !data_type) {
    return Response.json({ error: "Missing: name, data_type" }, { status: 400 });
  }

  const vt = view_type    ?? "casts";
  const ts = target_scope ?? "all";
  const sb = subject      ?? "source";
  if (!ALLOWED_VIEW_TYPES.includes(vt))    return Response.json({ error: "Invalid view_type" },    { status: 400 });
  if (!ALLOWED_TARGET_SCOPES.includes(ts)) return Response.json({ error: "Invalid target_scope" }, { status: 400 });
  if (!ALLOWED_SUBJECTS.includes(sb))      return Response.json({ error: "Invalid subject" },       { status: 400 });

  try {
    const [row] = await dbInsert("wcl_query_templates", {
      name:              name.trim(),
      data_type,
      filter_expression: filter_expression?.trim() ?? "",
      dashboard:         dashboard === true,
      view_type:         vt,
      target_scope:      ts,
      subject:           sb,
    });
    return Response.json(row, { status: 201 });
  } catch (e) {
    console.error("[wcl/templates POST]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}
