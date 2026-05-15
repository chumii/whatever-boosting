// stats.js — session stat computation and cross-session aggregation.

// Verbatim from WEB_IMPORT_SPEC.md §7.
// rounds can be a JS array (from LibJSON integer-keyed table) or an object — both handled.
export function computeSessionStats(session) {
  const leaderboard = {};
  let totalRounds  = 0;
  let totalPayouts = 0;

  for (const round of Object.values(session.rounds || {})) {
    if (round.status !== "completed" || !round.results) continue;
    const { winner, loser, payoutAmount } = round.results;
    leaderboard[winner] = (leaderboard[winner] ?? 0) + payoutAmount;
    leaderboard[loser]  = (leaderboard[loser]  ?? 0) - payoutAmount;
    totalRounds++;
    totalPayouts += payoutAmount;
  }

  return { totalRounds, totalPayouts, leaderboard };
}

// Build a map: characterId → canonical key (main's characterId, or own if main/unlinked).
function buildMainMap(characters) {
  const map = {};
  for (const c of characters) {
    map[c.character_id] = (c.character_type === "alt" && c.main_character)
      ? c.main_character
      : c.character_id;
  }
  return map;
}

// Aggregate stats across all sessions, rolling alt characters up to their main.
export function aggregateStats(sessions, characters) {
  const mainMap = buildMainMap(characters);

  const leaderboard = {};
  let totalSessions = 0;
  let totalRounds   = 0;
  let totalVolume   = 0;  // sum of all payouts (one-sided)
  let biggestPayout = 0;
  const byGameType  = {};

  for (const row of sessions) {
    const session = row.raw_data;
    if (!session || !session.rounds) continue;

    totalSessions++;
    byGameType[row.game_type] = (byGameType[row.game_type] ?? 0) + 1;

    const { totalRounds: r, totalPayouts: p, leaderboard: lb } = computeSessionStats(session);
    totalRounds += r;
    totalVolume += p;

    for (const [charId, net] of Object.entries(lb)) {
      const key = mainMap[charId] ?? charId;
      leaderboard[key] = (leaderboard[key] ?? 0) + net;
    }

    // Biggest single payout from any round
    for (const round of Object.values(session.rounds)) {
      if (round.results?.payoutAmount > biggestPayout) {
        biggestPayout = round.results.payoutAmount;
      }
    }
  }

  // Sort leaderboard descending by net gold
  const sorted = Object.entries(leaderboard)
    .map(([id, net]) => ({ id, net }))
    .sort((a, b) => b.net - a.net);

  return { totalSessions, totalRounds, totalVolume, biggestPayout, byGameType, leaderboard: sorted };
}

export function formatGold(amount) {
  if (amount === 0) return "0g";
  const abs  = Math.abs(amount);
  const sign = amount < 0 ? "−" : "+";
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1) + "M g";
  if (abs >= 1000)    return sign + (abs / 1000).toFixed(1) + "k g";
  return sign + abs + " g";
}

export function formatGoldPlain(amount) {
  if (amount >= 1000000) return (amount / 1000000).toFixed(1) + "M g";
  if (amount >= 1000)    return (amount / 1000).toFixed(1) + "k g";
  return amount + " g";
}
