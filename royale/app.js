import * as db    from "./src/js/supabase.js";
import { aggregateStats, computeSessionStats, formatGold, formatGoldPlain } from "./src/js/stats.js";

const $ = (sel) => document.querySelector(sel);

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function gameTypeLabel(t) {
  if (t === "simpleDice") return "Simple Dice";
  if (t === "deathRoll")  return "Death Roll";
  return t || "—";
}

function renderStats(stats) {
  $("#stat-sessions").textContent = stats.totalSessions;
  $("#stat-rounds").textContent   = stats.totalRounds;
  $("#stat-volume").textContent   = formatGoldPlain(stats.totalVolume);
  $("#stat-biggest").textContent  = formatGoldPlain(stats.biggestPayout);

  const byType = Object.entries(stats.byGameType)
    .map(([k, v]) => `${gameTypeLabel(k)}: ${v}`)
    .join(" · ");
  $("#leaderboard-heading").textContent =
    `Rangliste (${stats.leaderboard.length} Spieler)`;

  const ltbody = $("#leaderboard-table tbody");
  ltbody.innerHTML = "";
  if (stats.leaderboard.length === 0) {
    ltbody.innerHTML = '<tr><td colspan="5" class="empty">Noch keine Daten</td></tr>';
    return;
  }
  stats.leaderboard.forEach((entry, i) => {
    const won  = entry.net > 0 ? entry.net : 0;
    const lost = entry.net < 0 ? -entry.net : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="rank muted">${i + 1}</td>
      <td>${entry.id}</td>
      <td class="num ${entry.net >= 0 ? "positive" : "negative"}">${formatGold(entry.net)}</td>
      <td class="num positive">${won > 0 ? "+" + formatGoldPlain(won) : "—"}</td>
      <td class="num negative">${lost > 0 ? "−" + formatGoldPlain(lost) : "—"}</td>`;
    ltbody.append(tr);
  });
}

function renderSessions(sessions) {
  const heading = $("#sessions-heading");
  heading.textContent = `Sessions (${sessions.length})`;

  const tbody = $("#sessions-table tbody");
  tbody.innerHTML = "";
  if (sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Noch keine Sessions importiert</td></tr>';
    return;
  }
  for (const row of sessions) {
    const { totalRounds, totalPayouts } = computeSessionStats(row.raw_data || {});
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDate(row.start_time)}</td>
      <td>${gameTypeLabel(row.game_type)}</td>
      <td class="muted">${row.host_character}</td>
      <td class="num">${totalRounds}</td>
      <td class="num gold">${formatGoldPlain(totalPayouts)}</td>`;
    tbody.append(tr);
  }
}

async function load() {
  try {
    const [sessions, characters] = await Promise.all([
      db.listSessions(),
      db.listCharacters(),
    ]);
    const stats = aggregateStats(sessions, characters);
    renderStats(stats);
    renderSessions(sessions);
  } catch (err) {
    console.error("Ladefehler:", err);
  }
}

$("#refresh-btn").addEventListener("click", load);
load();
