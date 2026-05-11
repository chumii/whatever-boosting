import { installGate } from "../src/js/gate.js";
import { PASSWORD } from "../src/js/config.js";
import * as db from "../src/js/supabase.js";

const state = { members: [] };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const el = (tag, cls = "", text = "") => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function openDialog(id, title, values = {}) {
  const dlg  = document.getElementById(id);
  const form = dlg.querySelector("form");
  dlg.querySelector("[data-title]").textContent = title;
  form.reset();
  form.dataset.editingId = values.id || "";
  for (const [k, v] of Object.entries(values)) {
    const field = form.elements[k];
    if (!field || v == null) continue;
    field.value = v;
  }
  dlg.showModal();
}

function setupDialogClosers() {
  $$(".dialog [data-close]").forEach((btn) =>
    btn.addEventListener("click", () => btn.closest("dialog").close())
  );
}

async function loadAll() {
  state.members = await db.listMembers();
}

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
      renderMembersTable();
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
    renderMembersTable();
  });
}

function setupRealtime() {
  db.createLiveChannel({
    onDbChange: async () => {
      await loadAll();
      renderMembersTable();
    },
    onReconnect: async () => {
      await loadAll();
      renderMembersTable();
    },
  });
}

async function init() {
  setupDialogClosers();
  setupMemberCrud();
  await loadAll();
  renderMembersTable();
  setupRealtime();
}

installGate({ password: PASSWORD, onUnlock: init });
