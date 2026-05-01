import * as db from "./supabase.js";

const state = {
  players: [],
  characters: [],
  classes: [],
  seasons: [],
  dungeons: [],
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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

function renderAll() {
  renderPlayersTable();
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
        <button class="btn btn-ghost" data-action="delete-player" data-id="${p.id}">Delete</button>
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

function renderCharactersTable() {
  const tbody = $("#characters-table tbody");
  tbody.innerHTML = "";
  for (const c of state.characters) {
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
        <button class="btn btn-ghost" data-action="delete-character" data-id="${c.id}">Delete</button>
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
        <button class="btn btn-ghost" data-action="edit-season" data-id="${s.id}">Edit</button>
        <button class="btn btn-ghost" data-action="delete-season" data-id="${s.id}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

function renderDungeonsTable() {
  const tbody = $("#dungeons-table tbody");
  tbody.innerHTML = "";
  for (const d of state.dungeons) {
    const season = byId(state.seasons, d.season_id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(season?.name || "?")}</td>
      <td>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.alias || "")}</td>
      <td class="actions">
        <button class="btn btn-ghost" data-action="edit-dungeon" data-id="${d.id}">Edit</button>
        <button class="btn btn-ghost" data-action="delete-dungeon" data-id="${d.id}">Delete</button>
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
      const rows = team
        .map((c) => {
          const cls = classByName(c.class);
          const color = cls ? cls.color : "inherit";
          return `<div class="team-card-row">
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
    <label class="output-label">Possible Teams (${stackTeams.length})</label>
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
      <span>Class</span>
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

function setupGenerator() {
  $$('#view-generator select[data-slot]').forEach((sel) =>
    sel.addEventListener("change", renderOverview)
  );

  $("#view-generator").addEventListener("click", (e) => {
    const el = e.target.closest(".editable-inline");
    if (el) startInlineEdit(el);
  });

  $("#view-generator").addEventListener("change", async (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-action]');
    if (cb) await handleCharCheckboxToggle(cb);
  });

  $("#generate-btn").addEventListener("click", () => {
    const ids = $$('#view-generator select[data-slot]')
      .map((s) => s.value)
      .filter(Boolean);
    const unique = [...new Set(ids)];
    $("#generator-output").value = buildBoostString(unique);
    $("#discord-output").value = buildDiscordString(unique);
    renderTeamCards(unique);
  });

  const wireCopy = (btnSel, outputSel, statusSel) => {
    $(btnSel).addEventListener("click", async () => {
      const text = $(outputSel).value;
      if (!text) return;
      await navigator.clipboard.writeText(text);
      const status = $(statusSel);
      status.textContent = "copied";
      setTimeout(() => (status.textContent = ""), 1500);
    });
  };
  wireCopy("#copy-btn", "#generator-output", "#copy-status");
  wireCopy("#copy-discord-btn", "#discord-output", "#copy-discord-status");
}

function dungeonAlias(name) {
  if (!name) return "";
  const d = state.dungeons.find((x) => x.name === name);
  return d?.alias || name;
}

function keyDisplayHtml(c) {
  if (!c.current_key_dungeon) return '<span class="muted">no key</span>';
  const text = escapeHtml(
    `${dungeonAlias(c.current_key_dungeon)} ${c.current_key_level ?? ""}`.trim()
  );
  if (c.key_active === false) return `<span class="muted strike">${text}</span>`;
  return text;
}

const ROLE_EMOJI = { Tank: ":tank:", Heal: ":Healer:", Dps: ":DPS:" };

function formatCharacterParts(c) {
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
  const sets = team.map(getCharRoles);
  if (sets.some((s) => s.length === 0)) return false;
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
          if (t === 1 && h === 1 && d === 2) return true;
        }
  return false;
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
  const lines = ["Team Take", ""];

  const poolKeys = poolKeyCounts(pools.flat());
  const noStackList = [...poolKeys.values()]
    .map((e) => formatKeyCount(e.label, e.count))
    .join(" | ");
  lines.push(`No-Stack Keys - ${noStackList || "none"}`);

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
    lines.push("");
    lines.push("Possible Stacks:");
    for (const [armor, data] of stackEntries) {
      const counts = poolKeyCounts([...data.chars.values()]);
      const list = [...counts.values()]
        .map((e) => formatKeyCount(e.label, e.count))
        .join(" | ");
      lines.push(`${armor} x${data.max} - ${list || "none"}`);
    }
  }
  return lines.join("\n");
}

function buildBoostString(playerIds) {
  if (playerIds.length === 0) return "";
  if (playerIds.length === 4) {
    return buildTeamString(playerIds);
  }

  const headers = { 1: "SOLO", 2: "DUO", 3: "TRIO" };
  const playerCharParts = playerIds.map((pid) =>
    charsForPlayer(pid)
      .filter((c) => c.is_active)
      .map(formatCharacterParts)
  );
  const allParts = playerCharParts.flat();
  const colCount = 4;
  const widths = new Array(colCount).fill(0);
  for (const parts of allParts) {
    parts.forEach((p, i) => {
      widths[i] = Math.max(widths[i], p.length);
    });
  }
  const activeCols = widths
    .map((w, i) => (w > 0 ? i : -1))
    .filter((i) => i >= 0);

  const lines = [headers[playerIds.length]];
  playerCharParts.forEach((charParts, idx) => {
    if (idx > 0) lines.push("--------");
    for (const parts of charParts) {
      const segments = activeCols.map((i) => {
        const value = parts[i] || "";
        return i === 0 ? value : value.padEnd(widths[i]);
      });
      lines.push(segments.join(" | "));
    }
  });
  return lines.join("\n");
}

function buildDiscordString(playerIds) {
  return playerIds
    .map((pid) => byId(state.players, pid))
    .filter(Boolean)
    .map((p) => p.discord_name || p.name)
    .join(" ");
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
  try {
    await loadAll();
    renderAll();
  } catch (err) {
    console.error(err);
    alert(
      "Failed to load data from Supabase. Check that src/js/config.js has the correct URL and publishable key."
    );
  }
}

main();
