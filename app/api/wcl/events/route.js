import { wclQuery } from "@/lib/wcl-client";
import { EVENTS_PAGE } from "@/lib/wcl-queries";

export const dynamic = "force-dynamic";

async function fetchAllEvents(code, fight, dataType, filterExpression, targetClass) {
  const events = [];
  let startTime = fight.startTime;

  do {
    const data = await wclQuery(EVENTS_PAGE, {
      code,
      startTime,
      endTime:  fight.endTime,
      dataType,
      ...(filterExpression ? { filterExpression } : {}),
      ...(targetClass      ? { targetClass }      : {}),
    });
    const page = data.reportData.report.events;
    events.push(...page.data);
    startTime = page.nextPageTimestamp ?? null;
  } while (startTime);

  return events;
}

async function fetchAbilityNames(ids) {
  if (!ids.length) return {};
  const fields = ids
    .map(id => `a${id}: gameData { ability(id: ${id}) { name icon } }`)
    .join("\n");
  const data = await wclQuery(`query AbilityNames { ${fields} }`, {});
  const names = {};
  for (const id of ids) {
    const ab = data[`a${id}`]?.ability;
    if (ab) names[id] = { name: ab.name, icon: ab.icon };
  }
  return names;
}

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { code, fights, dataType, filterExpression = null, targetClass = null } = body;

  if (!code || !Array.isArray(fights) || !fights.length || !dataType) {
    return Response.json(
      { error: "Missing: code, fights, dataType" },
      { status: 400 }
    );
  }

  try {
    const results = [];
    for (const fight of fights) {
      const events = await fetchAllEvents(code, fight, dataType, filterExpression, targetClass);
      results.push({ id: fight.id, startTime: fight.startTime, endTime: fight.endTime, events });
    }

    const uniqueIds = [...new Set(
      results.flatMap(r => r.events.flatMap(ev => [
        ev.abilityGameID,
        ev.killingAbilityGameID,
      ]).filter(id => id > 0))
    )];
    const abilityNames = await fetchAbilityNames(uniqueIds);

    return Response.json({ results, abilityNames });
  } catch (e) {
    console.error("[wcl/events]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}
