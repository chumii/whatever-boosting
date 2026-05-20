import * as db from "./supabase.js";

const state = {
  players: [],
  characters: [],
  classes: [],
  seasons: [],
  dungeons: [],
};

let liveChannel = null;

const charSort = { field: "player", dir: "asc" };
const CHAR_NUMERIC_FIELDS = new Set(["current_key_level", "rating", "item_level"]);
const dungeonSort = { field: "name", dir: "asc" };

const clientId = crypto.randomUUID();
let lastAppliedGeneratedAt = null;
let pushAppStateTimer = null;
let pendingAppStatePatch = {};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
const ICON_PENCIL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

const byId = (rows, id) => rows.find((r) => r.id === id);
const charsForPlayer = (playerId) =>
  state.characters.filter((c) => c.player_id === playerId);
const classByName = (name) => state.classes.find((c) => c.name === name);

// ---------- View / tab routing ----------
function setupNav() {
  $$(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      $$(".nav-link").forEach((l) => l.classList.toggle("active", l === link));
      $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== `view-${view}`));
    });
  });

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      $$(".tab-panel").forEach((p) =>
        p.classList.toggle("hidden", p.id !== `tab-${target}`)
      );
    });
  });
}

// ---------- Data loading ----------
async function loadAll() {
  const [players, characters, classes, seasons, dungeons] = await Promise.all([
    db.listPlayers(),
    db.listCharacters(),
    db.listClasses(),
    db.listSeasons(),
    db.listDungeons(),
  ]);
  state.players = players;
  state.characters = characters;
  state.classes = classes;
  state.seasons = seasons;
  state.dungeons = dungeons;
}

function renderCharactersFilter() {
  const sel = $("#characters-player-filter");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML =
    `<option value="">All players</option>` +
    state.players
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
      .join("");
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
}

function renderAll() {
  renderPlayersTable();
  renderCharactersFilter();
  renderCharactersTable();
  renderSeasonsTable();
  renderDungeonsTable();
  renderClassesTable();
  renderGeneratorDropdowns();
  renderOverview();
}

// ---------- Players table ----------
const PLAYER_FIELDS = {
  name: { type: "text" },
  discord_name: { type: "text", nullable: true },
};

function renderPlayersTable() {
  const tbody = $("#players-table tbody");
  tbody.innerHTML = "";
  for (const p of state.players) {
    const cell = (field, content, extra = "") =>
      `<td class="editable ${extra}" data-kind="player" data-id="${p.id}" data-field="${field}">${content}</td>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      ${cell("name", escapeHtml(p.name))}
      ${cell("discord_name", escapeHtml(p.discord_name || ""))}
      <td class="num">${charsForPlayer(p.id).length}</td>
      <td class="actions">
        <button class="btn btn-ghost btn-icon btn-danger-hover" data-action="delete-player" data-id="${p.id}" title="Delete" aria-label="Delete">${ICON_TRASH}</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

// ---------- Characters table ----------
const CHAR_FIELDS = {
  name: { type: "text" },
  class: {
    type: "select",
    options: () => state.classes.map((c) => ({ value: c.name, label: c.name })),
    derive: (value) => {
      const cls = classByName(value);
      return cls ? { armor_type: cls.armor_type } : {};
    },
  },
  main_role: {
    type: "select",
    options: () => ["Tank", "Heal", "Dps"].map((v) => ({ value: v, label: v })),
  },
  off_role: {
    type: "select",
    nullable: true,
    options: () => [{ value: "", label: "—" }, ...["Tank", "Heal", "Dps"].map((v) => ({ value: v, label: v }))],
  },
  current_key_dungeon: {
    type: "select",
    nullable: true,
    options: () => {
      const cur = state.seasons.find((s) => s.is_current);
      const dgs = cur ? state.dungeons.filter((d) => d.season_id === cur.id) : state.dungeons;
      return [{ value: "", label: "—" }, ...dgs.map((d) => ({ value: d.name, label: d.name }))];
    },
  },
  current_key_level: { type: "number" },
  rating: { type: "number" },
  item_level: { type: "number", step: "0.1" },
};

function getCharSortValue(c, field) {
  if (field === "player") return byId(state.players, c.player_id)?.name || "";
  if (field === "is_active") return c.is_active ? 1 : 0;
  if (field === "key_active") return c.key_active === false ? 0 : 1;
  return c[field];
}

function compareCharacters(a, b) {
  const { field, dir } = charSort;
  const numeric = CHAR_NUMERIC_FIELDS.has(field);
  const av = getCharSortValue(a, field);
  const bv = getCharSortValue(b, field);
  let cmp;
  if (numeric) {
    cmp = (av == null ? -Infinity : Number(av)) - (bv == null ? -Infinity : Number(bv));
  } else if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv;
  } else {
    cmp = String(av || "").localeCompare(String(bv || ""));
  }
  if (cmp === 0 && field !== "player") {
    const ap = byId(state.players, a.player_id)?.name || "";
    const bp = byId(state.players, b.player_id)?.name || "";
    cmp = ap.localeCompare(bp);
  }
  return dir === "desc" ? -cmp : cmp;
}

function updateCharSortIndicators() {
  $$("#characters-table thead th[data-sort]").forEach((th) => {
    const active = th.dataset.sort === charSort.field;
    th.classList.toggle("sort-asc", active && charSort.dir === "asc");
    th.classList.toggle("sort-desc", active && charSort.dir === "desc");
  });
}

function renderCharactersTable() {
  const filterPlayerId = $("#characters-player-filter")?.value || "";
  const tbody = $("#characters-table tbody");
  tbody.innerHTML = "";
  updateCharSortIndicators();
  const sorted = [...state.characters]
    .filter((c) => !filterPlayerId || c.player_id === filterPlayerId)
    .sort(compareCharacters);
  for (const c of sorted) {
    const player = byId(state.players, c.player_id);
    const cls = classByName(c.class);
    const color = cls ? cls.color : "#ffffff";
    const cell = (field, content, extra = "") =>
      `<td class="editable ${extra}" data-kind="character" data-id="${c.id}" data-field="${field}">${content}</td>`;
    const tr = document.createElement("tr");
    if (!c.is_active) tr.classList.add("inactive");
    const keyExtra = c.key_active === false ? "strike muted" : "";
    tr.innerHTML = `
      <td>${escapeHtml(player?.name || "?")}</td>
      <td class="center"><input type="checkbox" data-action="toggle-active" data-id="${c.id}"${c.is_active ? " checked" : ""}></td>
      ${cell("name", `<span style="color:${color}">${escapeHtml(c.name)}</span>`)}
      ${cell("class", `<span style="color:${color}">${escapeHtml(c.class || "")}</span>`)}
      <td class="muted">${escapeHtml(c.armor_type || "")}</td>
      ${cell("main_role", escapeHtml(c.main_role || ""))}
      ${cell("off_role", escapeHtml(c.off_role || ""))}
      <td class="center"><input type="checkbox" data-action="toggle-key-active" data-id="${c.id}"${c.key_active === false ? "" : " checked"}></td>
      ${cell("current_key_dungeon", escapeHtml(c.current_key_dungeon || ""), keyExtra)}
      ${cell("current_key_level", c.current_key_level ?? "", `num ${keyExtra}`.trim())}
      ${cell("rating", c.rating ?? "", "num")}
      ${cell("item_level", c.item_level ?? "", "num")}
      <td class="actions">
        <button class="btn btn-ghost btn-icon btn-danger-hover" data-action="delete-character" data-id="${c.id}" title="Delete" aria-label="Delete">${ICON_TRASH}</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

const ARMOR_COLOR = {
  Plate: "#d4a356",
  Mail: "#5d9cdb",
  Leather: "#5bb87c",
  Cloth: "#b876dd",
};
const ARMOR_ORDER = ["Plate", "Mail", "Leather", "Cloth"];

const INLINE_KINDS = {
  character: {
    fields: CHAR_FIELDS,
    getRow: (id) => byId(state.characters, id),
    update: (id, patch) => db.updateCharacter(id, patch),
    rerender: () => {
      renderCharactersTable();
      renderOverview();
      const teamsContainer = $("#teams");
      if (teamsContainer && teamsContainer.children.length > 0) {
        const ids = $$('#view-generator select[data-slot]')
          .map((s) => s.value)
          .filter(Boolean);
        renderTeamCards([...new Set(ids)]);
      }
    },
  },
  player: {
    fields: PLAYER_FIELDS,
    getRow: (id) => byId(state.players, id),
    update: (id, patch) => db.updatePlayer(id, patch),
    rerender: () => {
      renderPlayersTable();
      renderGeneratorDropdowns();
    },
  },
};

function startInlineEdit(td) {
  if (td.querySelector(".cell-editor")) return;
  const kind = INLINE_KINDS[td.dataset.kind];
  if (!kind) return;
  const id = td.dataset.id;
  const field = td.dataset.field;
  const def = kind.fields[field];
  if (!def) return;
  const row = kind.getRow(id);
  if (!row) return;
  const original = row[field];

  let editor;
  if (def.type === "select") {
    editor = document.createElement("select");
    for (const opt of def.options()) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if ((opt.value || "") === (original ?? "")) o.selected = true;
      editor.appendChild(o);
    }
  } else {
    editor = document.createElement("input");
    editor.type = def.type;
    if (def.step) editor.step = def.step;
    editor.value = original ?? "";
  }
  editor.className = "cell-editor";

  if (td.tagName === "TD") {
    const lockedWidth = td.getBoundingClientRect().width;
    td.style.width = `${lockedWidth}px`;
    td.style.maxWidth = `${lockedWidth}px`;
  }
  td.innerHTML = "";
  td.appendChild(editor);
  editor.focus();
  if (editor.select) editor.select();

  let cancelled = false;
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    if (cancelled) {
      kind.rerender();
      return;
    }
    let value = editor.value;
    if (def.type === "number") value = value === "" ? null : Number(value);
    else if (def.nullable) value = value === "" ? null : value;
    if ((value ?? "") === (original ?? "")) {
      kind.rerender();
      return;
    }
    const patch = { [field]: value };
    if (def.derive) Object.assign(patch, def.derive(value));
    try {
      await kind.update(id, patch);
      Object.assign(row, patch);
      kind.rerender();
    } catch (err) {
      console.error(err);
      alert("Failed to update");
      kind.rerender();
    }
  };

  editor.addEventListener("blur", finish);
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      editor.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelled = true;
      editor.blur();
    }
  });
  if (def.type === "select") {
    editor.addEventListener("change", () => editor.blur());
  }
}

