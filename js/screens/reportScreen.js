// אשף הפקת דוח PDF אישי: בחירת תוכן, תצוגה מקדימה, הדפסה/שמירה כ-PDF, ושיתוף ביוזמת המשתמש בלבד.
// הדוח נבנה כ-HTML מעוצב ל-RTL עם פונטי מערכת התומכים בעברית; שמירה כ-PDF נעשית במנגנון ההדפסה של הדפדפן.

import * as store from '../storage.js';
import { compareBlock, setGroupMode, getGroupMode } from './recordsScreen.js';
import { recoveryCharts, recoveryTable, recoverySummaryText } from '../recovery.js';
import {
  esc, fmtDate, fmtDateTime, fmtTime, toast, confirmDialog, downloadFile, announce,
} from '../util.js';
import {
  CONTEXTS, SOURCES, QUALITY, RELATIONS, SEXES, CREDIT, REPORT_DISCLAIMER, MEDICAL_WARNING,
} from '../constants.js';

const OPTS = {
  table: true, charts: true, compare: true, recovery: true, notes: true, age: false, medical: false,
  pulse: true, breath: true,
};
let pickedProfiles = null;
let range = { from: '', to: '' };
let excluded = new Set();

function matchingEvents() {
  const from = range.from ? new Date(range.from + 'T00:00:00').getTime() : -Infinity;
  const to = range.to ? new Date(range.to + 'T23:59:59').getTime() : Infinity;
  const ids = pickedProfiles;
  return store.getEvents()
    .filter((e) => ids.has(e.profileId) && +new Date(e.createdAt) >= from && +new Date(e.createdAt) <= to)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// בניית תוכן הדוח (HTML). events כבר מסוננים לפי בחירת המשתמש.
export function buildReport(events, o) {
  // הסרת מדד שלא נבחר
  const evs = events.map((e) => ({
    ...e,
    pulse: o.pulse ? e.pulse : null,
    breathing: o.breath ? e.breathing : null,
  })).filter((e) => e.pulse || e.breathing);
  const profiles = store.getProfiles().filter((p) => evs.some((e) => e.profileId === p.id));
  const prevGroup = getGroupMode();
  let html = `
    <header class="rp-cover">
      <h1>מעבדת הדופק והנשימה — דוח לימודי</h1>
      <p class="rp-meta">תאריך הפקה: ${esc(fmtDate(new Date().toISOString()))} · פרופילים: ${profiles.map((p) => esc(p.nickname)).join(', ') || '—'} · ${evs.length} מדידות</p>
      <p class="rp-credit">${esc(CREDIT)}</p>
      <p class="rp-warn"><strong>${esc(REPORT_DISCLAIMER)}</strong></p>
    </header>`;

  profiles.forEach((p) => {
    const pe = evs.filter((e) => e.profileId === p.id);
    html += `<section class="rp-sec"><h2>${esc(p.nickname)} <small>(${esc(RELATIONS[p.relation])})</small></h2>`;
    const bg = [];
    if (o.age && p.age) bg.push(`גיל: ${p.age}`);
    if (o.age && p.sex) bg.push(`מין: ${esc(SEXES[p.sex])}`);
    if (bg.length) html += `<p class="rp-bg">${bg.join(' · ')}</p>`;
    if (o.medical && p.medical) html += `<p class="rp-bg"><strong>פרטי רקע (בבחירת המשתמש):</strong> ${esc(p.medical)}</p>`;
    if (o.table) {
      const cellSrc = (m) => `<br><small>${esc(SOURCES[m.source])}${m.quality && m.quality !== 'manual' ? '; איכות: ' + esc(QUALITY[m.quality]) : ''}</small>`;
      html += `<div class="table-wrap"><table class="data"><caption>מדידות — ${esc(p.nickname)}</caption><thead><tr><th>מועד</th><th>מצב</th>${o.pulse ? '<th>דופק (פעימות לדקה)</th>' : ''}${o.breath ? '<th>נשימה (נשימות לדקה)</th>' : ''}${o.notes ? '<th>הערה</th>' : ''}</tr></thead><tbody>
        ${pe.map((e) => `<tr><th scope="row">${esc(fmtDate(e.createdAt))}<br>${esc(fmtTime(e.createdAt))}</th><td>${esc(CONTEXTS[e.context])}${e.contextNote ? ' — ' + esc(e.contextNote) : ''}</td>
          ${o.pulse ? `<td>${e.pulse ? `<strong>${e.pulse.bpm}</strong>${cellSrc(e.pulse)}` : '—'}</td>` : ''}
          ${o.breath ? `<td>${e.breathing ? `<strong>${e.breathing.rpm}</strong>${cellSrc(e.breathing)}` : '—'}</td>` : ''}
          ${o.notes ? `<td>${esc(e.note || '')}</td>` : ''}</tr>`).join('')}
        </tbody></table></div>`;
    }
    html += '</section>';
  });

  if (o.charts && evs.length) {
    html += `<section class="rp-sec"><h2>גרפים</h2>${compareBlock(evs, { mode: 'side', parts: { bars: false, lines: true, recovery: false, table: false } })}</section>`;
  }
  if (o.compare && evs.length > 1) {
    const contexts = new Set(evs.map((e) => e.context));
    setGroupMode(contexts.size > 1 ? 'context' : (profiles.length > 1 ? 'profile' : 'event'));
    html += `<section class="rp-sec"><h2>השוואות</h2>${compareBlock(evs, { mode: 'side', parts: { bars: true, lines: false, recovery: false, table: false } })}</section>`;
    setGroupMode(prevGroup);
  }
  if (o.recovery) {
    const byChal = new Map();
    evs.filter((e) => e.challengeId).forEach((e) => { if (!byChal.has(e.challengeId)) byChal.set(e.challengeId, []); byChal.get(e.challengeId).push(e); });
    let rec = '';
    byChal.forEach((list) => {
      if (!list.some((e) => e.challengeStage === 'immediate' || e.challengeStage === 'recovery')) return;
      const p = store.getProfile(list[0].profileId);
      rec += `<div class="rp-chal"><h3>אתגר התאוששות — ${esc(p ? p.nickname : '')}, ${esc(fmtDate(list[0].createdAt))}</h3>
        ${recoveryCharts(list)}${recoveryTable(list)}
        <ul>${recoverySummaryText(list).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
    });
    if (rec) html += `<section class="rp-sec"><h2>נתוני התאוששות</h2>${rec}<p class="hint">הזמנים הם הזמנים האמיתיים של כל מדידה; דופק ונשימה נמדדו ברצף.</p></section>`;
  }

  html += `
    <section class="rp-sec rp-limits">
      <h2>מקורות מדידה ומגבלות</h2>
      <ul>
        <li><strong>מצלמה (PPG):</strong> אות אופטי של נפח דם באצבע; רגיש לתנועה, לתאורה וללחץ. אינו אק״ג.</li>
        <li><strong>מיקרופון (ניסיוני):</strong> זיהוי נשימה לפי רעש הנשימה; רגיש לרעש ולדיבור.</li>
        <li><strong>ספירה ידנית / הקשות:</strong> תלויות בדיוק המשתמש; הקשות מתועדות כ״הקשות משתמש״ ולא כמדידת חיישן.</li>
        <li><strong>הדגמה:</strong> נתונים מדומים (אם קיימים) מסומנים כהדגמה.</li>
        <li>ההבדלים בין אנשים תלויים בגיל, מין, מצב רפואי, תרופות, רמת פעילות ותנאי מדידה. אין להסיק על בריאות או כושר ממדידה בודדת.</li>
      </ul>
      <p class="rp-warn-text">${esc(MEDICAL_WARNING)}</p>
    </section>
    <footer class="rp-foot"><span>${esc(CREDIT)}</span><span>${esc(REPORT_DISCLAIMER)}</span></footer>`;
  return html;
}

export function reportScreen(root) {
  const profiles = store.getProfiles().filter((p) => store.getEvents().some((e) => e.profileId === p.id));
  root.innerHTML = '<h1 tabindex="-1">הפקת דוח PDF</h1><div id="rp-body"></div>';
  const body = root.querySelector('#rp-body');
  if (!profiles.length) {
    body.innerHTML = '<div class="empty"><p>אין עדיין מדידות להפקת דוח.</p><a class="btn primary" href="#/measure">למדוד עכשיו</a></div>';
    return;
  }
  if (!pickedProfiles) pickedProfiles = new Set(profiles.map((p) => p.id));
  pickedProfiles = new Set([...pickedProfiles].filter((id) => profiles.some((p) => p.id === id)));
  if (!pickedProfiles.size) pickedProfiles = new Set(profiles.map((p) => p.id));

  const draw = () => {
    const evs = matchingEvents();
    body.innerHTML = `
      <div class="notice warn" role="note"><strong>לפני שמפיקים:</strong> הדוח עשוי לכלול נתונים אישיים. שתפו אותו רק עם מי שבחרתם. פרטי רקע (גיל, מין, רקע רפואי) <strong>אינם נכללים כברירת מחדל</strong>.</div>
      <form class="panel" id="rp-form" novalidate>
        <fieldset class="chips"><legend>1. אילו פרופילים?</legend>
          ${profiles.map((p) => `<label class="chip-check"><input type="checkbox" name="rp-p" value="${esc(p.id)}" ${pickedProfiles.has(p.id) ? 'checked' : ''}><span>${esc(p.nickname)}</span></label>`).join('')}
        </fieldset>
        <div class="grid2">
          <label class="field">2. מתאריך <input type="date" id="rp-from" value="${esc(range.from)}"></label>
          <label class="field">עד תאריך <input type="date" id="rp-to" value="${esc(range.to)}"></label>
        </div>
        <details class="pick-events">
          <summary>בחירה ידנית של מדידות (${evs.filter((e) => !excluded.has(e.id)).length} מתוך ${evs.length} נבחרו)</summary>
          <ul class="plain">${evs.map((e) => `<li><label class="check"><input type="checkbox" name="rp-e" value="${esc(e.id)}" ${excluded.has(e.id) ? '' : 'checked'}> ${esc(store.getProfile(e.profileId).nickname)} · ${esc(CONTEXTS[e.context])} · ${esc(fmtDateTime(e.createdAt))}</label></li>`).join('')}</ul>
        </details>
        <fieldset class="chips"><legend>3. אילו מדדים?</legend>
          <label class="chip-check"><input type="checkbox" id="o-pulse" ${OPTS.pulse ? 'checked' : ''}><span>דופק</span></label>
          <label class="chip-check"><input type="checkbox" id="o-breath" ${OPTS.breath ? 'checked' : ''}><span>נשימה</span></label>
        </fieldset>
        <fieldset class="chips"><legend>4. מה לכלול?</legend>
          ${[['table', 'טבלת מדידות'], ['charts', 'גרפים'], ['compare', 'השוואות'], ['recovery', 'נתוני התאוששות'], ['notes', 'הערות']].map(([k, v]) => `<label class="chip-check"><input type="checkbox" id="o-${k}" ${OPTS[k] ? 'checked' : ''}><span>${v}</span></label>`).join('')}
        </fieldset>
        <fieldset class="optional"><legend>פרטי רקע — נתונים רגישים (כבויים כברירת מחדל)</legend>
          <label class="check"><input type="checkbox" id="o-age" ${OPTS.age ? 'checked' : ''}> לכלול גיל ומין (אם הוזנו)</label>
          <label class="check"><input type="checkbox" id="o-medical" ${OPTS.medical ? 'checked' : ''}> לכלול פרטי רקע רפואיים בטקסט חופשי (אם הוזנו)</label>
        </fieldset>
        <div class="btn-row"><button class="btn primary big" type="submit" ${evs.length ? '' : 'disabled'}>תצוגה מקדימה</button></div>
        ${evs.length ? '' : '<p class="notice warn">אין מדידות בטווח שנבחר.</p>'}
      </form>
      <div id="rp-preview"></div>`;
    const form = body.querySelector('#rp-form');
    const read = () => {
      pickedProfiles = new Set(Array.from(form.querySelectorAll('input[name="rp-p"]:checked')).map((i) => i.value));
      range.from = form.querySelector('#rp-from').value;
      range.to = form.querySelector('#rp-to').value;
      Object.keys(OPTS).forEach((k) => {
        const el = form.querySelector('#o-' + (k === 'breath' ? 'breath' : k));
        if (el) OPTS[k] = el.checked;
      });
    };
    form.addEventListener('change', (e) => {
      read();
      if (e.target.name === 'rp-e') {
        if (e.target.checked) excluded.delete(e.target.value); else excluded.add(e.target.value);
        form.querySelector('.pick-events summary').textContent = `בחירה ידנית של מדידות (${matchingEvents().filter((x) => !excluded.has(x.id)).length} מתוך ${matchingEvents().length} נבחרו)`;
        return;
      }
      if (e.target.name === 'rp-p' || e.target.id === 'rp-from' || e.target.id === 'rp-to') { excluded = new Set(); draw(); }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      read();
      const chosen = matchingEvents().filter((x) => !excluded.has(x.id));
      if (!chosen.length) { toast('לא נבחרו מדידות'); return; }
      if (!OPTS.pulse && !OPTS.breath) { toast('יש לבחור לפחות מדד אחד'); return; }
      if (OPTS.age || OPTS.medical) {
        const ok = await confirmDialog('פרטי רקע בדוח', 'סימנתם לכלול פרטי רקע אישיים ורגישים בדוח. הם יופיעו בקובץ שתשמרו או תשתפו. להמשיך?', 'כן, לכלול');
        if (!ok) return;
      }
      showPreview(body.querySelector('#rp-preview'), chosen);
    });
  };
  draw();
}

function showPreview(host, events) {
  const content = buildReport(events, OPTS);
  const canShareFiles = !!(navigator.canShare && navigator.share);
  host.innerHTML = `
    <div class="panel">
      <h2>תצוגה מקדימה</h2>
      <p class="hint">בדקו שהתוכן מתאים. לשמירה כ-PDF: לחצו ״הדפסה / שמירה כ-PDF״ ובחלון ההדפסה בחרו ״שמירה כ-PDF״ (ביעד ההדפסה). אין שליחה אוטומטית — השיתוף הוא ביוזמתכם.</p>
      <div class="btn-row">
        <button class="btn primary" id="rp-print">הדפסה / שמירה כ-PDF</button>
        <button class="btn secondary" id="rp-html">הורדה כקובץ HTML</button>
        ${canShareFiles ? '<button class="btn secondary" id="rp-share">שיתוף…</button>' : ''}
      </div>
    </div>
    <article class="report" id="report-sheet" dir="rtl" lang="he">${content}</article>`;
  host.scrollIntoView({ behavior: 'smooth' });
  announce('התצוגה המקדימה מוכנה');
  host.querySelector('#rp-print').addEventListener('click', () => printReport(content));
  host.querySelector('#rp-html').addEventListener('click', async () => {
    downloadFile(`pulse-breath-report-${new Date().toISOString().slice(0, 10)}.html`, await standaloneHtml(content), 'text/html');
    toast('הקובץ נוצר. אפשר לפתוח אותו ולהדפיס ל-PDF');
  });
  const shareBtn = host.querySelector('#rp-share');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    try {
      const file = new File([await standaloneHtml(content)], 'pulse-breath-report.html', { type: 'text/html' });
      if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'דוח לימודי — מעבדת הדופק והנשימה' });
      else toast('המכשיר אינו תומך בשיתוף קובץ — השתמשו בהורדה');
    } catch (err) {
      if (err && err.name !== 'AbortError') toast('השיתוף לא הושלם');
    }
  });
}

function printReport(content) {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.innerHTML = `<article class="report" dir="rtl" lang="he">${content}</article>`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

async function standaloneHtml(content) {
  const get = async (p) => { try { return await (await fetch(p)).text(); } catch { return ''; } };
  const css = (await get('css/charts.css')) + (await get('css/report.css'));
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>דוח לימודי — מעבדת הדופק והנשימה</title><style>${css}</style></head><body class="standalone"><article class="report" dir="rtl" lang="he">${content}</article></body></html>`;
}
