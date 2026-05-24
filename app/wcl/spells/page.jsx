"use client";

import { useState, useEffect } from "react";
import styles from "../templates/templates.module.css";

export default function SpellsPage() {
  const [spells,    setSpells]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  const [editingId,  setEditingId]  = useState(null);
  const [spellId,    setSpellId]    = useState("");
  const [name,       setName]       = useState("");
  const [boss,       setBoss]       = useState("");
  const [icon,       setIcon]       = useState("");
  const [fetching,   setFetching]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState("");
  const [formOpen,   setFormOpen]   = useState(false);

  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch("/api/wcl/spells/");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSpells(json);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }

  async function fetchName(id) {
    const sid = (id ?? spellId).trim();
    if (!sid || !/^\d+$/.test(sid)) return;
    setFetching(true);
    setName(""); setIcon("");
    try {
      const res  = await fetch(`/api/wcl/ability/?id=${sid}`);
      const json = await res.json();
      if (res.ok && json.name) { setName(json.name); setIcon(json.icon ?? ""); }
      else setFormError("Spell nicht gefunden.");
    } catch { setFormError("Fehler beim Laden des Spell-Namens."); }
    finally   { setFetching(false); }
  }

  function openNew() {
    setEditingId(null);
    setSpellId(""); setName(""); setBoss(""); setIcon(""); setFormError("");
    setFormOpen(true);
  }

  function openEdit(s) {
    setEditingId(s.id);
    setSpellId(String(s.spell_id));
    setName(s.name);
    setBoss(s.boss ?? "");
    setIcon(s.icon ?? "");
    setFormError("");
    setFormOpen(true);
    if (!s.icon) fetchName(String(s.spell_id));
  }

  function cancel() {
    setFormOpen(false);
    setEditingId(null);
    setSpellId(""); setName(""); setBoss(""); setIcon(""); setFormError("");
  }

  async function save() {
    if (!name.trim()) { setFormError("Name ist erforderlich."); return; }
    if (!editingId && (!spellId.trim())) { setFormError("Spell ID ist erforderlich."); return; }
    setSaving(true); setFormError("");
    try {
      let res;
      if (editingId) {
        res = await fetch(`/api/wcl/spells/${editingId}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spell_id: parseInt(spellId.trim(), 10),
            name:     name.trim(),
            boss:     boss.trim(),
            icon:     icon.trim(),
          }),
        });
      } else {
        res = await fetch("/api/wcl/spells/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spell_id: parseInt(spellId.trim(), 10),
            name:     name.trim(),
            boss:     boss.trim(),
            icon:     icon.trim(),
          }),
        });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await load();
      cancel();
    } catch (e) { setFormError(e.message); }
    finally     { setSaving(false); }
  }

  async function del(id) {
    try {
      const res = await fetch(`/api/wcl/spells/${id}/`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setConfirmId(null);
      setSpells(prev => prev.filter(s => s.id !== id));
    } catch (e) { setError(e.message); }
  }

  const isEditing = !!editingId;

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Spell Filter</h1>
        {!formOpen && (
          <button className={styles.btn} onClick={openNew}>+ Neuer Spell</button>
        )}
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {formOpen && (
        <div className={styles.formPanel}>
          <div className={styles.formTitle}>{isEditing ? "Spell bearbeiten" : "Neuer Spell"}</div>
          <div className={styles.formGrid}>
            <label className={styles.formLabel}>Spell ID</label>
            <input
              className={styles.formInput}
              type="text"
              inputMode="numeric"
              value={spellId}
              onChange={e => { setSpellId(e.target.value.replace(/\D/g, "")); setName(""); setIcon(""); setFormError(""); }}
              onBlur={() => fetchName()}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); fetchName(); } }}
              placeholder="z.B. 440022"
              autoFocus={!isEditing}
            />
            <label className={styles.formLabel}>Name</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className={styles.formInput}
                style={{ flex: 1 }}
                value={fetching ? "Lädt…" : name}
                onChange={e => setName(e.target.value)}
                placeholder="wird automatisch geladen"
                autoFocus={isEditing}
              />
              {isEditing && (
                <button className={styles.btn} type="button" onClick={() => fetchName(spellId)} disabled={fetching}>
                  ↻
                </button>
              )}
            </div>
            <label className={styles.formLabel}>Boss</label>
            <input
              className={styles.formInput}
              value={boss}
              onChange={e => setBoss(e.target.value)}
              placeholder="z.B. Gallywix (optional)"
              onKeyDown={e => { if (e.key === "Enter") save(); }}
            />
          </div>
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.formActions}>
            <button className={styles.btn} onClick={save} disabled={saving || fetching}>
              {saving ? "Speichert…" : "Speichern"}
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={cancel}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className={styles.muted}>Lädt…</p>
      ) : spells.length === 0 ? (
        <p className={styles.muted}>Noch keine Spells gespeichert.</p>
      ) : (
        <div className={styles.list}>
          {spells.map(s => (
            <div key={s.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>
                  <a
                    href={`https://www.wowhead.com/spell=${s.spell_id}`}
                    target="_blank" rel="noreferrer"
                    className={styles.rowSpellLink}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {s.icon && (
                      <img
                        src={`https://wow.zamimg.com/images/wow/icons/small/${s.icon}`}
                        width={16} height={16} alt=""
                        className={styles.rowIcon}
                      />
                    )}
                    {s.name}
                  </a>
                </span>
                <span className={styles.rowType}>{s.spell_id}</span>
                <span className={styles.rowFilter}>{s.boss ?? ""}</span>
              </div>
              <div className={styles.rowActions}>
                {confirmId === s.id ? (
                  <>
                    <span className={styles.confirmText}>Löschen?</span>
                    <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => del(s.id)}>Ja</button>
                    <button className={styles.actionBtn} onClick={() => setConfirmId(null)}>Nein</button>
                  </>
                ) : (
                  <>
                    <button className={styles.actionBtn} onClick={() => { setConfirmId(null); openEdit(s); }}>Bearbeiten</button>
                    <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setConfirmId(s.id)}>Löschen</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
