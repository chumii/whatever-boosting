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

// WoW ID week starts on Wednesday. Returns alternating 0/1 per ID week.
function idWeekParity(iso) {
  const d = new Date(iso + "T12:00:00");
  const daysSinceWed = (d.getDay() + 4) % 7; // 0 on Wed, 4 on Sun, etc.
  const wed = new Date(d);
  wed.setDate(d.getDate() - daysSinceWed);
  const REF_WED = new Date("1970-01-07T12:00:00"); // first Wed after epoch
  return Math.round((wed - REF_WED) / (7 * 86_400_000)) % 2;
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
    const field = form.elements[k];
    if (!field || v == null) continue;
    if (field.type === "checkbox") field.checked = v;
    else field.value = v;
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
  renderAbsentRaidDays();
  renderVacationsTable();
}

// ── Timeline ──────────────────────────────────────────────────────────────

let   tlDays = 90;  // dynamisch über Select
const COL_W  = 26;  // px per day column

function renderTimeline() {
  const todayStr  = today();
  const t0        = todayStr;
  const windowEnd = addDays(t0, tlDays - 1);

  const days = Array.from({ length: tlDays }, (_, i) => addDays(t0, i));

  const activeMembers = state.members.filter((m) =>
    state.vacations.some(
      (v) => v.member_id === m.id && v.start_date <= windowEnd && v.end_date >= t0
    )
  );

  const names = document.getElementById("tl-names");
  const grid  = document.getElementById("timeline-grid");

  names.innerHTML = "";
  grid.innerHTML  = "";
  grid.style.gridTemplateColumns = `repeat(${tlDays}, ${COL_W}px)`;

  // ── Names column (outside scroll) ──────────────────────────────────────

  const spacer = el("div", "tl-name-spacer-fixed");
  const rangeSelect = document.createElement("select");
  rangeSelect.className = "tl-range-select";
  rangeSelect.innerHTML = `
    <option value="30">1 Monat</option>
    <option value="60">2 Monate</option>
    <option value="90">3 Monate</option>
    <option value="180">6 Monate</option>`;
  rangeSelect.value = String(tlDays);
  rangeSelect.addEventListener("change", () => {
    tlDays = Number(rangeSelect.value);
    renderTimeline();
  });
  spacer.append(rangeSelect);
  names.append(spacer);

  activeMembers.forEach((member) => {
    const nameEl   = el("div", "tl-member-name", member.name);
    const hasRight = state.vacations.some(
      (v) => v.member_id === member.id && v.end_date > windowEnd
    );
    if (hasRight) nameEl.append(el("span", "tl-overflow-hint", "›"));
    names.append(nameEl);
  });

  // ── Header row 1: Months ───────────────────────────────────────────────

  let col = 1;
  let i   = 0;
  while (i < tlDays) {
    const d         = new Date(days[i] + "T12:00:00");
    const thisMonth = d.getMonth();
    let span        = 1;
    while (i + span < tlDays) {
      if (new Date(days[i + span] + "T12:00:00").getMonth() !== thisMonth) break;
      span++;
    }
    const monthEl = el("div", "tl-month", `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`);
    monthEl.style.cssText = `grid-column:${col}/span ${span}; grid-row:1;`;
    grid.append(monthEl);
    col += span;
    i   += span;
  }

  // ── Header row 2: Day numbers + weekday ───────────────────────────────

  days.forEach((iso, idx) => {
    const d      = new Date(iso + "T12:00:00");
    const dow    = d.getDay();
    const hiCls  = (dow === 3 || dow === 0) ? " day-highlight" + (idWeekParity(iso) ? " day-highlight-alt" : "") : "";
    const todCls = iso === todayStr ? " day-today" : "";

    const cell = el("div", `tl-day-header${hiCls}${todCls}`);
    cell.style.cssText = `grid-column:${idx + 1}; grid-row:2;`;
    cell.append(el("span", "tl-day-num", String(d.getDate())));
    cell.append(el("span", "tl-dow", DOW_SHORT[dow]));
    grid.append(cell);
  });

  let gridRow = 3;

  // ── Member rows ────────────────────────────────────────────────────────

  activeMembers.forEach((member) => {
    const row = gridRow++;

    days.forEach((iso, idx) => {
      const d      = new Date(iso + "T12:00:00");
      const dow    = d.getDay();
      const hiCls  = (dow === 3 || dow === 0) ? " day-highlight" + (idWeekParity(iso) ? " day-highlight-alt" : "") : "";
      const todCls = iso === todayStr ? " day-today" : "";
      const bg     = el("div", `tl-bg-cell${hiCls}${todCls}`);
      bg.style.cssText = `grid-column:${idx + 1}; grid-row:${row};`;
      grid.append(bg);
    });

    state.vacations
      .filter((v) => v.member_id === member.id)
      .forEach((vac) => {
        const startIdx = daysBetween(t0, vac.start_date);
        const endIdx   = daysBetween(t0, vac.end_date);
        const clampS   = Math.max(0, startIdx);
        const clampE   = Math.min(tlDays - 1, endIdx);
        if (clampS >= tlDays || clampE < 0) return;

        const bar = el("div", vac.is_preliminary ? "tl-bar tl-bar--preliminary" : "tl-bar", vac.note || "");
        bar.style.cssText = `grid-column:${clampS + 1}/span ${clampE - clampS + 1}; grid-row:${row};`;
        if (vac.note) bar.title = vac.note;
        grid.append(bar);
      });
  });

  const wrap = document.querySelector(".timeline-wrap");
  if (wrap) {
    wrap.scrollLeft = 0;
    if (!wrap._wheelBound) {
      wrap._wheelBound = true;
      wrap.addEventListener("wheel", (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          wrap.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }
  }
}

// ── Vacations table ───────────────────────────────────────────────────────

const VAC_PAGE_SIZE = 20;
let vacPage = 0;

function memberName(id) {
  return state.members.find((m) => m.id === id)?.name ?? "—";
}

function initVacPage() {
  const todayStr = today();
  const sorted = [...state.vacations].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const firstCurrentIdx = sorted.findIndex((v) => v.end_date >= todayStr);
  if (firstCurrentIdx < 0) {
    vacPage = Math.max(0, Math.ceil(sorted.length / VAC_PAGE_SIZE) - 1);
  } else {
    vacPage = Math.floor(firstCurrentIdx / VAC_PAGE_SIZE);
  }
}

function renderVacationsTable() {
  const todayStr  = today();
  const sorted    = [...state.vacations].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const totalPages = Math.max(1, Math.ceil(sorted.length / VAC_PAGE_SIZE));
  vacPage = Math.min(vacPage, totalPages - 1);

  const tbody = $("#vacations-table tbody");
  tbody.innerHTML = "";

  sorted.slice(vacPage * VAC_PAGE_SIZE, (vacPage + 1) * VAC_PAGE_SIZE).forEach((vac) => {
    const isPast = vac.end_date < todayStr;
    const tr = document.createElement("tr");
    if (isPast) tr.className = "row--past";
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

  function buildPagination(container) {
    container.innerHTML = "";
    if (totalPages <= 1) return;
    const prev = document.createElement("button");
    prev.textContent = "←";
    prev.disabled = vacPage === 0;
    prev.addEventListener("click", () => { vacPage--; renderVacationsTable(); });
    const info = el("span", "pagination-info", `${vacPage + 1} / ${totalPages}`);
    const next = document.createElement("button");
    next.textContent = "→";
    next.disabled = vacPage === totalPages - 1;
    next.addEventListener("click", () => { vacPage++; renderVacationsTable(); });
    container.append(prev, info, next);
  }
  buildPagination(document.getElementById("vacations-pagination-top"));
  buildPagination(document.getElementById("vacations-pagination-bottom"));
}

// ── Absent raid days ──────────────────────────────────────────────────────

function renderAbsentRaidDays() {
  const container = document.getElementById("absent-raid-days");
  if (!container) return;
  container.innerHTML = "";

  const todayStr = today();
  const results  = [];

  for (let i = 0; i <= 90; i++) {
    const iso = addDays(todayStr, i);
    const dow = new Date(iso + "T12:00:00").getDay();
    if (dow !== 3 && dow !== 0) continue;

    const absent = state.members.filter((m) =>
      state.vacations.some(
        (v) => v.member_id === m.id && v.start_date <= iso && v.end_date >= iso
      )
    );
    if (absent.length > 0) results.push({ iso, dow, absent });
  }

  if (results.length === 0) {
    container.append(el("p", "muted small", "Niemand AFK an Raidtagen in den nächsten 90 Tagen."));
    return;
  }

  results.forEach(({ iso, dow, absent }) => {
    const [, m, d] = iso.split("-");
    const dateStr  = `${DOW_SHORT[dow]} ${parseInt(d)}.${parseInt(m)}.`;

    const card  = el("div", "raid-absent-card");
    const date  = el("span", "raid-absent-date", dateStr);
    const count = el("span", "raid-absent-count", String(absent.length));
    const names = el("span", "raid-absent-names", absent.map((a) => a.name).join(", "));
    card.append(date, count, names);
    container.append(card);
  });
}

// ── CRUD: Vacations ───────────────────────────────────────────────────────

function populateVacationDialog() {
  const sel = $("#vacation-dialog select[name=member_id]");
  sel.innerHTML = state.members
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join("");
  const dlg = document.getElementById("vacation-dialog");
  dlg.querySelector("[name=end_date]").disabled      = false;
  dlg.querySelector("[name=one_day]").checked        = false;
  dlg.querySelector("[name=is_preliminary]").checked = false;
}

function setupOneDayCheckbox() {
  const dlg       = document.getElementById("vacation-dialog");
  const checkbox  = dlg.querySelector("[name=one_day]");
  const startInput = dlg.querySelector("[name=start_date]");
  const endInput  = dlg.querySelector("[name=end_date]");

  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      endInput.value    = startInput.value;
      endInput.disabled = true;
    } else {
      endInput.disabled = false;
    }
  });

  startInput.addEventListener("change", () => {
    if (checkbox.checked) endInput.value = startInput.value;
  });
}

function setupVacationCrud() {
  setupOneDayCheckbox();

  $("#new-vacation-btn").addEventListener("click", () => {
    populateVacationDialog();
    openDialog("vacation-dialog", "AFK hinzufügen");
  });

  $("#vacations-table").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    const vac = state.vacations.find((v) => v.id === id);

    if (action === "edit-vacation" && vac) {
      populateVacationDialog();
      openDialog("vacation-dialog", "AFK bearbeiten", {
        id: vac.id,
        member_id:      vac.member_id,
        start_date:     vac.start_date,
        end_date:       vac.end_date,
        note:           vac.note ?? "",
        is_preliminary: vac.is_preliminary ?? false,
      });
    }
    if (action === "delete-vacation" && confirm("AFK-Eintrag löschen?")) {
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
      member_id:      form.elements.member_id.value,
      start_date:     form.elements.start_date.value,
      end_date:       form.elements.end_date.value,
      note:           form.elements.note.value.trim() || null,
      is_preliminary: form.elements.is_preliminary.checked,
    };
    if (editingId) await db.updateVacation(editingId, row);
    else           await db.createVacation(row);
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
  await loadAll();
  initVacPage();
  renderAll();
  setupRealtime();
}

installGate({ password: PASSWORD, onUnlock: init });
