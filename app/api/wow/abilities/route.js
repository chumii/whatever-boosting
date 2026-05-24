// Server-side ability name lookup via WCL's gameData API.
// Module-level cache survives warm Lambda invocations.
// All abilityGameIDs in WoW combat log events are spell IDs.

import { wclQuery } from "@/lib/wcl-client";

const cache = new Map(); // id → { name, icon } | null

export const dynamic = "force-dynamic";

export async function GET(request) {
  const param = new URL(request.url).searchParams.get("ids") ?? "";
  const ids   = [...new Set(param.split(",").map(Number).filter(n => n > 0))];

  if (!ids.length) return Response.json({});

  const unknown = ids.filter(id => !cache.has(id));

  if (unknown.length) {
    // Build a single GraphQL query with one alias per ID
    const fields = unknown.map(id => `a${id}: gameData { ability(id: ${id}) { name icon } }`).join("\n");
    const query  = `query AbilityNames { ${fields} }`;

    try {
      const data = await wclQuery(query, {});
      for (const id of unknown) {
        const ab = data[`a${id}`]?.ability;
        cache.set(id, ab ? { name: ab.name, icon: ab.icon } : null);
      }
    } catch (e) {
      console.error("[wow/abilities]", e.message);
      // Cache nulls so we don't re-hammer WCL on repeated failures
      for (const id of unknown) if (!cache.has(id)) cache.set(id, null);
    }
  }

  const result = {};
  for (const id of ids) result[id] = cache.get(id) ?? null;

  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
