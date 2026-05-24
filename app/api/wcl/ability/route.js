import { wclQuery } from "@/lib/wcl-client";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || !/^\d+$/.test(id)) {
    return Response.json({ error: "Fehlender oder ungültiger Parameter: id" }, { status: 400 });
  }

  try {
    const data = await wclQuery(
      `query AbilityLookup { gameData { ability(id: ${id}) { name icon } } }`,
      {}
    );
    const ability = data?.gameData?.ability;
    if (!ability) return Response.json({ error: "Spell nicht gefunden" }, { status: 404 });
    return Response.json({ id: parseInt(id, 10), name: ability.name, icon: ability.icon });
  } catch (e) {
    console.error("[wcl/ability]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}
