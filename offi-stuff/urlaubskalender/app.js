import { installGate } from "../src/js/gate.js";
import { PASSWORD } from "../src/js/config.js";
import * as db from "../src/js/supabase.js";

// ── State ─────────────────────────────────────────────────────────────────

const state = { members: [], vacations: [] };

// ── Date helpers ──────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, "0"); }

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(a, b) {
  return Math.round(
    (new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86_400_000
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

const DOW_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
                     "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// ── DOM helpers ───────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const el = (tag, cls = "", text = "") => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

// ── Dialog helpers ────────────────────────────────────────────────────────

function openDialog(id, title, values = {}) {
  const dlg  = document.getElementById(id);
  const form = dlg.querySelector("form");
  dlg.querySelector("[data-title]").textContent = title;
  form.reset();
  form.dataset.editingId = values.id || "";
  for (const [k, v] of Object.entries(values)) {
    const el = form.elements[k];
    if (!el || v == null) continue;
    el.value = v;
  }
  dlg.showModal();
}

function setupDialogClosers() {
  $$(".dialog [data-close]").forEach((btn) =>
    btn.addEventListener("click", () => btn.closest("dialog").close())
  );
}

// ── Load / Render ─────────────────────────────────────────────────────────

async function loadAll() {
  [state.members, state.vacations] = await Promise.all([
    db.listMembers(),
    db.listVacations(),
  ]);
}

function renderAll() {
  renderTimeline();
  renderVacationsTable();
  renderMembersTable();
}

// ── Timeline ──────────────────────────────────────────────────────────────

const DAYS     = 182;  // ~6 Monate
const COL_W    = 26;   // px per day column
const NAME_W   = 140;  // px for name column

function renderTimeline() {
  const todayStr = today();
  const t0       = addDays(todayStr, -7); // Window start: heute -7 Tage

  // Build array of ISO date strings for the window
  const days = Array.from({ length: DAYS }, (_, i) => addDays(t0, i));

  const grid = document.getElementById("timeline-grid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `${NAME_W}px repeat(${DAYS}, ${COL_W}px)`;

  let gridRow = 1;

  // ── Header row 1: Months ────────────────────────────────────────────────

  // Name spacer spanning both header rows
  const spacer = el("div", "tl-name-spacer");
  spacer.style.cssText = `grid-column:1; grid-row:1/span 2;`;
  grid.append(spacer);

  let col = 2;
  let i   = 0;
  while (i < DAYS) {
    const d         = new Date(days[i] + "T12:00:00");
    const thisMonth = d.getMonth();
    let span        = 1;
    while (i + span < DAYS) {
      const nd = new Date(days[i + span] + "T12:00:00");
      if (nd.getMonth() !== thisMonth) break;
      span++;
    }
    const monthEl = el("div", "tl-month",
      `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`);
    monthEl.style.cssText = `grid-column:${col}/span ${span}; grid-row:1;`;
    grid.append(monthEl);
    col += span;
    i   += span;
  }

  // ── Header row 2: Day numbers + weekday ────────────────────────────────

  days.forEach((iso, idx) => {
    const d      = new Date(iso + "T12:00:00");
    const dow    = d.getDay();
    const hiCls  = (dow === 3 || dow === 0) ? " day-highlight" : "";
    const todCls = iso === todayStr ? " day-today" : "";

    const cell = el("div", `tl-day-header${hiCls}${todCls}`);
    cell.style.cssText = `grid-column:${idx + 2}; grid-row:2;`;

    const num  = el("span", "tl-day-num", String(d.getDate()));
    const dow2 = el("span", "tl-dow", DOW_SHORT[dow]);
    cell.append(num, dow2);
    grid.append(cell);
  });

  gridRow = 3;

  // ── Member rows ────────────────────────────────────────────────────────

  state.members.forEach((member) => {
    const row = gridRow++;

    // Name cell
    const nameEl = el("div", "tl-member-name", member.name);
    nameEl.style.cssText = `grid-column:1; grid-row:${row};`;
    grid.append(nameEl);

    // Background cells (one per day for highlight/today coloring)
    days.forEach((iso, idx) => {
      const d      = new Date(iso + "T12:00:00");
      const dow    = d.getDay();
      const hiCls  = (dow === 3 || dow === 0) ? " day-highlight" : "";
      const todCls = iso === todayStr ? " day-today" : "";
      const bg     = el("div", `tl-bg-cell${hiCls}${todCls}`);
      bg.style.cssText = `grid-column:${idx + 2}; grid-row:${row};`;
      grid.append(bg);
    });

    // Vacation bars
    state.vacations
      .filter((v) => v.member_id === member.id)
      .forEach((vac) => {
        const startIdx = daysBetween(t0, vac.start_date);
        const endIdx   = daysBetween(t0, vac.end_date);
        const clampS   = Math.max(0, startIdx);
        const clampE   = Math.min(DAYS - 1, endIdx);
        if (clampS >= DAYS || clampE < 0) return;

        const bar = el("div", "tl-bar", vac.note || "");
        bar.style.cssText =
          `grid-column:${clampS + 2}/span ${clampE - clampS + 1}; grid-row:${row};`;
        if (vac.note) bar.title = vac.note;
        grid.append(bar);
      });
  });

  // Scroll to show "heute" at roughly 1/4 from left
  const wrap = document.querySelector(".timeline-wrap");
  if (wrap) wrap.scrollLeft = 7 * COL_W;
}

// ── Vacations table ───────────────────────────────────────────────────────

function memberName(id) {
  return state.members.find((m) => m.id === id)?.name ?? "—";
}

function renderVacationsTable() {
  const tbody = $("#vacations-table tbody");
  tbody.innerHTML = "";

  const sorted = [...state.vacations].sort(
    (a, b) => a.start_date.localeCompare(b.start_date)
  );

  sorted.forEach((vac) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${memberName(vac.member_id)}</td>
      <td>${fmtDate(vac.start_date)}</td>
      <td>${fmtDate(vac.end_date)}</td>
      <td>${vac.note ?? ""}</td>
      <td class="actions">
        <button class="action-btn" data-action="edit-vacation" data-id="${vac.id}">Bearbeiten</button>
        <button class="action-btn danger" data-action="delete-vacation" data-id="${vac.id}">Löschen</button>
      </td>`;
    tbody.append(tr);
  });
}

// ── Members table ─────────────────────────────────────────────────────────

function renderMembersTable() {
  const tbody = $("#members-table tbody");
  tbody.innerHTML = "";

  state.members.forEach((m) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.name}</td>
      <td>${m.discord_name ?? '<span class="muted">—</span>'}</td>
      <td class="actions">
        <button class="action-btn" data-action="edit-member" data-id="${m.id}">Bearbeiten</button>
        <button class="action-btn danger" data-action="delete-member" data-id="${m.id}">Löschen</button>
      </td>`;
    tbody.append(tr);
  });
}

// ── CRUD: Vacations ───────────────────────────────────────────────────────

function populateVacationDialog() {
  const sel = $("#vacation-dialog select[name=member_id]");
  sel.innerHTML = state.members
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join("");
}

function setupVacationCrud() {
  $("#new-vacation-btn").addEventListener("click", () => {
    populateVacationDialog();
    openDialog("vacation-dialog", "Urlaub hinzufügen");
  });

  $("#vacations-table").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    const vac = state.vacations.find((v) => v.id === id);

    if (action === "edit-vacation" && vac) {
      populateVacationDialog();
      openDialog("vacation-dialog", "Urlaub bearbeiten", {
        id: vac.id,
        member_id: vac.member_id,
        start_date: vac.start_date,
        end_date: vac.end_date,
        note: vac.note ?? "",
      });
    }
    if (action === "delete-vacation" && confirm("Urlaub löschen?")) {
      await db.deleteVacation(id);
      await loadAll();
      renderAll();
    }
  });

  $("#vacation-dialog form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const editingId = form.dataset.editingId;
    const row = {
      member_id:  form.elements.member_id.value,
      start_date: form.elements.start_date.value,
      end_date:   form.elements.end_date.value,
      note:       form.elements.note.value.trim() || null,
    };
    if (editingId) await db.updateVacation(editingId, row);
    else           await db.createVacation(row);
    form.closest("dialog").close();
    await loadAll();
    renderAll();
  });
}

