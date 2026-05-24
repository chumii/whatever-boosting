"use client";

import { useState, useEffect } from "react";
import styles from "./templates.module.css";

const DATA_TYPES = [
  "Casts", "Buffs", "Debuffs", "Deaths", "DamageDone", "DamageTaken",
  "Healing", "Interrupts", "Resources", "Summons",
];

const EMPTY_FORM = { name: "", data_type: "Casts", filter_expression: "", dashboard: false, view_type: "casts", target_scope: "all", subject: "source" };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  // form state
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [editId,    setEditId]    = useState(null); // null = new, uuid = editing
  const [formOpen,  setFormOpen]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState("");

  // delete confirm
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch("/api/wcl/templates/");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setTemplates(json);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(t) {
    setForm({ name: t.name, data_type: t.data_type, filter_expression: t.filter_expression, dashboard: t.dashboard ?? false, view_type: t.view_type ?? "casts", target_scope: t.target_scope ?? "all", subject: t.subject ?? "source" });
    setEditId(t.id);
    setFormError("");
    setFormOpen(true);
  }

  function cancel() {
    setFormOpen(false);
    setEditId(null);
    setFormError("");
  }

  async function save() {
    if (!form.name.trim()) {
      setFormError("Name ist ein Pflichtfeld.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const url    = editId ? `/api/wcl/templates/${editId}/` : "/api/wcl/templates/";
      const method = editId ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, filter_expression: form.filter_expression.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await load();
      cancel();
    } catch (e) { setFormError(e.message); }
    finally     { setSaving(false); }
  }

  async function del(id) {
    try {
      const res = await fetch(`/api/wcl/templates/${id}/`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setConfirmId(null);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Query Templates</h1>
        {!formOpen && (
          <button className={styles.btn} onClick={openNew}>+ Neues Template</button>
        )}
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {/* ── Form ── */}
      {formOpen && (
        <div className={styles.formPanel}>
          <div className={styles.formTitle}>{editId ? "Template bearbeiten" : "Neues Template"}</div>
          <div className={styles.formGrid}>
            <label className={styles.formLabel}>Name</label>
            <input
              className={styles.formInput}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="z.B. Defensive CDs"
              autoFocus
            />
            <label className={styles.formLabel}>Data Type</label>
            <select
              className={styles.formSelect}
              value={form.data_type}
              onChange={e => setForm(f => ({ ...f, data_type: e.target.value }))}
            >
              {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className={styles.formLabel}>Filter Expression</label>
            <textarea
              className={styles.formTextarea}
              value={form.filter_expression}
              onChange={e => setForm(f => ({ ...f, filter_expression: e.target.value }))}
              placeholder={'ability.id IN (12345, 67890) AND source.role != "tank"'}
              rows={6}
              spellCheck={false}
            />
            <label className={styles.formLabel}>View</label>
            <select
              className={styles.formSelect}
              value={form.view_type}
              onChange={e => setForm(f => ({ ...f, view_type: e.target.value }))}
            >
              <option value="casts">Casts (Cast Count)</option>
              <option value="amount">Amount (Damage/Healing + DPS/HPS)</option>
            </select>
            <label className={styles.formLabel}>Target</label>
            <select
              className={styles.formSelect}
              value={form.target_scope}
              onChange={e => setForm(f => ({ ...f, target_scope: e.target.value }))}
            >
              <option value="all">Alle</option>
              <option value="enemies">Feinde (inkl. Adds)</option>
              <option value="boss">Nur Boss</option>
            </select>
            <label className={styles.formLabel}>Subject</label>
            <select
              className={styles.formSelect}
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            >
              <option value="source">Source (Caster / Verursacher)</option>
              <option value="target">Target (Ziel / Opfer)</option>
            </select>
            <label className={styles.formLabel}>Dashboard</label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.dashboard}
                onChange={e => setForm(f => ({ ...f, dashboard: e.target.checked }))}
              />
              <span>Im Dashboard anzeigen</span>
            </label>
          </div>
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.formActions}>
            <button className={styles.btn} onClick={save} disabled={saving}>
              {saving ? "Speichert…" : "Speichern"}
            </button>
            <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={cancel}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <p className={styles.muted}>Lädt…</p>
      ) : templates.length === 0 ? (
        <p className={styles.muted}>Noch keine Templates. Erstelle das erste.</p>
      ) : (
        <div className={styles.list}>
          {templates.map(t => (
            <div key={t.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>
                  <span className={styles.rowNameText}>{t.name}</span>
                  {t.dashboard && <span className={styles.dashboardBadge}>Dashboard</span>}
                </span>
                <span className={styles.rowType}>{t.data_type}</span>
                <span className={styles.rowFilter}>{t.filter_expression}</span>
              </div>
              <div className={styles.rowActions}>
                {confirmId === t.id ? (
                  <>
                    <span className={styles.confirmText}>Löschen?</span>
                    <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => del(t.id)}>Ja</button>
                    <button className={styles.actionBtn} onClick={() => setConfirmId(null)}>Nein</button>
                  </>
                ) : (
                  <>
                    <button className={styles.actionBtn} onClick={() => openEdit(t)}>Bearbeiten</button>
                    <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setConfirmId(t.id)}>Löschen</button>
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
