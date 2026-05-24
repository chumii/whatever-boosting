"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import styles from "./wcl.module.css";

const CLASS_COLORS = {
  DeathKnight: "#C41E3A", DemonHunter: "#A330C9", Druid: "#FF7C0A",
  Evoker: "#33937F", Hunter: "#AAD372", Mage: "#3FC7EB", Monk: "#00FF98",
  Paladin: "#F48CBA", Priest: "#FFFFFF", Rogue: "#FFF468", Shaman: "#0070DD",
  Warlock: "#8788EE", Warrior: "#C69B3A",
};

// ── helpers ──────────────────────────────────────────────────

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatTime(reportStartMs, fightStartMs) {
  return new Date(reportStartMs + fightStartMs).toLocaleTimeString("de-DE", {
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(ms) {
  return new Date(ms).toLocaleDateString("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

// Accepts a raw 16-char code or any WCL report URL; returns the code or null.
function parseReportCode(raw) {
  const s = raw.trim();
  const urlMatch = s.match(/\/reports\/([A-Za-z0-9]{16})/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]{16}$/.test(s)) return s;
  return null;
}

function rateLabel(dataType) {
  if (dataType === "Healing")     return "HPS";
  if (dataType === "DamageTaken") return "DTPS";
  return "DPS";
}

function formatAmount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "b";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "m";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "k";
  return String(Math.round(n));
}

function buildEventsRequest(tmpl, fights, code, spellFE) {
  const baseFE   = tmpl.filter_expression?.trim() || "";
  const targetFE = tmpl.target_scope === "enemies" ? 'target.disposition = "enemy"' : "";
  const filterExpression = [baseFE, targetFE, spellFE || ""].filter(Boolean).join(" AND ") || null;
  return {
    code,
    fights,
    dataType: tmpl.data_type,
    ...(filterExpression ? { filterExpression } : {}),
    ...(tmpl.target_scope === "boss" ? { targetClass: "Boss" } : {}),
  };
}

// bossPercentage: 0–100 (remaining boss HP; 0 = kill)
function pullColor(bossPercentage, kill) {
  if (kill) return "rgb(34,197,94)";
  const pct  = Math.max(0, Math.min(100, bossPercentage ?? 100));
  const prog  = (100 - pct) / 100;
  const r = Math.round(220 - 180 * prog);
  const g = Math.round(50  + 140 * prog);
  const b = Math.round(50  +  10 * prog);
  return `rgb(${r},${g},${b})`;
}

function groupFightsByBoss(fights) {
  const map = new Map();
  for (const f of fights) {
    if (!map.has(f.encounterID)) {
      map.set(f.encounterID, { encounterID: f.encounterID, name: f.name, pulls: [] });
    }
    map.get(f.encounterID).pulls.push(f);
  }
  return [...map.values()];
}

function Checkbox({ checked, indeterminate, onChange }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate ?? false; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
}

// ── main component ───────────────────────────────────────────

export default function WclPage() {
  const [code,           setCode]           = useState("");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");
  const [report,         setReport]         = useState(null);
  const [selected,       setSelected]       = useState(new Set());
  const [templates,      setTemplates]      = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  // results: Array<{ id, templateName, status: "loading"|"done"|"error", data?, error? }>
  const [results,        setResults]        = useState([]);
  const [spellFilter,    setSpellFilter]    = useState("");
  const [spells,         setSpells]         = useState([]);
  const [selectedSpells, setSelectedSpells] = useState(new Set());
  const [deathCutoff,      setDeathCutoff]      = useState(0);
  const [dashboardEditMode, setDashboardEditMode] = useState(false);
  const [editSlots,         setEditSlots]         = useState([]); // Array<templateId|null>
  const [savingDashboard,   setSavingDashboard]   = useState(false);

  const isLoading          = results.some(r => r.status === "loading");
  const dashboardTemplates = useMemo(() =>
    templates.filter(t => t.dashboard_position != null)
             .sort((a, b) => a.dashboard_position - b.dashboard_position),
    [templates]
  );
  const actorMap    = useMemo(
    () => report ? new Map(report.masterData.actors.map(a => [a.id, a])) : new Map(),
    [report]
  );
  // Maps pet actor ID → owning player actor ID
  const petOwnerMap = useMemo(
    () => report
      ? new Map(report.masterData.actors.filter(a => a.petOwner != null).map(a => [a.id, a.petOwner]))
      : new Map(),
    [report]
  );

  useEffect(() => {
    fetch("/api/wcl/templates/")
      .then(r => r.json())
      .then(rows => {
        if (Array.isArray(rows) && rows.length) {
          setTemplates(rows);
          setActiveTemplate(rows[0].id);
        }
      })
      .catch(() => {});
    fetch("/api/wcl/spells/")
      .then(r => r.json())
      .then(rows => { if (Array.isArray(rows)) setSpells(rows); })
      .catch(() => {});
  }, []);

  function buildSpellFilter() {
    const ids = new Set(selectedSpells);
    const manual = spellFilter.trim();
    if (/^\d+$/.test(manual)) ids.add(manual);
    if (!ids.size) return null;
    if (ids.size === 1) return `ability.id = ${[...ids][0]}`;
    return `ability.id IN (${[...ids].join(", ")})`;
  }

  async function getClippedFights(fights) {
    if (!deathCutoff) return fights;
    const res = await fetch("/api/wcl/events/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: parseReportCode(code), fights, dataType: "Deaths" }),
    });
    if (!res.ok) return fights;
    const json = await res.json();
    return fights.map(f => {
      const deaths = (json.results.find(r => r.id === f.id)?.events ?? [])
        .filter(ev => ev.type === "death")
        .sort((a, b) => a.timestamp - b.timestamp);
      if (deaths.length < deathCutoff) return f;
      return { ...f, endTime: Math.min(f.endTime, deaths[deathCutoff - 1].timestamp) };
    });
  }

  function openDashboardEdit() {
    setEditSlots(dashboardTemplates.length > 0 ? dashboardTemplates.map(t => t.id) : [null]);
    setDashboardEditMode(true);
  }

  async function saveDashboard() {
    setSavingDashboard(true);
    try {
      const newPos = new Map(
        editSlots.map((id, i) => [id, i]).filter(([id]) => id != null)
      );
      await Promise.all(templates.map(t => {
        const np = newPos.has(t.id) ? newPos.get(t.id) : null;
        const op = t.dashboard_position ?? null;
        if (np === op) return Promise.resolve();
        return fetch(`/api/wcl/templates/${t.id}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dashboard_position: np }),
        });
      }));
      const rows = await (await fetch("/api/wcl/templates/")).json();
      if (Array.isArray(rows)) setTemplates(rows);
      setDashboardEditMode(false);
    } finally {
      setSavingDashboard(false);
    }
  }

  async function fetchEvents(tmpl, fights) {
    const effectiveFights = await getClippedFights(fights);
    const res = await fetch("/api/wcl/events/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEventsRequest(tmpl, effectiveFights, parseReportCode(code), buildSpellFilter())),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `Fehler ${res.status}`);
    return json;
  }

  async function runAnalysis() {
    if (!selected.size || !report) return;
    const tmpl = templates.find(t => t.id === activeTemplate);
    if (!tmpl) return;

    const fights = report.fights
      .filter(f => selected.has(f.id))
      .map(f => ({ id: f.id, startTime: f.startTime, endTime: f.endTime }));

    const viewType = tmpl.view_type ?? "casts";
    const dataType = tmpl.data_type;
    const subject  = tmpl.subject  ?? "source";
    setResults([{ id: tmpl.id, templateName: tmpl.name, viewType, dataType, subject, status: "loading" }]);
    try {
      const data = await fetchEvents(tmpl, fights);
      setResults([{ id: tmpl.id, templateName: tmpl.name, viewType, dataType, subject, status: "done", data }]);
    } catch (e) {
      setResults([{ id: tmpl.id, templateName: tmpl.name, viewType, dataType, subject, status: "error", error: e.message }]);
    }
  }

  function runDashboard() {
    if (!selected.size || !report || !dashboardTemplates.length) return;

    const fights = report.fights
      .filter(f => selected.has(f.id))
      .map(f => ({ id: f.id, startTime: f.startTime, endTime: f.endTime }));

    // Show all cards as loading immediately, then resolve progressively
    setResults(dashboardTemplates.map(t => ({ id: t.id, templateName: t.name, viewType: t.view_type ?? "casts", dataType: t.data_type, subject: t.subject ?? "source", status: "loading" })));

    dashboardTemplates.forEach(t => {
      fetchEvents(t, fights)
        .then(data => setResults(prev => prev.map(r => r.id === t.id ? { ...r, status: "done",  data }           : r)))
        .catch(e   => setResults(prev => prev.map(r => r.id === t.id ? { ...r, status: "error", error: e.message } : r)));
    });
  }

  async function fetchReport() {
    const parsed = parseReportCode(code);
    if (!parsed) { setError("Ungültige Report-ID oder URL."); return; }
    setLoading(true); setError(""); setReport(null); setSelected(new Set()); setResults([]); setSelectedSpells(new Set());
    try {
      const res  = await fetch(`/api/wcl/report?code=${encodeURIComponent(parsed)}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? `Fehler ${res.status}`); return; }
      setReport(json.reportData.report);
    } catch { setError("Netzwerkfehler – bitte erneut versuchen."); }
    finally  { setLoading(false); }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData("text");
    const parsed = parseReportCode(pasted);
    if (parsed && parsed !== pasted.trim()) {
      e.preventDefault();
      setCode(parsed);
    }
  }

  function toggleFight(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleBoss(ids) {
    setSelected(prev => {
      const n = new Set(prev);
      const allOn = ids.every(id => prev.has(id));
      ids.forEach(id => allOn ? n.delete(id) : n.add(id));
      return n;
    });
  }
  function toggleAll(allIds) {
    setSelected(prev => prev.size === allIds.length ? new Set() : new Set(allIds));
  }

  const bossGroups = report ? groupFightsByBoss(report.fights) : [];
  const allIds     = report ? report.fights.map(f => f.id) : [];
  const allChecked = allIds.length > 0 && selected.size === allIds.length;
  const allIndet   = selected.size > 0 && !allChecked;

  return (
    <>
      {/* ── Input ── */}
      <div className={styles.inputRow}>
        <input
          className={styles.codeInput}
          type="text"
          placeholder="Report-ID (16 Zeichen)"
          value={code}
          onChange={e => setCode(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={e => e.key === "Enter" && fetchReport()}
          spellCheck={false} autoCorrect="off" autoCapitalize="off"
        />
        <button className={styles.submitBtn} onClick={fetchReport} disabled={loading || !code.trim()}>
          {loading ? "Lädt…" : "Abrufen"}
        </button>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {report && (
        <>
          {/* ── Report header ── */}
          <div className={styles.reportHeader}>
            <div>
              <div className={styles.reportTitle}>{report.title}</div>
              <div className={styles.reportMeta}>
                {report.zone?.name} &middot; {formatDate(report.startTime)}
              </div>
            </div>
            <label className={styles.selectAllLabel}>
              <Checkbox checked={allChecked} indeterminate={allIndet} onChange={() => toggleAll(allIds)} />
              Alle ({allIds.length})
            </label>
          </div>

          {/* ── Boss groups ── */}
          <div className={styles.bossGroups}>
            {bossGroups.map(boss => {
              const bossIds   = boss.pulls.map(p => p.id);
              const bossAll   = bossIds.every(id => selected.has(id));
              const bossIndet = !bossAll && bossIds.some(id => selected.has(id));
              const kills     = boss.pulls.filter(p => p.kill);
              const lastPull  = boss.pulls[boss.pulls.length - 1];

              return (
                <div key={boss.encounterID} className={styles.bossGroup}>
                  <div className={styles.bossHeader}>
                    <label className={styles.bossCheckLabel}>
                      <Checkbox checked={bossAll} indeterminate={bossIndet} onChange={() => toggleBoss(bossIds)} />
                      <span className={styles.bossName}>{boss.name}</span>
                    </label>
                    <span className={styles.bossSummary}>
                      {kills.length > 0
                        ? <span className={styles.killText}>{kills.length} Kill{kills.length > 1 ? "s" : ""}</span>
                        : <span className={styles.wipeText}>All Wipes ({boss.pulls.length})</span>
                      }
                      &ensp;·&ensp;
                      <span className={styles.lastPullText}>
                        Last Pull –{" "}
                        {lastPull.kill ? "Kill" : `Wipe ${(lastPull.bossPercentage ?? 0).toFixed(1)}%`}
                        {" "}({formatDuration(lastPull.endTime - lastPull.startTime)})
                        &ensp;
                        <span className={styles.pullTime}>{formatTime(report.startTime, lastPull.startTime)}</span>
                      </span>
                    </span>
                  </div>
                  <div className={styles.pullGrid}>
                    {boss.pulls.map((pull, idx) => {
                      const dur   = pull.endTime - pull.startTime;
                      const pct   = pull.kill ? null : (pull.bossPercentage ?? 0);
                      const color = pullColor(pull.bossPercentage, pull.kill);
                      const isSel = selected.has(pull.id);
                      return (
                        <div
                          key={pull.id}
                          className={`${styles.pullCard} ${isSel ? styles.pullCardSelected : ""}`}
                          onClick={() => toggleFight(pull.id)}
                        >
                          <div className={styles.pullPct} style={{ background: color }}>
                            {pull.kill ? "Kill" : `${pct?.toFixed(0)}%`}
                          </div>
                          <div className={styles.pullInfo}>
                            <div className={styles.pullLabel}>
                              {idx + 1} ({formatDuration(dur)})
                            </div>
                            <div className={styles.pullTime}>
                              {formatTime(report.startTime, pull.startTime)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Action bar ── */}
          <div className={styles.actionBar}>
            <span className={`${styles.selectionCount} ${!selected.size ? styles.muted : ""}`}>
              {selected.size > 0
                ? `${selected.size} ${selected.size === 1 ? "Pull" : "Pulls"} ausgewählt`
                : "Keine Pulls ausgewählt"}
            </span>
            {templates.length === 0 ? (
              <a className={styles.noTemplatesHint} href="/wcl/templates/">
                Kein Template – jetzt erstellen →
              </a>
            ) : (
              <select
                className={styles.analysisSelect}
                value={activeTemplate ?? ""}
                onChange={e => { setActiveTemplate(e.target.value); setResults([]); }}
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            <input
              className={styles.spellInput}
              type="text"
              inputMode="numeric"
              placeholder="Spell ID (optional)"
              value={spellFilter}
              onChange={e => setSpellFilter(e.target.value.replace(/\D/g, ""))}
            />
            <span className={styles.cutoffLabel}>nach</span>
            <input
              className={styles.cutoffInput}
              type="number"
              min={0}
              max={99}
              placeholder="∞"
              value={deathCutoff || ""}
              onChange={e => setDeathCutoff(Math.max(0, parseInt(e.target.value) || 0))}
            />
            <span className={styles.cutoffLabel}>Toden</span>
            <button
              className={styles.analyseBtn}
              onClick={runAnalysis}
              disabled={isLoading || !selected.size || templates.length === 0}
            >
              {isLoading && results.length === 1 ? "Lädt…" : "Analyse starten →"}
            </button>
            <button
              className={styles.dashboardBtn}
              onClick={runDashboard}
              disabled={isLoading || !selected.size || dashboardTemplates.length === 0}
              title={dashboardTemplates.length === 0 ? "Kein Dashboard konfiguriert" : undefined}
            >
              Dashboard ({dashboardTemplates.length})
            </button>
            <button
              className={styles.dashboardEditBtn}
              onClick={openDashboardEdit}
            >
              Layout
            </button>
          </div>

          {/* ── Spell chips ── */}
          {spells.length > 0 && (
            <div className={styles.spellPanel}>
              {spells.map(s => {
                const key      = String(s.spell_id);
                const isActive = selectedSpells.has(key);
                return (
                  <button
                    key={s.id}
                    className={`${styles.spellChip} ${isActive ? styles.spellChipActive : ""}`}
                    onClick={() => setSelectedSpells(prev => {
                      const n = new Set(prev);
                      n.has(key) ? n.delete(key) : n.add(key);
                      return n;
                    })}
                  >
                    {s.name}
                    {s.boss && <span className={styles.spellChipBoss}>{s.boss}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Dashboard Edit ── */}
          {dashboardEditMode && (
            <div className={styles.dashboardEditPanel}>
              <div className={styles.dashboardEditHeader}>
                <span className={styles.dashboardEditTitle}>Dashboard Layout</span>
                <div className={styles.dashboardEditActions}>
                  <button className={styles.analyseBtn} onClick={saveDashboard} disabled={savingDashboard}>
                    {savingDashboard ? "Speichert…" : "Speichern"}
                  </button>
                  <button className={`${styles.analyseBtn} ${styles.analyseBtnSecondary}`} onClick={() => setDashboardEditMode(false)}>
                    Abbrechen
                  </button>
                </div>
              </div>
              <div className={styles.dashboardEditGrid}>
                {editSlots.map((tid, idx) => (
                  <div key={idx} className={styles.dashboardSlotCard}>
                    <span className={styles.dashboardSlotNum}>{idx + 1}</span>
                    <select
                      className={styles.dashboardSlotSelect}
                      value={tid ?? ""}
                      onChange={e => setEditSlots(prev => {
                        const n = [...prev];
                        n[idx] = e.target.value || null;
                        return n;
                      })}
                    >
                      <option value="">— Leer —</option>
                      {templates.map(t => (
                        <option
                          key={t.id}
                          value={t.id}
                          disabled={editSlots.includes(t.id) && editSlots.indexOf(t.id) !== idx}
                        >
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className={styles.dashboardSlotRemove}
                      onClick={() => setEditSlots(prev => prev.filter((_, i) => i !== idx))}
                      title="Slot entfernen"
                    >×</button>
                  </div>
                ))}
                <button
                  className={styles.dashboardSlotAdd}
                  onClick={() => setEditSlots(prev => [...prev, null])}
                >
                  + Slot hinzufügen
                </button>
              </div>
            </div>
          )}

          {/* ── Results ── */}
          {results.length > 0 && (
            <div className={results.length > 1 ? styles.resultsGrid : styles.resultsSingle}>
              {results.map(r => (
                <DashboardCard key={r.id} result={r} actorMap={actorMap} petOwnerMap={petOwnerMap} rowLimit={results.length > 1 ? 30 : Infinity} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── DashboardCard ─────────────────────────────────────────────

function DashboardCard({ result, actorMap, petOwnerMap, rowLimit }) {
  useEffect(() => {
    if (result.status === "done" && typeof window !== "undefined" && window.$WowheadPower) {
      window.$WowheadPower.refreshLinks();
    }
  }, [result.status]);

  return (
    <div className={styles.dashboardCard}>
      <div className={styles.dashboardCardHeader}>
        <span className={styles.dashboardCardTitle}>{result.templateName}</span>
        {result.status === "loading" && <span className={styles.muted}>Lädt…</span>}
      </div>
      {result.status === "loading" && (
        <p className={styles.spinner}>Daten werden geladen…</p>
      )}
      {result.status === "error" && (
        <p className={styles.errorMsg}>{result.error}</p>
      )}
      {result.status === "done" && result.viewType === "amount" ? (
        <AmountTable
          result={result.data}
          actorMap={actorMap}
          petOwnerMap={petOwnerMap}
          abilityNames={result.data.abilityNames ?? {}}
          dataType={result.dataType}
          subject={result.subject ?? "source"}
          rowLimit={rowLimit}
        />
      ) : result.status === "done" ? (
        <CastsTable
          result={result.data}
          actorMap={actorMap}
          petOwnerMap={petOwnerMap}
          abilityNames={result.data.abilityNames ?? {}}
          dataType={result.dataType}
          subject={result.subject ?? "source"}
          rowLimit={rowLimit}
        />
      ) : null}
    </div>
  );
}

// ── CastsTable ───────────────────────────────────────────────

function CastsTable({ result, actorMap, petOwnerMap, abilityNames, dataType, subject, rowLimit = Infinity }) {
  const [hovered,  setHovered]  = useState(null);
  const [pinned,   setPinned]   = useState(null);
  const [expanded, setExpanded] = useState(false);
  const tableRef = useRef(null);

  useEffect(() => {
    const onKey   = e => { if (e.key === "Escape") setPinned(null); };
    const onClick = e => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        setPinned(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click",   onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click",   onClick);
    };
  }, []);

  const useTarget = subject === "target";

  const { players, grandTotal } = useMemo(() => {
    const map = new Map();
    for (const fight of result.results) {
      for (const ev of fight.events) {
        const actorId = useTarget ? ev.targetID : ev.sourceID;
        if (!actorId) continue;
        if (actorMap.get(actorId)?.type !== "Player") continue;
        if (!map.has(actorId)) map.set(actorId, { id: actorId, total: 0, byAbility: new Map() });
        const p = map.get(actorId);
        p.total++;
        const abilityId = ev.killingAbilityGameID ?? ev.abilityGameID;
        p.byAbility.set(abilityId, (p.byAbility.get(abilityId) ?? 0) + 1);
      }
    }
    const grandTotal = [...map.values()].reduce((s, p) => s + p.total, 0);
    const maxTotal   = Math.max(...[...map.values()].map(p => p.total), 1);
    const players = [...map.values()]
      .map(p => ({
        ...p,
        barPct:   (p.total / maxTotal) * 100,
        sharePct: grandTotal > 0 ? (p.total / grandTotal) * 100 : 0,
        abilities: [...p.byAbility.entries()]
          .map(([id, count]) => ({ id, count, pct: (count / p.total) * 100 }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);
    return { players, grandTotal };
  }, [result]);

  if (!players.length) return <p className={styles.emptyMsg}>Keine Events in den ausgewählten Pulls.</p>;

  const visiblePlayers = expanded ? players : players.slice(0, rowLimit);
  const hiddenCount    = players.length - visiblePlayers.length;

  return (
    <div className={styles.castWrap} ref={tableRef}>
      <table className={styles.castTable}>
        <thead>
          <tr>
            <th className={styles.castThRank}>#</th>
            <th className={styles.castThName}>Name</th>
            <th className={styles.castThAmount}>Amount</th>
            <th className={styles.castThCount}>Casts</th>
          </tr>
        </thead>
        <tbody>
          {visiblePlayers.map((p, idx) => {
            const actor    = actorMap.get(p.id);
            const color    = CLASS_COLORS[actor?.subType] ?? "#aaa";
            const isPinned = pinned === p.id;
            const showTip  = isPinned || (hovered === p.id && !pinned);
            return (
              <tr
                key={p.id}
                className={isPinned ? styles.castRowPinned : undefined}
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setPinned(prev => prev === p.id ? null : p.id)}
              >
                <td className={styles.castTdRank}>{idx + 1}</td>
                <td className={styles.castTdName}>
                  <div className={styles.castNameCell}>
                    {actor?.subType && (
                      <img
                        src={`https://wow.zamimg.com/images/wow/icons/small/classicon_${actor.subType.toLowerCase()}.jpg`}
                        width={14} height={14} alt=""
                        className={styles.castSpecIcon}
                      />
                    )}
                    <span className={styles.castPlayerName} style={{ color }}>
                      {actor?.name ?? `#${p.id}`}
                    </span>
                  </div>
                  {showTip && (
                    <CastTooltip abilities={p.abilities} abilityNames={abilityNames} pinned={isPinned} />
                  )}
                </td>
                <td className={styles.castTdAmount}>
                  <span className={styles.castPct}>{p.sharePct.toFixed(2)}%</span>
                  <div className={styles.castBarTrack}>
                    <div className={styles.castBarFill} style={{ width: `${p.barPct}%`, background: color + "99" }} />
                  </div>
                </td>
                <td className={styles.castTdCount}>{p.total}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {hiddenCount > 0 && (
            <tr className={styles.expandRow} onClick={() => setExpanded(e => !e)}>
              <td colSpan={4}>
                {expanded ? "Weniger anzeigen" : `+ ${hiddenCount} weitere anzeigen`}
              </td>
            </tr>
          )}
          <tr>
            <td className={styles.castTdRank} />
            <td className={styles.castTdName}>Total</td>
            <td className={styles.castTdAmount}><span className={styles.castPct}>100%</span></td>
            <td className={styles.castTdCount}>{grandTotal}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── CastTooltip ──────────────────────────────────────────────

function CastTooltip({ abilities, abilityNames, pinned }) {
  const maxCount = abilities[0]?.count ?? 1;
  return (
    <div className={`${styles.castTooltip} ${pinned ? styles.castTooltipPinned : ""}`}>
      <div className={styles.castTooltipHead}>Ability</div>
      <table className={styles.castTooltipTable}>
        <tbody>
          {abilities.map((ab, idx) => {
            const info = abilityNames[ab.id];
            return (
              <tr key={ab.id}>
                <td className={styles.castTooltipRank}>{idx + 1}</td>
                <td className={styles.castTooltipName}>
                  {info?.icon && (
                    <img
                      src={`https://wow.zamimg.com/images/wow/icons/small/${info.icon}`}
                      width={13} height={13} alt=""
                      className={styles.castTooltipIcon}
                    />
                  )}
                  <a
                    href={`https://www.wowhead.com/spell=${ab.id}`}
                    target="_blank" rel="noreferrer"
                    className={styles.castTooltipLink}
                    onClick={e => e.stopPropagation()}
                  >
                    {info?.name ?? `#${ab.id}`}
                  </a>
                </td>
                <td className={styles.castTooltipPct}>{ab.pct.toFixed(1)}%</td>
                <td className={styles.castTooltipBar}>
                  <div className={styles.castTooltipBarTrack}>
                    <div className={styles.castTooltipBarFill} style={{ width: `${(ab.count / maxCount) * 100}%` }} />
                  </div>
                </td>
                <td className={styles.castTooltipCount}>{ab.count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── AmountTable ──────────────────────────────────────────────

function AmountTable({ result, actorMap, petOwnerMap, abilityNames, dataType, subject, rowLimit = Infinity }) {
  const [hovered,  setHovered]  = useState(null);
  const [pinned,   setPinned]   = useState(null);
  const [expanded, setExpanded] = useState(false);
  const tableRef = useRef(null);

  useEffect(() => {
    const onKey   = e => { if (e.key === "Escape") setPinned(null); };
    const onClick = e => {
      if (tableRef.current && !tableRef.current.contains(e.target)) setPinned(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click",   onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click",   onClick);
    };
  }, []);

  const { players, grandTotal, grandHits, totalDurationSec } = useMemo(() => {
    const map = new Map();
    let totalDurationMs = 0;
    for (const fight of result.results) {
      totalDurationMs += (fight.endTime ?? 0) - (fight.startTime ?? 0);
      for (const ev of fight.events) {
        if (ev.amount == null) continue;
        const effective = ev.amount + (ev.absorbed ?? 0);

        if (subject === "target") {
          // Player is the receiver (DamageTaken, Deaths etc.)
          if (!ev.targetID || actorMap.get(ev.targetID)?.type !== "Player") continue;
          if (!map.has(ev.targetID)) map.set(ev.targetID, { id: ev.targetID, total: 0, hits: 0, byAbility: new Map() });
          const p = map.get(ev.targetID);
          p.total += effective;
          p.hits++;
          p.byAbility.set(ev.abilityGameID, (p.byAbility.get(ev.abilityGameID) ?? 0) + effective);
        } else {
          // Source is the player dealing/healing damage; attribute pet damage to owner
          if (!ev.sourceID) continue;
          const ownerId = petOwnerMap.get(ev.sourceID) ?? ev.sourceID;
          if (actorMap.get(ownerId)?.type !== "Player") continue;
          if (!map.has(ownerId)) map.set(ownerId, { id: ownerId, total: 0, hits: 0, byAbility: new Map() });
          const p = map.get(ownerId);
          p.total += effective;
          p.hits++;
          p.byAbility.set(ev.abilityGameID, (p.byAbility.get(ev.abilityGameID) ?? 0) + effective);
        }
      }
    }
    const totalDurationSec = totalDurationMs / 1000;
    const grandTotal = [...map.values()].reduce((s, p) => s + p.total, 0);
    const grandHits  = [...map.values()].reduce((s, p) => s + p.hits,  0);
    const maxTotal   = Math.max(...[...map.values()].map(p => p.total), 1);
    const players = [...map.values()]
      .map(p => ({
        ...p,
        barPct:   (p.total / maxTotal) * 100,
        sharePct: grandTotal > 0 ? (p.total / grandTotal) * 100 : 0,
        rate:     totalDurationSec > 0 ? p.total / totalDurationSec : 0,
        avg:      p.hits > 0 ? p.total / p.hits : 0,
        abilities: [...p.byAbility.entries()]
          .map(([id, amount]) => ({ id, amount, pct: (amount / p.total) * 100 }))
          .sort((a, b) => b.amount - a.amount),
      }))
      .sort((a, b) => b.total - a.total);
    return { players, grandTotal, grandHits, totalDurationSec };
  }, [result]);

  if (!players.length) return <p className={styles.emptyMsg}>Keine Events in den ausgewählten Pulls.</p>;

  const visiblePlayers = expanded ? players : players.slice(0, rowLimit);
  const hiddenCount    = players.length - visiblePlayers.length;
  const label          = rateLabel(dataType);
  const grandRate      = totalDurationSec > 0 ? grandTotal / totalDurationSec : 0;
  const grandAvg       = grandHits > 0 ? grandTotal / grandHits : 0;

  return (
    <div className={styles.castWrap} ref={tableRef}>
      <table className={styles.castTable}>
        <thead>
          <tr>
            <th className={styles.castThRank}>#</th>
            <th className={styles.castThName}>Name</th>
            <th className={styles.castThAmount}>Amount</th>
            <th className={styles.castThCount}>{label}</th>
            <th className={styles.castThCount}>Hits</th>
            <th className={styles.castThCount}>Avg</th>
          </tr>
        </thead>
        <tbody>
          {visiblePlayers.map((p, idx) => {
            const actor    = actorMap.get(p.id);
            const color    = CLASS_COLORS[actor?.subType] ?? "#aaa";
            const isPinned = pinned === p.id;
            const showTip  = isPinned || (hovered === p.id && !pinned);
            return (
              <tr
                key={p.id}
                className={isPinned ? styles.castRowPinned : undefined}
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setPinned(prev => prev === p.id ? null : p.id)}
              >
                <td className={styles.castTdRank}>{idx + 1}</td>
                <td className={styles.castTdName}>
                  <div className={styles.castNameCell}>
                    {actor?.subType && (
                      <img
                        src={`https://wow.zamimg.com/images/wow/icons/small/classicon_${actor.subType.toLowerCase()}.jpg`}
                        width={14} height={14} alt=""
                        className={styles.castSpecIcon}
                      />
                    )}
                    <span className={styles.castPlayerName} style={{ color }}>
                      {actor?.name ?? `#${p.id}`}
                    </span>
                  </div>
                  {showTip && (
                    <AmountTooltip abilities={p.abilities} abilityNames={abilityNames} pinned={isPinned} />
                  )}
                </td>
                <td className={styles.castTdAmount}>
                  <span className={styles.castPct}>{p.sharePct.toFixed(2)}%</span>
                  <div className={styles.castBarTrack}>
                    <div className={styles.castBarFill} style={{ width: `${p.barPct}%`, background: color + "99" }} />
                  </div>
                </td>
                <td className={styles.castTdCount}>{formatAmount(p.rate)}</td>
                <td className={styles.castTdCount}>{p.hits}</td>
                <td className={styles.castTdCount}>{formatAmount(p.avg)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {hiddenCount > 0 && (
            <tr className={styles.expandRow} onClick={() => setExpanded(e => !e)}>
              <td colSpan={6}>
                {expanded ? "Weniger anzeigen" : `+ ${hiddenCount} weitere anzeigen`}
              </td>
            </tr>
          )}
          <tr>
            <td className={styles.castTdRank} />
            <td className={styles.castTdName}>Total</td>
            <td className={styles.castTdAmount}>
              <span className={styles.castPct}>100%</span>
              <span className={styles.amountTotal}>{formatAmount(grandTotal)}</span>
            </td>
            <td className={styles.castTdCount}>{formatAmount(grandRate)}</td>
            <td className={styles.castTdCount}>{grandHits}</td>
            <td className={styles.castTdCount}>{formatAmount(grandAvg)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── AmountTooltip ────────────────────────────────────────────

function AmountTooltip({ abilities, abilityNames, pinned }) {
  const maxAmount = abilities[0]?.amount ?? 1;
  return (
    <div className={`${styles.castTooltip} ${pinned ? styles.castTooltipPinned : ""}`}>
      <div className={styles.castTooltipHead}>Ability</div>
      <table className={styles.castTooltipTable}>
        <tbody>
          {abilities.map((ab, idx) => {
            const info = abilityNames[ab.id];
            return (
              <tr key={ab.id}>
                <td className={styles.castTooltipRank}>{idx + 1}</td>
                <td className={styles.castTooltipName}>
                  {info?.icon && (
                    <img
                      src={`https://wow.zamimg.com/images/wow/icons/small/${info.icon}`}
                      width={13} height={13} alt=""
                      className={styles.castTooltipIcon}
                    />
                  )}
                  <a
                    href={`https://www.wowhead.com/spell=${ab.id}`}
                    target="_blank" rel="noreferrer"
                    className={styles.castTooltipLink}
                    onClick={e => e.stopPropagation()}
                  >
                    {info?.name ?? `#${ab.id}`}
                  </a>
                </td>
                <td className={styles.castTooltipPct}>{ab.pct.toFixed(1)}%</td>
                <td className={styles.castTooltipBar}>
                  <div className={styles.castTooltipBarTrack}>
                    <div className={styles.castTooltipBarFill} style={{ width: `${(ab.amount / maxAmount) * 100}%` }} />
                  </div>
                </td>
                <td className={styles.castTooltipCount}>{formatAmount(ab.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