// ── CRUD: Members ─────────────────────────────────────────────────────────

function setupMemberCrud() {
  $("#new-member-btn").addEventListener("click", () => {
    openDialog("member-dialog", "Mitglied hinzufügen");
  });

  $("#members-table").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    const member = state.members.find((m) => m.id === id);

    if (action === "edit-member" && member) {
      openDialog("member-dialog", "Mitglied bearbeiten", {
        id: member.id,
        name: member.name,
        discord_name: member.discord_name ?? "",
      });
    }
    if (action === "delete-member" && confirm(`"${member?.name}" löschen? Alle Urlaube werden ebenfalls gelöscht.`)) {
      await db.deleteMember(id);
      await loadAll();
      renderAll();
    }
  });

  $("#member-dialog form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const editingId = form.dataset.editingId;
    const row = {
      name:         form.elements.name.value.trim(),
      discord_name: form.elements.discord_name.value.trim() || null,
    };
    if (editingId) await db.updateMember(editingId, row);
    else           await db.createMember(row);
    form.closest("dialog").close();
    await loadAll();
    renderAll();
  });
}

// ── Realtime ──────────────────────────────────────────────────────────────

function setupRealtime() {
  db.createLiveChannel({
    onDbChange: async () => {
      await loadAll();
      renderAll();
    },
    onReconnect: async () => {
      await loadAll();
      renderAll();
    },
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────

async function init() {
  setupDialogClosers();
  setupVacationCrud();
  setupMemberCrud();
  await loadAll();
  renderAll();
  setupRealtime();
}

installGate({ password: PASSWORD, onUnlock: init });
