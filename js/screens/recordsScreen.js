// "התיקים שלי והשוואות": פרופילים, היסטוריה עם סינון, השוואות וגרפים, ייצוא/ייבוא.

import * as store from '../storage.js';
import { renderProfilesPanel } from '../profiles.js';
import { resultCard, wireReplay } from '../measure.js';
import { lineChart, barChart, dataTable, PULSE_STYLE, BREATH_STYLE, MARKERS, DASHES } from '../charts.js';
import { recoveryCharts, recoveryTable } from '../recovery.js';
import { CONTEXTS, SOURCES, SOURCE_SHORT, PULSE_COLOR, BREATH_COLOR, QUALITY } from '../constants.js';
import {
  esc, fmtDateTime, fmtDate, fmtTime, mean, round1, toast, openModal, confirmDialog, infoDialog,
  downloadFile, csvCell,
} from '../util.js';

const filters = { profiles: new Set(), context: '', source: '', from: '', to: '' };
const selected = new Set();
let compareMode = 'side'; // side | combined
let groupMode = 'event'; // event | context | profile

const TABS = [
  ['profiles', 'פרופילים'],
  ['history', 'היסטוריית מדידות'],
  ['compare', 'השוואות'],
  ['data', 'ייצוא וייבוא'],
];

export function recordsScreen(root, params, sub) {
  const tab = TABS.some(([k]) => k === sub) ? sub : 'profiles';
  root.innerHTML = `
    <div class="panel-head"><h1 tabindex="-1">התיקים שלי והשוואות</h1>
      <a class="btn secondary" href="#/report">הפקת דוח PDF</a></div>
    <nav class="tabs" aria-label="מקטעי התיקים שלי">
      ${TABS.map(([k, v]) => `<a href="#/records/${k}" class="tab ${k === tab ? 'active' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${v}</a>`).join('')}
    </nav>
    <div id="rec-body"></div>`;
  const body = root.querySelector('#rec-body');
  if (tab === 'profiles') renderProfilesPanel(body, () => recordsScreen(root, params, 'profiles'));
  else if (tab === 'history') renderHistory(body, root, params);
  else if (tab === 'compare') renderCompare(body, root, params);
  else renderData(body, root, params);
}

// ---------- סינון ----------
export function filterEvents(f = filters) {
  const from = f.from ? new Date(f.from + 'T00:00:00').getTime() : -Infinity;
  const to = f.to ? new Date(f.to + 'T23:59:59').getTime() : Infinity;
  return store.getEvents()
    .filter((e) => (!f.profiles.size || f.profiles.has(e.profileId))
      && (!f.context || e.context === f.context)
      && (!f.source || (e.pulse && e.pulse.source === f.source) || (e.breathing && e.breathing.source === f.source))
      && new Date(e.createdAt).getTime() >= from && new Date(e.createdAt).getTime() <= to)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function pname(id) { const p = store.getProfile(id); return p ? p.nickname : '?'; }

function filterBar() {
  const profiles = store.getProfiles();
  return `
    <form class="filters panel" id="flt" novalidate>
      <details ${filters.profiles.size || filters.context || filters.source || filters.from || filters.to ? 'open' : ''}>
        <summary>סינון</summary>
        <fieldset class="chips"><legend>פרופילים</legend>
          ${profiles.map((p) => `<label class="chip-check"><input type="checkbox" name="fp" value="${esc(p.id)}" ${filters.profiles.has(p.id) ? 'checked' : ''}><span>${esc(p.nickname)}</span></label>`).join('')}
        </fieldset>
        <div class="grid2">
          <label class="field">מצב
            <select id="f-ctx"><option value="">הכול</option>${Object.entries(CONTEXTS).map(([k, v]) => `<option value="${k}" ${filters.context === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field">מקור מדידה
            <select id="f-src"><option value="">הכול</option>${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}" ${filters.source === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field">מתאריך <input type="date" id="f-from" value="${esc(filters.from)}"></label>
          <label class="field">עד תאריך <input type="date" id="f-to" value="${esc(filters.to)}"></label>
        </div>
        <button type="button" class="btn ghost small" id="f-clear">ניקוי סינון</button>
      </details>
    </form>`;
}

function wireFilters(scope, rerender) {
  const upd = () => {
    filters.profiles = new Set(Array.from(scope.querySelectorAll('input[name="fp"]:checked')).map((i) => i.value));
    filters.context = scope.querySelector('#f-ctx').value;
    filters.source = scope.querySelector('#f-src').value;
    filters.from = scope.querySelector('#f-from').value;
    filters.to = scope.querySelector('#f-to').value;
    rerender();
  };
  scope.querySelector('#flt').addEventListener('change', upd);
  scope.querySelector('#f-clear').addEventListener('click', () => {
    filters.profiles = new Set(); filters.context = ''; filters.source = ''; filters.from = ''; filters.to = '';
    rerender();
  });
}

// ---------- היסטוריה ----------
function valChip(kind, m) {
  if (!m) return '';
  const v = kind === 'pulse' ? m.bpm : m.rpm;
  const cls = kind === 'pulse' ? 'pulse' : 'breath';
  return `<span class="val ${cls}"><span class="ico" aria-hidden="true">${kind === 'pulse' ? '❤' : '🫁'}</span><strong>${v}</strong> ${kind === 'pulse' ? 'פעימות/דקה' : 'נשימות/דקה'} <span class="src-tag">${esc(SOURCE_SHORT[m.source] || '')}</span></span>`;
}

function renderHistory(body, root, params) {
  const draw = () => {
    const events = filterEvents();
    const total = store.getEvents().length;
    body.innerHTML = `
      ${filterBar()}
      ${total === 0 ? `<div class="empty"><p>עוד אין מדידות. אפשר ליצור מדידה ראשונה.</p><a class="btn primary" href="#/measure">למדוד עכשיו</a></div>` : `
      <div class="list-head">
        <span>${events.length} מדידות${events.length !== total ? ` (מתוך ${total})` : ''} · נבחרו להשוואה: <strong id="sel-n">${selected.size}</strong></span>
        <span class="btn-row">
          <button class="btn ghost small" id="sel-all">בחירת כל המוצגות</button>
          <button class="btn ghost small" id="sel-none">ניקוי בחירה</button>
          <a class="btn primary small" href="#/records/compare">להשוואה</a>
        </span>
      </div>
      <ul class="card-list">
        ${events.map((e) => `
          <li class="card event" data-id="${esc(e.id)}">
            <label class="sel"><input type="checkbox" data-sel ${selected.has(e.id) ? 'checked' : ''} aria-label="בחירה להשוואה: ${esc(pname(e.profileId))}, ${esc(fmtDateTime(e.createdAt))}"></label>
            <div class="card-main">
              <div><strong>${esc(pname(e.profileId))}</strong> · ${esc(CONTEXTS[e.context])}${e.contextNote ? ' — ' + esc(e.contextNote) : ''}
                ${e.challengeId ? '<span class="chip">אתגר</span>' : ''}</div>
              <div class="muted">${esc(fmtDateTime(e.createdAt))}</div>
              <div class="vals">${valChip('pulse', e.pulse)}${valChip('breath', e.breathing)}</div>
              ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}
            </div>
            <div class="btn-row">
              <button class="btn secondary small" data-act="view">פרטים</button>
              <button class="btn danger small" data-act="del">מחיקה</button>
            </div>
          </li>`).join('')}
      </ul>`}`;
    wireFilters(body, draw);
    if (!total) return;
    const upd = () => { body.querySelector('#sel-n').textContent = String(selected.size); };
    body.querySelectorAll('[data-sel]').forEach((cb) => cb.addEventListener('change', () => {
      const id = cb.closest('.card').dataset.id;
      if (cb.checked) selected.add(id); else selected.delete(id);
      upd();
    }));
    body.querySelector('#sel-all').addEventListener('click', () => { events.forEach((e) => selected.add(e.id)); draw(); });
    body.querySelector('#sel-none').addEventListener('click', () => { selected.clear(); draw(); });
    body.querySelectorAll('.card.event').forEach((li) => {
      const ev = store.getEvents().find((x) => x.id === li.dataset.id);
      li.querySelector('[data-act="view"]').addEventListener('click', async () => {
        const p = infoDialog(`${pname(ev.profileId)} — ${CONTEXTS[ev.context]}`, `
          <p class="muted">${esc(fmtDateTime(ev.createdAt))}</p>${resultCard(ev)}
          ${ev.note ? `<p><strong>הערה:</strong> ${esc(ev.note)}</p>` : ''}`);
        wireReplay(openModal.current.modal, ev);
        await p;
      });
      li.querySelector('[data-act="del"]').addEventListener('click', async () => {
        if (await confirmDialog('מחיקת מדידה', 'למחוק את המדידה? לא ניתן לשחזר.', 'מחיקה', true)) {
          store.deleteEvent(ev.id); selected.delete(ev.id); toast('המדידה נמחקה'); draw();
        }
      });
    });
  };
  draw();
}

// ---------- השוואות ----------
const gname = (e) => `${pname(e.profileId)} · ${CONTEXTS[e.context]} · ${fmtDate(e.createdAt).slice(0, 5)} ${fmtTime(e.createdAt)}`;

function groups(events) {
  const map = new Map();
  events.forEach((e) => {
    let key, label;
    if (groupMode === 'context') { key = e.context; label = CONTEXTS[e.context]; }
    else if (groupMode === 'profile') { key = e.profileId; label = pname(e.profileId); }
    else { key = e.id; label = gname(e); }
    if (!map.has(key)) map.set(key, { label, p: [], b: [] });
    const g = map.get(key);
    if (e.pulse) g.p.push(e.pulse.bpm);
    if (e.breathing) g.b.push(e.breathing.rpm);
  });
  return Array.from(map.values()).map((g) => ({
    label: g.label,
    n: Math.max(g.p.length, g.b.length),
    values: [g.p.length ? round1(mean(g.p)) : null, g.b.length ? round1(mean(g.b)) : null],
  }));
}

export function setGroupMode(m) { groupMode = m; }
export function getGroupMode() { return groupMode; }
export function compareBlock(events, { mode = compareMode, parts = {} } = {}) {
  const P = { bars: true, lines: true, recovery: true, table: true, ...parts };
  const g = groups(events);
  const combined = mode === 'combined';
  const unitNote = groupMode === 'event' ? '' : ' (ממוצע)';
  const barsSide = `
    <div class="chart-grid">
      ${barChart({ title: `דופק${unitNote}`, groups: g.map((x) => ({ label: x.label, values: [x.values[0]] })), series: [{ name: 'דופק (פעימות לדקה)', ...PULSE_STYLE, color: PULSE_COLOR }], yLabel: 'פעימות לדקה', desc: 'עמודות של דופק לפי קבוצה' })}
      ${barChart({ title: `קצב נשימה${unitNote}`, groups: g.map((x) => ({ label: x.label, values: [x.values[1]] })), series: [{ name: 'נשימה (נשימות לדקה)', color: BREATH_COLOR, pattern: 'hatch', ...{ marker: 'square', dash: '7 4' } }], yLabel: 'נשימות לדקה', desc: 'עמודות של קצב נשימה לפי קבוצה' })}
    </div>`;
  const barsComb = barChart({
    title: `דופק ונשימה${unitNote} — שני צירים`, groups: g,
    series: [
      { name: 'דופק (ציר שמאלי)', color: PULSE_COLOR, axis: 'left', marker: 'circle', dash: '' },
      { name: 'נשימה (ציר ימני)', color: BREATH_COLOR, axis: 'right', pattern: 'hatch', marker: 'square', dash: '7 4' },
    ],
    yLabel: 'פעימות לדקה', y2Label: 'נשימות לדקה', desc: 'עמודות משולבות עם שני צירים',
  });

  // קווי זמן לפי פרופיל
  const byProf = new Map();
  events.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach((e) => {
    if (!byProf.has(e.profileId)) byProf.set(e.profileId, []);
    byProf.get(e.profileId).push(e);
  });
  const span = events.length ? Math.max(...events.map((e) => +new Date(e.createdAt))) - Math.min(...events.map((e) => +new Date(e.createdAt))) : 0;
  const xFmt = (v) => { const iso = new Date(v).toISOString(); return span > 86400000 ? fmtDate(iso).slice(0, 5) : fmtTime(iso); };
  const mkSeries = (metric) => Array.from(byProf.entries()).map(([pid, evs], i) => {
    const pts = evs.filter((e) => (metric === 'pulse' ? e.pulse : e.breathing)).map((e) => ({
      x: +new Date(e.createdAt), y: metric === 'pulse' ? e.pulse.bpm : e.breathing.rpm,
      label: `${metric === 'pulse' ? e.pulse.bpm : e.breathing.rpm} · ${CONTEXTS[e.context]}`,
    }));
    return {
      name: pname(pid), color: metric === 'pulse' ? PULSE_COLOR : BREATH_COLOR,
      dash: DASHES[i % DASHES.length], marker: MARKERS[i % MARKERS.length], points: pts, axis: 'left',
    };
  });
  const pS = mkSeries('pulse'), bS = mkSeries('breath');
  const lines = combined
    ? lineChart({
      title: 'לאורך זמן — דופק ונשימה (שני צירים)',
      series: [...pS.map((s) => ({ ...s, name: `${s.name} — דופק` })), ...bS.map((s) => ({ ...s, name: `${s.name} — נשימה`, axis: 'right' }))],
      xTickFmt: xFmt, xLabel: 'זמן המדידה', yLabel: 'פעימות לדקה', y2Label: 'נשימות לדקה', desc: 'דופק ונשימה לאורך זמן, שני צירים',
    })
    : `<div class="chart-grid">
        ${lineChart({ title: 'דופק לאורך זמן', series: pS, xTickFmt: xFmt, xLabel: 'זמן המדידה', yLabel: 'פעימות לדקה', desc: 'דופק לאורך זמן לפי פרופיל' })}
        ${lineChart({ title: 'קצב נשימה לאורך זמן', series: bS, xTickFmt: xFmt, xLabel: 'זמן המדידה', yLabel: 'נשימות לדקה', desc: 'קצב נשימה לאורך זמן לפי פרופיל' })}
      </div>`;

  // התאוששות אם קיימת
  const byChal = new Map();
  events.filter((e) => e.challengeId).forEach((e) => { if (!byChal.has(e.challengeId)) byChal.set(e.challengeId, []); byChal.get(e.challengeId).push(e); });
  let rec = '';
  byChal.forEach((evs) => {
    if (evs.some((e) => e.challengeStage === 'immediate' || e.challengeStage === 'recovery')) {
      rec += `<section class="sub"><h3>אתגר התאוששות — ${esc(pname(evs[0].profileId))}, ${esc(fmtDate(evs[0].createdAt))}</h3>
        ${recoveryCharts(evs, { combined })}${recoveryTable(evs)}</section>`;
    }
  });

  // טבלה
  const rows = events.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((e) => [
    esc(`${fmtDate(e.createdAt).slice(0, 5)} ${fmtTime(e.createdAt)}`),
    esc(pname(e.profileId)),
    esc(CONTEXTS[e.context]),
    e.pulse ? `${e.pulse.bpm} <small>(${esc(SOURCE_SHORT[e.pulse.source])})</small>` : '—',
    e.breathing ? `${e.breathing.rpm} <small>(${esc(SOURCE_SHORT[e.breathing.source])})</small>` : '—',
  ]);
  const table = dataTable(['מועד', 'פרופיל', 'מצב', 'דופק', 'נשימה'], rows, 'טבלת המדידות שנבחרו (מקור המדידה בסוגריים)');

  // אזהרת מקורות שונים
  const pSrc = new Set(events.filter((e) => e.pulse).map((e) => e.pulse.source));
  const bSrc = new Set(events.filter((e) => e.breathing).map((e) => e.breathing.source));
  const mixed = pSrc.size > 1 || bSrc.size > 1;
  const profs = new Set(events.map((e) => e.profileId));
  return `
    ${mixed ? `<p class="notice warn" role="note">שימו לב: בהשוואה משולבות שיטות מדידה שונות (${esc([...pSrc, ...bSrc].filter((v, i, a) => a.indexOf(v) === i).map((s) => SOURCE_SHORT[s]).join(', '))}). הימנעו ממסקנות גורפות על הבדלים בין מדידות.</p>` : ''}
    ${profs.size > 1 ? '<p class="notice" role="note">מושווים כמה פרופילים: הבדלים בין אנשים נובעים מגיל, מין, מצב רפואי, תרופות, רמת פעילות ותנאי מדידה. אין להסיק על בריאות או כושר של אדם ממדידה בודדת.</p>' : ''}
    ${P.bars ? `<section class="sub"><h3>${groupMode === 'event' ? 'השוואה בין המדידות' : groupMode === 'context' ? 'ממוצע לפי מצב' : 'ממוצע לפי פרופיל'}</h3>${combined ? barsComb : barsSide}</section>` : ''}
    ${P.lines ? `<section class="sub"><h3>לאורך זמן</h3>${lines}</section>` : ''}
    ${P.recovery ? rec : ''}
    ${P.table ? `<section class="sub"><h3>טבלת נתונים</h3>${table}</section>` : ''}`;
}

function renderCompare(body, root, params) {
  const draw = () => {
    const events = store.getEvents().filter((e) => selected.has(e.id));
    body.innerHTML = `
      <div class="panel">
        <p>המדידות שנבחרו להשוואה: <strong>${events.length}</strong>. הבחירה נעשית ב<a href="#/records/history">היסטוריית המדידות</a> (תיבות סימון).</p>
        <div class="grid2">
          <fieldset class="seg"><legend>תצוגה</legend>
            <label><input type="radio" name="cm" value="side" ${compareMode === 'side' ? 'checked' : ''}> דופק ונשימה זה לצד זה</label>
            <label><input type="radio" name="cm" value="combined" ${compareMode === 'combined' ? 'checked' : ''}> גרף משולב (שני צירים)</label>
          </fieldset>
          <label class="field">קיבוץ העמודות
            <select id="cg">
              <option value="event" ${groupMode === 'event' ? 'selected' : ''}>כל מדידה בנפרד</option>
              <option value="context" ${groupMode === 'context' ? 'selected' : ''}>ממוצע לפי מצב</option>
              <option value="profile" ${groupMode === 'profile' ? 'selected' : ''}>ממוצע לפי פרופיל</option>
            </select></label>
        </div>
        <button class="btn ghost small" id="cx-help" aria-expanded="false">איך קוראים את ההשוואה?</button>
        <div id="cx-help-body" class="explain" hidden>
          <p>בעמודות מושווים ערכים של דופק (פעימות לדקה) ושל נשימה (נשימות לדקה) — אלה יחידות שונות, ולכן בגרף משולב לכל מדד ציר משלו. השוו מגמות ולא מספרים מוחלטים.</p>
          <p>הבדלים בין אנשים עשויים להיות קשורים לגיל, מין, מצב רפואי, תרופות, רמת פעילות ותנאי מדידה. אין להסיק על בריאותו או כושרו של אדם ממדידה בודדת, וכשהמדידות נעשו בשיטות שונות (מצלמה, מיקרופון, ספירה) קשה להשוות ביניהן.</p>
        </div>
      </div>
      ${events.length < 1 ? `<div class="empty"><p>לא נבחרו מדידות. עברו להיסטוריה וסמנו מדידות להשוואה — אפשר לבחור כמה מדידות של פרופיל אחד או של כמה פרופילים.</p>
        <a class="btn primary" href="#/records/history">לבחירת מדידות</a></div>`
      : events.length < 2 ? `<p class="notice">נבחרה מדידה אחת. כדי להשוות, סמנו לפחות עוד אחת.</p>${compareBlock(events)}`
      : compareBlock(events)}`;
    body.querySelectorAll('input[name="cm"]').forEach((r) => r.addEventListener('change', () => { compareMode = r.value; draw(); }));
    body.querySelector('#cg').addEventListener('change', (e) => { groupMode = e.target.value; draw(); });
    const hb = body.querySelector('#cx-help');
    hb.addEventListener('click', () => {
      const hid = body.querySelector('#cx-help-body');
      hid.hidden = !hid.hidden;
      hb.setAttribute('aria-expanded', String(!hid.hidden));
    });
  };
  draw();
}

// ---------- ייצוא / ייבוא ----------
export function eventsToCsv() {
  const head = ['profile', 'event_id', 'created_at', 'context', 'context_note', 'pulse_bpm', 'pulse_source', 'pulse_quality', 'pulse_sampled_at', 'pulse_duration_sec', 'breathing_rpm', 'breathing_source', 'breathing_quality', 'breathing_sampled_at', 'breathing_duration_sec', 'note', 'challenge_id', 'challenge_stage', 'recovery_elapsed_sec'];
  const rows = store.getEvents().map((e) => [
    pname(e.profileId), e.id, e.createdAt, e.context, e.contextNote,
    e.pulse?.bpm ?? '', e.pulse?.source ?? '', e.pulse?.quality ?? '', e.pulse?.sampledAt ?? '', e.pulse?.durationSec ?? '',
    e.breathing?.rpm ?? '', e.breathing?.source ?? '', e.breathing?.quality ?? '', e.breathing?.sampledAt ?? '', e.breathing?.durationSec ?? '',
    e.note, e.challengeId ?? '', e.challengeStage ?? '', e.recoveryElapsedSec ?? '',
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function renderData(body, root, params) {
  body.innerHTML = `
    <div class="panel">
      <h2>ייצוא</h2>
      <p class="hint">הקבצים נוצרים במכשיר ונשמרים אצלכם. שום דבר לא נשלח החוצה. קובץ JSON מתאים לגיבוי ולהעברה למכשיר אחר; CSV לפתיחה בגיליון אלקטרוני.</p>
      <label class="check"><input type="checkbox" id="ex-bg"> לכלול פרטי רקע (גיל, מין, רקע רפואי) בקובץ ה-JSON — נתונים רגישים, לא מומלץ</label>
      <div class="btn-row">
        <button class="btn primary" id="ex-json">ייצוא JSON</button>
        <button class="btn secondary" id="ex-csv">ייצוא CSV של המדידות</button>
      </div>
    </div>
    <div class="panel">
      <h2>ייבוא</h2>
      <p class="hint">אפשר לייבא רק קובץ JSON שיוצא מהיישום הזה. הקובץ נבדק ומנוקה לפני הכנסה, ולא מורץ בו שום קוד.</p>
      <label class="field">בחרו קובץ JSON <input type="file" id="im-file" accept="application/json,.json"></label>
      <p id="im-msg" role="status"></p>
    </div>
    <div class="panel danger-zone">
      <h2>מחיקת כל הנתונים</h2>
      <p>מוחק את כל הפרופילים והמדידות מהמכשיר הזה. מומלץ לייצא גיבוי לפני כן.</p>
      <button class="btn danger" id="del-all">מחיקת כל הנתונים המקומיים</button>
    </div>`;
  body.querySelector('#ex-json').addEventListener('click', () => {
    const inc = body.querySelector('#ex-bg').checked;
    downloadFile(`pulse-breath-lab-${new Date().toISOString().slice(0, 10)}.json`, store.exportData({ includeBackground: inc }), 'application/json');
    toast('הקובץ נוצר');
  });
  body.querySelector('#ex-csv').addEventListener('click', () => {
    downloadFile(`pulse-breath-lab-${new Date().toISOString().slice(0, 10)}.csv`, eventsToCsv(), 'text/csv');
    toast('הקובץ נוצר');
  });
  body.querySelector('#im-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    const msg = body.querySelector('#im-msg');
    if (!f) return;
    const text = await f.text();
    const r = store.parseImport(text);
    if (!r.ok) { msg.textContent = r.error; msg.className = 'error'; return; }
    const choice = await openModal({
      title: 'אישור ייבוא',
      bodyHtml: `<p>נמצאו ${r.profiles.length} פרופילים ו-${r.events.length} מדידות תקינות.</p>
        <p><strong>מיזוג</strong> מוסיף רק מה שחסר. <strong>החלפה</strong> מוחקת את הנתונים הקיימים במכשיר.</p>`,
      actions: [
        { label: 'ביטול', kind: 'secondary', value: null },
        { label: 'החלפה', kind: 'danger', value: 'replace' },
        { label: 'מיזוג', kind: 'primary', value: 'merge' },
      ],
    });
    if (!choice) { msg.textContent = 'הייבוא בוטל.'; msg.className = ''; return; }
    const res = store.applyImport(r, choice);
    msg.textContent = `יובאו ${res.addedP} פרופילים ו-${res.addedE} מדידות.`;
    msg.className = 'ok';
    toast('הייבוא הושלם');
  });
  body.querySelector('#del-all').addEventListener('click', async () => {
    if (await confirmDialog('מחיקת כל הנתונים', 'כל הפרופילים והמדידות יימחקו מהמכשיר ולא ניתן יהיה לשחזר. להמשיך?', 'מחיקת הכול', true)) {
      store.clearAll(); selected.clear(); toast('כל הנתונים נמחקו'); recordsScreen(root, params, 'data');
    }
  });
}