// ---------- Seasons / dungeons / classes tables ----------
function renderSeasonsTable() {
  const tbody = $("#seasons-table tbody");
  tbody.innerHTML = "";
  for (const s of state.seasons) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${s.is_current ? '<span style="color:var(--green)">●</span> current' : ""}</td>
      <td class="actions">
        <button class="btn btn-ghost btn-icon" data-action="edit-season" data-id="${s.id}" title="Edit" aria-label="Edit">${ICON_PENCIL}</button>
        <button class="btn btn-ghost btn-icon btn-danger-hover" data-action="delete-season" data-id="${s.id}" title="Delete" aria-label="Delete">${ICON_TRASH}</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

function updateDungeonSortIndicators() {
  $$("#dungeons-table thead th[data-sort]").forEach((th) => {
    const active = th.dataset.sort === dungeonSort.field;
    th.classList.toggle("sort-asc", active && dungeonSort.dir === "asc");
    th.classList.toggle("sort-desc", active && dungeonSort.dir === "desc");
  });
}

function renderDungeonsTable() {
  const tbody = $("#dungeons-table tbody");
  tbody.innerHTML = "";
  updateDungeonSortIndicators();
  const sorted = [...state.dungeons].sort((a, b) => {
    const { field, dir } = dungeonSort;
    const av = field === "season" ? (byId(state.seasons, a.season_id)?.name || "") : (a[field] || "");
    const bv = field === "season" ? (byId(state.seasons, b.season_id)?.name || "") : (b[field] || "");
    const cmp = String(av).localeCompare(String(bv));
    return dir === "desc" ? -cmp : cmp;
  });
  for (const d of sorted) {
    const season = byId(state.seasons, d.season_id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(season?.name || "?")}</td>
      <td>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.alias || "")}</td>
      <td class="actions">
        <button class="btn btn-ghost btn-icon" data-action="edit-dungeon" data-id="${d.id}" title="Edit" aria-label="Edit">${ICON_PENCIL}</button>
        <button class="btn btn-ghost btn-icon btn-danger-hover" data-action="delete-dungeon" data-id="${d.id}" title="Delete" aria-label="Delete">${ICON_TRASH}</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

function renderClassesTable() {
  const tbody = $("#classes-table tbody");
  tbody.innerHTML = "";
  for (const c of state.classes) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="class-dot" style="background:${c.color}"></span>${escapeHtml(c.name)}</td>
      <td class="mono">${escapeHtml(c.color)}</td>
      <td>${escapeHtml(c.armor_type)}</td>
      <td>${c.can_tank ? "✓" : ""}</td>
      <td>${c.can_heal ? "✓" : ""}</td>
      <td>${c.can_dps ? "✓" : ""}</td>`;
    tbody.appendChild(tr);
  }
}

// ---------- Dialog helpers ----------
function openDialog(id, title, values = {}) {
  const dlg = $(`#${id}`);
  $(`#${id}-title`).textContent = title;
  const form = dlg.querySelector("form");
  form.reset();
  form.dataset.editingId = values.id || "";
  for (const [k, v] of Object.entries(values)) {
    const field = form.elements[k];
    if (!field) continue;
    if (field.type === "checkbox") field.checked = !!v;
    else field.value = v ?? "";
  }
  dlg.showModal();
}

function setupDialogClosers() {
  $$(".dialog [data-close]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.target.closest("dialog").close();
    })
  );
}

// ---------- Player CRUD ----------
function setupPlayerCrud() {
  $("#new-player-btn").addEventListener("click", () =>
    openDialog("player-dialog", "New player")
  );

  $("#players-table").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn) {
      const id = btn.dataset.id;
      if (btn.dataset.action === "delete-player") {
        if (!confirm("Delete this player and all their characters?")) return;
        await db.deletePlayer(id);
        await loadAll();
        renderAll();
      }
      return;
    }
    const td = e.target.closest("td.editable");
    if (td) startInlineEdit(td);
  });

  $("#player-dialog form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const editingId = form.dataset.editingId;
    const row = {
      name: form.elements.name.value.trim(),
      discord_name: form.elements.discord_name.value.trim() || null,
    };
    if (editingId) await db.updatePlayer(editingId, row);
    else await db.createPlayer(row);
    form.closest("dialog").close();
    await loadAll();
    renderAll();
  });
}

// ---------- Character CRUD ----------
function populateCharacterDialogOptions() {
  const playerSelect = $('#character-dialog select[name="player_id"]');
  playerSelect.innerHTML = state.players
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");

  const classSelect = $('#character-dialog select[name="class"]');
  classSelect.innerHTML = state.classes
    .map((c) => `<option value="${c.name}">${escapeHtml(c.name)}</option>`)
    .join("");

  const dungeonSelect = $('#character-dialog select[name="current_key_dungeon"]');
  const currentSeason = state.seasons.find((s) => s.is_current);
  const dungeons = currentSeason
    ? state.dungeons.filter((d) => d.season_id === currentSeason.id)
    : state.dungeons;
  dungeonSelect.innerHTML =
    `<option value="">—</option>` +
    dungeons
      .map((d) => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`)
      .join("");
}

function syncDialogArmorFromClass() {
  const classSelect = $('#character-dialog [name="class"]');
  const armorDisplay = $('#character-dialog [name="armor_type_display"]');
  const cls = classByName(classSelect.value);
  armorDisplay.value = cls ? cls.armor_type : "";
}

async function handleCharCheckboxToggle(cb) {
  const id = cb.dataset.id;
  const checked = cb.checked;
  const field =
    cb.dataset.action === "toggle-active"
      ? "is_active"
      : cb.dataset.action === "toggle-key-active"
      ? "key_active"
      : null;
  if (!field) return;
  try {
    await db.updateCharacter(id, { [field]: checked });
    const ch = byId(state.characters, id);
    if (ch) ch[field] = checked;
    INLINE_KINDS.character.rerender();
  } catch (err) {
    console.error(err);
    alert("Failed to update");
    cb.checked = !checked;
  }
}

function setupCharacterCrud() {
  $("#characters-player-filter").addEventListener("change", renderCharactersTable);

  $('#character-dialog [name="class"]').addEventListener("change", syncDialogArmorFromClass);

  $("#new-character-btn").addEventListener("click", () => {
    populateCharacterDialogOptions();
    openDialog("character-dialog", "New character");
    syncDialogArmorFromClass();
  });

  $("#characters-table").addEventListener("change", async (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-action]');
    if (cb) await handleCharCheckboxToggle(cb);
  });

  $("#characters-table thead").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    const field = th.dataset.sort;
    if (charSort.field === field) {
      charSort.dir = charSort.dir === "asc" ? "desc" : "asc";
    } else {
      charSort.field = field;
      charSort.dir = "asc";
    }
    renderCharactersTable();
  });

  $("#characters-table").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn) {
      const id = btn.dataset.id;
      if (btn.dataset.action === "delete-character") {
        if (!confirm("Delete this character?")) return;
        await db.deleteCharacter(id);
        await loadAll();
        renderAll();
      }
      return;
    }
    if (e.target.closest('input[type="checkbox"]')) return;
    const td = e.target.closest("td.editable");
    if (td) startInlineEdit(td);
  });

  $("#character-dialog form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const editingId = form.dataset.editingId;
    const f = form.elements;
    const cls = classByName(f.class.value);
    const row = {
      player_id: f.player_id.value,
      name: f.name.value.trim(),
      class: f.class.value,
      armor_type: cls ? cls.armor_type : null,
      main_role: f.main_role.value,
      off_role: f.off_role.value || null,
      current_key_dungeon: f.current_key_dungeon.value || null,
      current_key_level: f.current_key_level.value ? Number(f.current_key_level.value) : null,
      rating: f.rating.value ? Number(f.rating.value) : null,
      item_level: f.item_level.value ? Number(f.item_level.value) : null,
    };
    if (editingId) await db.updateCharacter(editingId, row);
    else await db.createCharacter(row);
    form.closest("dialog").close();
    await loadAll();
    renderAll();
  });
}

// ---------- Season CRUD ----------
function setupSeasonCrud() {
  $("#new-season-btn").addEventListener("click", () =>
    openDialog("season-dialog", "New season")
  );

  $("#seasons-table").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit-season") {
      openDialog("season-dialog", "Edit season", byId(state.seasons, id));
    } else if (btn.dataset.action === "delete-season") {
      if (!confirm("Delete this season and all its dungeons?")) return;
      await db.deleteSeason(id);
      await loadAll();
      renderAll();
    }
  });

  $("#season-dialog form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const editingId = form.dataset.editingId;
    const row = {
      name: form.elements.name.value.trim(),
      is_current: form.elements.is_current.checked,
    };
    if (editingId) await db.updateSeason(editingId, row);
    else await db.createSeason(row);
    form.closest("dialog").close();
    await loadAll();
    renderAll();
  });
}

// ---------- Dungeon CRUD ----------
function populateDungeonDialogOptions() {
  const sel = $('#dungeon-dialog select[name="season_id"]');
  sel.innerHTML = state.seasons
    .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
    .join("");
}

function setupDungeonCrud() {
  $("#new-dungeon-btn").addEventListener("click", () => {
    populateDungeonDialogOptions();
    openDialog("dungeon-dialog", "New dungeon");
  });

  $("#dungeons-table thead").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    const field = th.dataset.sort;
    if (dungeonSort.field === field) {
      dungeonSort.dir = dungeonSort.dir === "asc" ? "desc" : "asc";
    } else {
      dungeonSort.field = field;
      dungeonSort.dir = "asc";
    }
    renderDungeonsTable();
  });

  $("#dungeons-table").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit-dungeon") {
      populateDungeonDialogOptions();
      openDialog("dungeon-dialog", "Edit dungeon", byId(state.dungeons, id));
    } else if (btn.dataset.action === "delete-dungeon") {
      if (!confirm("Delete this dungeon?")) return;
      await db.deleteDungeon(id);
      await loadAll();
      renderAll();
    }
  });

  $("#dungeon-dialog form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const editingId = form.dataset.editingId;
    const row = {
      season_id: form.elements.season_id.value,
      name: form.elements.name.value.trim(),
      alias: form.elements.alias.value.trim() || null,
    };
    if (editingId) await db.updateDungeon(editingId, row);
    else await db.createDungeon(row);
    form.closest("dialog").close();
    await loadAll();
    renderAll();
  });
}

// ---------- Boost generator ----------
function renderTeamCards(playerIds) {
  const container = $("#teams");
  if (!container) return;
  if (playerIds.length !== 4) {
    container.innerHTML = "";
    return;
  }
  const { teams } = computeValidTeams(playerIds);
  const stackTeams = teams.filter((team) => {
    const counts = teamArmorCounts(team);
    return Math.max(0, ...Object.values(counts)) >= 2;
  });
  if (stackTeams.length === 0) {
    container.innerHTML = "";
    return;
  }
  const teamStacks = (team) =>
    Object.entries(teamArmorCounts(team))
      .filter(([, n]) => n >= 2)
      .map(([armor, count]) => ({ armor, count }));

  const sortKey = (team) => {
    const stacks = teamStacks(team);
    if (stacks.length === 1) {
      return [0, ARMOR_ORDER.indexOf(stacks[0].armor), -stacks[0].count];
    }
    const armors = stacks
      .map((s) => ARMOR_ORDER.indexOf(s.armor))
      .sort((a, b) => a - b);
    return [1, ...armors];
  };
  stackTeams.sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    const len = Math.max(ka.length, kb.length);
    for (let i = 0; i < len; i++) {
      const va = ka[i] ?? -1;
      const vb = kb[i] ?? -1;
      if (va !== vb) return va - vb;
    }
    return 0;
  });

  const cards = stackTeams
    .map((team) => {
      const stacks = teamStacks(team);
      const headerHtml = stacks
        .map(
          (s) =>
            `<span style="color:${ARMOR_COLOR[s.armor] || "inherit"}">${escapeHtml(
              `${s.armor} x${s.count}`
            )}</span>`
        )
        .join(", ");
      const teamRoles = findTeamRoleAssignment(team) || [];
      const ROLE_ORDER = { Tank: 0, Heal: 1, Dps: 2 };
      const sortedMembers = team
        .map((c, i) => ({ c, role: teamRoles[i] }))
        .sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));
      const rows = sortedMembers
        .map(({ c, role }) => {
          const cls = classByName(c.class);
          const color = cls ? cls.color : "inherit";
          const abbr = role === "Tank" ? "T" : role === "Heal" ? "H" : role === "Dps" ? "D" : "";
          return `<div class="team-card-row">
            <span class="role-tag">${abbr}</span>
            <span style="color:${color}">${escapeHtml(c.name)}</span>
            <span>${keyDisplayHtml(c)}</span>
          </div>`;
        })
        .join("");
      return `<div class="team-card">
        <div class="team-card-header">${headerHtml}</div>
        ${rows}
      </div>`;
    })
    .join("");
  container.innerHTML = `
    <label class="output-label">Mögliche Teams (${stackTeams.length})</label>
    <div class="teams-grid">${cards}</div>
  `;
}

function renderOverview() {
  const overview = $("#overview");
  if (!overview) return;
  const ids = $$('#view-generator select[data-slot]').map((s) => s.value).filter(Boolean);
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    overview.innerHTML = "";
    return;
  }
  const header = `
    <div class="overview-header">
      <span>Name</span>
      <span>Klasse</span>
      <span class="num">iLvl</span>
      <span class="num">Rating</span>
      <span class="center">Key</span>
      <span>Dungeon</span>
      <span class="num">Lvl</span>
    </div>`;
  const players = unique
    .map((pid) => {
      const player = byId(state.players, pid);
      if (!player) return "";
      const chars = state.characters.filter((c) => c.player_id === pid && c.is_active);
      const rows = chars
        .map((c) => {
          const cls = classByName(c.class);
          const color = cls ? cls.color : "inherit";
          const dungeonText = c.current_key_dungeon
            ? dungeonAlias(c.current_key_dungeon)
            : "—";
          const levelText =
            c.current_key_level != null ? String(c.current_key_level) : "—";
          const ilvlText = c.item_level != null ? String(c.item_level) : "—";
          const ratingText = c.rating != null ? String(c.rating) : "—";
          const keyMuted = c.key_active === false ? " strike muted" : "";
          return `<div class="overview-row">
            <span style="color:${color}">${escapeHtml(c.name)}</span>
            <span class="muted">${escapeHtml(c.class || "")}</span>
            <span class="num editable-inline" data-kind="character" data-id="${c.id}" data-field="item_level">${escapeHtml(ilvlText)}</span>
            <span class="num editable-inline" data-kind="character" data-id="${c.id}" data-field="rating">${escapeHtml(ratingText)}</span>
            <span class="center"><input type="checkbox" data-action="toggle-key-active" data-id="${c.id}"${c.key_active === false ? "" : " checked"}></span>
            <span class="editable-inline${keyMuted}" data-kind="character" data-id="${c.id}" data-field="current_key_dungeon">${escapeHtml(dungeonText)}</span>
            <span class="num editable-inline${keyMuted}" data-kind="character" data-id="${c.id}" data-field="current_key_level">${escapeHtml(levelText)}</span>
          </div>`;
        })
        .join("");
      return `<div class="overview-player">
        <div class="overview-player-name">${escapeHtml(player.name)}</div>
        ${rows || '<div class="muted small">no active characters</div>'}
      </div>`;
    })
    .join("");
  overview.innerHTML = header + players;
}

function renderGeneratorDropdowns() {
  const options =
    `<option value="">—</option>` +
    state.players
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
      .join("");
  $$('#view-generator select[data-slot]').forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = options;
    sel.value = current;
  });
}

function getSelectedServer() {
  const checked = $('input[name="server"]:checked');
  return checked ? checked.value : "sylvanas";
}

function setSelectedServer(server) {
  const rb = $(`input[name="server"][value="${server}"]`);
  if (rb) rb.checked = true;
}

function buildBoostStringForServer(server, playerIds) {
  if (server === "garona") return "Garona coming soon";
  return buildBoostString(playerIds);
}

function setupGenerator() {
  $$('#view-generator select[data-slot]').forEach((sel) =>
    sel.addEventListener("change", () => {
      renderOverview();
      const idx = Number(sel.dataset.slot);
      pushAppState({ [`slot_${idx}`]: sel.value || null });
    })
  );

  $$('input[name="server"]').forEach((rb) =>
    rb.addEventListener("change", () => {
      if (!rb.checked) return;
      pushAppState({ server: rb.value });
    })
  );

  const wireOption = (sel, field) => {
    const cb = $(sel);
    if (!cb) return;
    cb.addEventListener("change", () => {
      regenerateBoostOutput();
      const patch = { [field]: cb.checked };
      const slots = $$('#view-generator select[data-slot]').map((s) => s.value);
      if (slots.some(Boolean)) {
        const generatedAt = new Date().toISOString();
        lastAppliedGeneratedAt = generatedAt;
        patch.generated_at = generatedAt;
      }
      pushAppState(patch);
    });
  };
  wireOption("#opt-discord-name", "opt_discord_name");
  wireOption("#opt-code-block", "opt_code_block");

  $("#view-generator").addEventListener("click", (e) => {
    const el = e.target.closest(".editable-inline");
    if (el) startInlineEdit(el);
  });

  $("#view-generator").addEventListener("change", async (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-action]');
    if (cb) await handleCharCheckboxToggle(cb);
  });

  $("#generate-btn").addEventListener("click", () => {
    const slots = $$('#view-generator select[data-slot]').map((s) => s.value);
    const unique = [...new Set(slots.filter(Boolean))];
    const server = getSelectedServer();
    $("#generator-output").value = buildBoostStringForServer(server, unique);
    $("#discord-output").value = buildDiscordString(unique);
    renderTeamCards(unique);
    const generatedAt = new Date().toISOString();
    lastAppliedGeneratedAt = generatedAt;
    pushAppState({ generated_at: generatedAt });
  });

  function regenerateBoostOutput() {
    const slots = $$('#view-generator select[data-slot]').map((s) => s.value);
    const unique = [...new Set(slots.filter(Boolean))];
    if (unique.length === 0) return;
    const server = getSelectedServer();
    $("#generator-output").value = buildBoostStringForServer(server, unique);
  }

  const wireCopy = (btnSel, outputSel, statusSel) => {
    $(btnSel).addEventListener("click", async () => {
      const text = $(outputSel).value;
      if (!text) return;
      await navigator.clipboard.writeText(text);
      const status = $(statusSel);
      status.textContent = "kopiert";
      setTimeout(() => (status.textContent = ""), 1500);
    });
  };
  wireCopy("#copy-btn", "#generator-output", "#copy-status");
  wireCopy("#copy-discord-btn", "#discord-output", "#copy-discord-status");

  $("#clear-btn").addEventListener("click", () => {
    $$('#view-generator select[data-slot]').forEach((sel) => (sel.value = ""));
    clearGeneratorOutput();
    renderOverview();
    lastAppliedGeneratedAt = null;
    pushAppState({
      slot_0: null,
      slot_1: null,
      slot_2: null,
      slot_3: null,
      generated_at: null,
    });
  });
}

function clearGeneratorOutput() {
  const out = $("#generator-output");
  if (out) out.value = "";
  const dout = $("#discord-output");
  if (dout) dout.value = "";
  const teams = $("#teams");
  if (teams) teams.innerHTML = "";
}

function dungeonAlias(name) {
  if (!name) return "";
  const d = state.dungeons.find((x) => x.name === name);
  return d?.alias || name;
}

function keyDisplayHtml(c) {
  if (!c.current_key_dungeon) return '<span class="muted">kein Key</span>';
  const text = escapeHtml(
    `${dungeonAlias(c.current_key_dungeon)} ${c.current_key_level ?? ""}`.trim()
  );
  if (c.key_active === false) return `<span class="muted strike">${text}</span>`;
  return text;
}

const ROLE_EMOJI = { Tank: ":tank:", Heal: ":Healer:", Dps: ":DPS:" };

function formatCharacterPartsText(c) {
  const roles = [c.main_role, c.off_role].filter(Boolean).map((r) => r.toUpperCase()).join(" ");
  const classArmor = `${c.class ?? ""} (${c.armor_type ?? ""})`;
  const rating = c.rating != null ? `RIO ${c.rating}` : "";
  const ilvl = c.item_level != null ? `iLvl ${c.item_level}` : "";
  const key =
    c.key_active !== false && c.current_key_dungeon
      ? `${dungeonAlias(c.current_key_dungeon)} +${c.current_key_level ?? ""}`
      : "";
  return [roles, classArmor, rating, ilvl, key];
}

function formatCharacterPartsEmoji(c) {
  const roles = [c.main_role, c.off_role]
    .filter(Boolean)
    .map((r) => ROLE_EMOJI[r] || r)
    .join(" ");
  const classArmor = `${c.class ?? ""} (${c.armor_type ?? ""})`;
  const first = roles ? `${roles} ${classArmor}` : classArmor;
  const rating = c.rating != null ? `:raiderio: ${c.rating}` : "";
  const ilvl = c.item_level != null ? `:crossed_swords: ${c.item_level}` : "";
  const key =
    c.key_active !== false && c.current_key_dungeon
      ? `:keystone: ${dungeonAlias(c.current_key_dungeon)} (${c.current_key_level ?? ""})`
      : "";
  return [first, rating, ilvl, key];
}

function getCharRoles(c) {
  const roles = [];
  if (c.main_role) roles.push(c.main_role);
  if (c.off_role && c.off_role !== c.main_role) roles.push(c.off_role);
  return roles;
}

function canFormTeam(team) {
  return findTeamRoleAssignment(team) !== null;
}

function findTeamRoleAssignment(team) {
  const sets = team.map(getCharRoles);
  if (sets.some((s) => s.length === 0)) return null;
  for (const r0 of sets[0])
    for (const r1 of sets[1])
      for (const r2 of sets[2])
        for (const r3 of sets[3]) {
          const arr = [r0, r1, r2, r3];
          let t = 0, h = 0, d = 0;
          for (const r of arr) {
            if (r === "Tank") t++;
            else if (r === "Heal") h++;
            else if (r === "Dps") d++;
          }
          if (t === 1 && h === 1 && d === 2) return arr;
        }
  return null;
}

function teamArmorCounts(team) {
  const counts = {};
  for (const c of team) {
    if (!c.armor_type) continue;
    counts[c.armor_type] = (counts[c.armor_type] || 0) + 1;
  }
  return counts;
}

function teamKeyEntries(team) {
  const entries = [];
  for (const c of team) {
    if (c.key_active === false) continue;
    if (!c.current_key_dungeon || c.current_key_level == null) continue;
    entries.push({
      id: `${c.current_key_dungeon}|${c.current_key_level}`,
      label: `${dungeonAlias(c.current_key_dungeon)} (${c.current_key_level})`,
    });
  }
  return entries;
}

function poolKeyCounts(chars) {
  const map = new Map();
  for (const c of chars) {
    if (c.key_active === false) continue;
    if (!c.current_key_dungeon || c.current_key_level == null) continue;
    const id = `${c.current_key_dungeon}|${c.current_key_level}`;
    const entry = map.get(id);
    if (entry) entry.count++;
    else
      map.set(id, {
        label: `${dungeonAlias(c.current_key_dungeon)} (${c.current_key_level})`,
        count: 1,
      });
  }
  return map;
}

function formatKeyCount(label, count) {
  return count > 1 ? `${count}x ${label}` : label;
}

function computeValidTeams(playerIds) {
  const pools = playerIds.map((pid) =>
    state.characters.filter((c) => c.player_id === pid && c.is_active)
  );
  if (!pools.every((p) => p.length > 0)) return { pools, teams: [] };
  const teams = [];
  for (const a of pools[0])
    for (const b of pools[1])
      for (const c of pools[2])
        for (const d of pools[3]) {
          const team = [a, b, c, d];
          if (canFormTeam(team)) teams.push(team);
        }
  return { pools, teams };
}

function buildTeamString(playerIds) {
  const { pools, teams: validTeams } = computeValidTeams(playerIds);
  const showDiscordName = $("#opt-discord-name")?.checked ?? true;
  const lines = ["**TEAM TAKE**", ""];

  const poolKeys = poolKeyCounts(pools.flat());
  const noStackList = [...poolKeys.values()]
    .map((e) => formatKeyCount(e.label, e.count))
    .join(" | ");
  lines.push("*No-Stack Keys*");
  lines.push("```");
  lines.push(noStackList || "none");
  lines.push("```");

  const stacks = {};
  for (const team of validTeams) {
    const counts = teamArmorCounts(team);
    const max = Math.max(0, ...Object.values(counts));
    if (max <= 1) continue;
    for (const [armor, count] of Object.entries(counts)) {
      if (count < 2) continue;
      const cur = stacks[armor];
      if (!cur || count > cur.max) stacks[armor] = { max: count, chars: new Map() };
      if (count === stacks[armor].max) {
        for (const c of team) stacks[armor].chars.set(c.id, c);
      }
    }
  }

  const stackEntries = Object.entries(stacks);
  if (stackEntries.length > 0) {
    const stackRows = stackEntries.map(([armor, data]) => {
      const counts = poolKeyCounts([...data.chars.values()]);
      const list = [...counts.values()]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((e) => formatKeyCount(e.label, e.count))
        .join(" | ");
      return { first: `${armor} x${data.max}`, list: list || "none" };
    });
    const w0 = Math.max(...stackRows.map((r) => r.first.length));
    lines.push("*Possible Stacks*");
    lines.push("```");
    for (const r of stackRows) {
      lines.push(`${r.first.padEnd(w0)} - ${r.list}`);
    }
    lines.push("```");
  }

  lines.push("*trade / lower / reroll all*");
  if (showDiscordName) {
    const mentions = playerIds
      .map((pid) => byId(state.players, pid))
      .filter(Boolean)
      .map((p) => `@${p.discord_name || p.name}`)
      .join(" ");
    if (mentions) lines.push(mentions);
  }
  return lines.join("\n");
}

function buildBoostString(playerIds) {
  if (playerIds.length === 0) return "";
  if (playerIds.length === 4) {
    return buildTeamString(playerIds);
  }

  const useCodeBlock = $("#opt-code-block")?.checked ?? true;
  const showDiscordName = $("#opt-discord-name")?.checked ?? true;
  const formatter = useCodeBlock ? formatCharacterPartsText : formatCharacterPartsEmoji;

  const headers = { 1: "**SOLO SIGN**", 2: "**DUO SIGN**", 3: "**TRIO SIGN**" };
  const playerCharParts = playerIds.map((pid) =>
    charsForPlayer(pid)
      .filter((c) => c.is_active)
      .map(formatter)
  );
  const allParts = playerCharParts.flat();
  const colCount = allParts[0]?.length ?? 0;
  const widths = new Array(colCount).fill(0);
  for (const parts of allParts) {
    parts.forEach((p, i) => {
      widths[i] = Math.max(widths[i], p.length);
    });
  }
  const activeCols = widths
    .map((w, i) => (w > 0 ? i : -1))
    .filter((i) => i >= 0);
  const lastCol = activeCols[activeCols.length - 1];

  const lines = [headers[playerIds.length], ""];
  const includeDiscordHeader = showDiscordName && (playerIds.length === 2 || playerIds.length === 3);
  playerCharParts.forEach((charParts, idx) => {
    if (!useCodeBlock && idx > 0) lines.push("");
    if (includeDiscordHeader) {
      const player = byId(state.players, playerIds[idx]);
      if (player) lines.push(`@${player.discord_name || player.name}`);
    }
    if (charParts.length === 0) return;
    if (useCodeBlock) lines.push("```");
    for (const parts of charParts) {
      const segments = activeCols.map((i) => {
        const value = parts[i] || "";
        if (i === lastCol) return value;
        if (i === 0 && !useCodeBlock) return value;
        return value.padEnd(widths[i]);
      });
      lines.push(segments.join(" | "));
    }
    if (useCodeBlock) lines.push("```");
  });
  if (!useCodeBlock) lines.push("");
  lines.push("*trade / lower / reroll all*");
  return lines.join("\n");
}

function buildDiscordString(playerIds) {
  return playerIds
    .map((pid) => byId(state.players, pid))
    .filter(Boolean)
    .map((p) => `@${p.discord_name || p.name}`)
    .join(" ");
}

// ---------- Addon import ----------
function decodeAddonExport(raw) {
  const str = raw.trim().replace(/\s/g, "");
  if (!str.startsWith("WB1|")) throw new Error("Missing WB1| prefix");
  let json;
  try {
    const binary = atob(str.slice(4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    json = new TextDecoder("utf-8").decode(bytes);
  } catch { throw new Error("Invalid base64"); }
  let payload;
  try { payload = JSON.parse(json); } catch { throw new Error("Invalid JSON inside export string"); }
  if (payload.v !== 1) throw new Error(`Unsupported version: ${payload.v}`);
  if (!Array.isArray(payload.characters)) throw new Error("Missing characters array");
  return payload;
}

function classifyImportChars(chars, playerId) {
  return chars.map((ic) => {
    const cls = classByName(ic.class);
    if (!cls) return { ...ic, status: "invalid" };

    const nameLower = (ic.name || "").toLowerCase();
    const existing = state.characters.find(
      (c) => c.player_id === playerId && c.name.toLowerCase() === nameLower
    );

    const importRow = {
      player_id: playerId,
      name: ic.name,
      class: ic.class,
      armor_type: cls.armor_type,
      main_role: ic.main_role || null,
      off_role: ic.off_role || null,
      current_key_dungeon: ic.current_key_dungeon || null,
      current_key_level: ic.current_key_level ?? null,
      rating: ic.rating ?? null,
      item_level: ic.item_level ?? null,
    };

    if (existing) {
      const changed = Object.entries(importRow).some(([k, v]) => {
        const ev = existing[k] ?? null;
        const iv = v ?? null;
        if (typeof ev === "number" && typeof iv === "number") return Math.abs(ev - iv) > 0.001;
        return ev !== iv;
      });
      return { ...ic, status: changed ? "update" : "no-change", existingId: existing.id, importRow };
    }
    return { ...ic, status: "insert", importRow };
  });
}

async function executeImport(classified) {
  const toWrite = classified.filter((c) => c.status === "insert" || c.status === "update");
  for (const c of toWrite) {
    if (c.status === "insert") await db.createCharacter(c.importRow);
    else await db.updateCharacter(c.existingId, c.importRow);
  }
  await loadAll();
  renderAll();
}

function setupImport() {
  const dlg          = $("#import-characters-dialog");
  const playerSel    = $("#import-player-select");
  const pasteInput   = $("#import-paste-input");
  const decodeBtn    = $("#import-decode-btn");
  const decodeStatus = $("#import-decode-status");
  const preview      = $("#import-preview");
  const previewBody  = $("#import-preview-table tbody");
  const checkAll     = $("#import-check-all");
  const confirmBtn   = $("#import-confirm-btn");

  let classified = null;

  function updateConfirmBtn() {
    const anyCheckedWritable = $$('#import-preview-table tbody input[type="checkbox"]:not(:disabled):checked')
      .some((cb) => {
        const item = classified?.[Number(cb.dataset.idx)];
        return item && (item.status === "insert" || item.status === "update");
      });
    confirmBtn.disabled = !anyCheckedWritable;
  }

  function triggerDecode() {
    const playerId = playerSel.value;
    if (!playerId) {
      decodeStatus.className = "import-status error";
      decodeStatus.textContent = "Select a player first";
      preview.classList.add("hidden");
      classified = null;
      confirmBtn.disabled = true;
      return;
    }
    let payload;
    try {
      payload = decodeAddonExport(pasteInput.value);
    } catch (err) {
      decodeStatus.className = "import-status error";
      decodeStatus.textContent = err.message;
      preview.classList.add("hidden");
      classified = null;
      confirmBtn.disabled = true;
      return;
    }
    classified = classifyImportChars(payload.characters, playerId);
    renderImportPreview(classified);
    preview.classList.remove("hidden");
    const inserts = classified.filter((c) => c.status === "insert").length;
    const updates = classified.filter((c) => c.status === "update").length;
    const invalids = classified.filter((c) => c.status === "invalid").length;
    const parts = [];
    if (inserts) parts.push(`${inserts} new`);
    if (updates) parts.push(`${updates} update`);
    if (invalids) parts.push(`${invalids} invalid`);
    decodeStatus.className = "import-status";
    decodeStatus.textContent = parts.join(", ") || "no changes";
    updateConfirmBtn();
  }

  function openImportDialog() {
    const savedPlayerId = localStorage.getItem("wb_import_player_id");
    playerSel.innerHTML =
      `<option value="">— select player —</option>` +
      state.players.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    if (savedPlayerId && [...playerSel.options].some((o) => o.value === savedPlayerId)) {
      playerSel.value = savedPlayerId;
    }
    pasteInput.value = "";
    decodeStatus.className = "import-status";
    decodeStatus.textContent = "";
    preview.classList.add("hidden");
    previewBody.innerHTML = "";
    confirmBtn.disabled = true;
    classified = null;
    dlg.showModal();
  }

  $("#import-characters-btn").addEventListener("click", openImportDialog);
  $("#sidebar-import-btn").addEventListener("click", openImportDialog);

  playerSel.addEventListener("change", () => {
    if (playerSel.value) localStorage.setItem("wb_import_player_id", playerSel.value);
    else localStorage.removeItem("wb_import_player_id");
  });

  pasteInput.addEventListener("paste", () => requestAnimationFrame(triggerDecode));
  decodeBtn.addEventListener("click", triggerDecode);

  checkAll.addEventListener("change", () => {
    $$('#import-preview-table tbody input[type="checkbox"]:not(:disabled)').forEach((cb) => {
      cb.checked = checkAll.checked;
    });
    updateConfirmBtn();
  });

  previewBody.addEventListener("change", (e) => {
    if (!e.target.matches('input[type="checkbox"]')) return;
    const allCbs = $$('#import-preview-table tbody input[type="checkbox"]:not(:disabled)');
    checkAll.checked = allCbs.length > 0 && allCbs.every((cb) => cb.checked);
    updateConfirmBtn();
  });

  confirmBtn.addEventListener("click", async () => {
    if (!classified) return;
    const checkedIdxs = new Set(
      $$('#import-preview-table tbody input[type="checkbox"]:checked:not(:disabled)')
        .map((cb) => Number(cb.dataset.idx))
    );
    const toImport = classified.filter((_, idx) => checkedIdxs.has(idx));
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Importing…";
    try {
      await executeImport(toImport);
      dlg.close();
    } catch (err) {
      console.error(err);
      alert("Import failed: " + err.message);
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Import";
    }
  });

  function renderImportPreview(items) {
    previewBody.innerHTML = "";
    for (const [idx, item] of items.entries()) {
      const tr = document.createElement("tr");
      const actionClass = {
        insert: "import-action-insert",
        update: "import-action-update",
        "no-change": "import-action-nochange",
        invalid: "import-action-invalid",
      }[item.status] || "import-action-nochange";
      const actionLabel = {
        insert: "Insert",
        update: "Update",
        "no-change": "No change",
        invalid: "Invalid class",
      }[item.status] || item.status;
      const cbDisabled = item.status === "invalid" ? " disabled" : "";
      const cbChecked  = (item.status === "insert" || item.status === "update") ? " checked" : "";
      tr.innerHTML = `
        <td class="center"><input type="checkbox" data-idx="${idx}"${cbChecked}${cbDisabled}></td>
        <td>${escapeHtml(item.name || "")}</td>
        <td>${escapeHtml(item.class || "")}</td>
        <td>${escapeHtml(item.main_role || "")}</td>
        <td>${escapeHtml(item.off_role || "")}</td>
        <td>${escapeHtml(item.current_key_dungeon || "")}</td>
        <td class="num">${item.current_key_level ?? ""}</td>
        <td class="num">${item.rating ?? ""}</td>
        <td class="num">${item.item_level ?? ""}</td>
        <td><span class="${actionClass}">${actionLabel}</span></td>`;
      previewBody.appendChild(tr);
    }
    const allCbs = $$('#import-preview-table tbody input[type="checkbox"]:not(:disabled)');
    checkAll.checked = allCbs.length > 0 && allCbs.every((cb) => cb.checked);
  }
}

// ---------- Live sync ----------
async function handleRemoteDbChange(table) {
  try {
    if (table === "players") state.players = await db.listPlayers();
    else if (table === "characters") state.characters = await db.listCharacters();
    else if (table === "seasons") state.seasons = await db.listSeasons();
    else if (table === "dungeons") state.dungeons = await db.listDungeons();
    else return;
  } catch (err) {
    console.error(err);
    return;
  }
  renderAll();
  refreshTeamCardsIfShown();
}

function refreshTeamCardsIfShown() {
  const teamsContainer = $("#teams");
  if (!teamsContainer || teamsContainer.children.length === 0) return;
  const ids = $$('#view-generator select[data-slot]')
    .map((s) => s.value)
    .filter(Boolean);
  renderTeamCards([...new Set(ids)]);
}

function applyAppState(row) {
  if (!row) return;
  $$('#view-generator select[data-slot]').forEach((sel) => {
    const idx = Number(sel.dataset.slot);
    const val = row[`slot_${idx}`] || "";
    if (sel.value !== val) sel.value = val;
  });
  setSelectedServer(row.server || "sylvanas");
  const cbName = $("#opt-discord-name");
  if (cbName) cbName.checked = row.opt_discord_name !== false;
  const cbCode = $("#opt-code-block");
  if (cbCode) cbCode.checked = row.opt_code_block !== false;

  renderOverview();

  if (row.generated_at !== lastAppliedGeneratedAt) {
    if (row.generated_at) {
      const slots = $$('#view-generator select[data-slot]').map((s) => s.value);
      const unique = [...new Set(slots.filter(Boolean))];
      if (unique.length > 0) {
        const server = getSelectedServer();
        $("#generator-output").value = buildBoostStringForServer(server, unique);
        $("#discord-output").value = buildDiscordString(unique);
        renderTeamCards(unique);
      }
    } else if (lastAppliedGeneratedAt) {
      clearGeneratorOutput();
    }
    lastAppliedGeneratedAt = row.generated_at || null;
  }
}

function handleRemoteAppStateChange(payload) {
  const row = payload?.new;
  if (!row) return;
  if (row.client_id === clientId) {
    if (row.generated_at) lastAppliedGeneratedAt = row.generated_at;
    return;
  }
  applyAppState(row);
}

function pushAppState(patch) {
  Object.assign(pendingAppStatePatch, patch, { client_id: clientId });
  clearTimeout(pushAppStateTimer);
  pushAppStateTimer = setTimeout(async () => {
    const next = pendingAppStatePatch;
    pendingAppStatePatch = {};
    pushAppStateTimer = null;
    try { await db.updateAppState(next); } catch (err) { console.error(err); }
  }, 100);
}

async function handleReconnect() {
  try {
    await loadAll();
    renderAll();
    refreshTeamCardsIfShown();
    const row = await db.getAppState();
    applyAppState(row);
  } catch (err) {
    console.error(err);
  }
}

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// ---------- Boot ----------
async function main() {
  setupNav();
  setupDialogClosers();
  setupPlayerCrud();
  setupCharacterCrud();
  setupSeasonCrud();
  setupDungeonCrud();
  setupGenerator();
  setupImport();
  try {
    await loadAll();
    renderAll();
  } catch (err) {
    console.error(err);
    alert(
      "Failed to load data from Supabase. Check that src/js/config.js has the correct URL and publishable key."
    );
    return;
  }
  try {
    const row = await db.getAppState();
    applyAppState(row);
  } catch (err) {
    console.error(err);
  }
  liveChannel = db.createLiveChannel({
    onDbChange: handleRemoteDbChange,
    onAppStateChange: handleRemoteAppStateChange,
    onReconnect: handleReconnect,
  });
}

main();
