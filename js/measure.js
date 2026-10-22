// זרימת מדידה משולבת: דופק ואז נשימה (כל אחד אופציונלי), כרטיס תוצאות משולב ושמירה כאירוע מדידה.
// משמשת גם את המסך "למדוד עכשיו" וגם את אתגר ההתאוששות.

import { runCameraPulse } from './cameraPPG.js';
import { runMicBreathing } from './respiration.js';
import { runManualCount, tapTimeline } from './manualCount.js';
import { beatTimeline } from './charts.js';
import { cameraSupport, micSupport } from './permissions.js';
import * as store from './storage.js';
import { esc, fmtDateTime, toast, announce, fmtClock } from './util.js';
import { CONTEXTS, SOURCES, QUALITY, PULSE_COLOR, BREATH_COLOR } from './constants.js';
import { ensureAudio, tick, audioSupported } from './audio.js';

/**
 * opts: {
 *   profileId, context, contextNote, challengeId, challengeStage, activityEndMs,
 *   metrics: {pulse:true, breath:true},
 *   title, onSaved(event), onCancel()
 * }
 */
export function mountMeasure(root, opts) {
  const metrics = { pulse: true, breath: true, ...(opts.metrics || {}) };
  const data = { pulse: null, breathing: null };
  const startedAt = Date.now();
  let cancelled = false;

  async function run() {
    if (metrics.pulse) await stepPulse();
    if (cancelled) return;
    if (metrics.breath) await stepBreath();
    if (cancelled) return;
    showSummary();
  }

  function elapsedFrom(iso) {
    if (!opts.activityEndMs) return null;
    return Math.max(0, Math.round((new Date(iso).getTime() - opts.activityEndMs) / 1000));
  }

  async function stepPulse() {
    for (;;) {
      const chooser = await chooseMethod('pulse');
      if (chooser === 'cancel') { cancelled = true; opts.onCancel && opts.onCancel(); return; }
      if (chooser === 'skip') return;
      const res = chooser === 'camera' ? await runCameraPulse(root) : await runManualCount(root, 'pulse');
      if (res.status === 'cancel') { cancelled = true; return; }
      if (res.status === 'done') { data.pulse = res.metric; data.pulse.elapsedSinceActivityEndSec = elapsedFrom(res.metric.sampledAt); return; }
      if (res.status === 'skip') return;
      if (res.status === 'manual') {
        const r2 = await runManualCount(root, 'pulse');
        if (r2.status === 'cancel') { cancelled = true; return; }
        if (r2.status === 'done') { data.pulse = r2.metric; data.pulse.elapsedSinceActivityEndSec = elapsedFrom(r2.metric.sampledAt); return; }
        if (r2.status === 'skip') return;
      }
    }
  }

  async function stepBreath() {
    for (;;) {
      const chooser = await chooseMethod('breath');
      if (chooser === 'cancel') { cancelled = true; opts.onCancel && opts.onCancel(); return; }
      if (chooser === 'skip') return;
      const res = chooser === 'mic' ? await runMicBreathing(root) : await runManualCount(root, 'breath');
      if (res.status === 'cancel') { cancelled = true; return; }
      if (res.status === 'done') { data.breathing = res.metric; data.breathing.elapsedSinceActivityEndSec = elapsedFrom(res.metric.sampledAt); return; }
      if (res.status === 'skip') return;
      if (res.status === 'manual') {
        const r2 = await runManualCount(root, 'breath');
        if (r2.status === 'cancel') { cancelled = true; return; }
        if (r2.status === 'done') { data.breathing = r2.metric; data.breathing.elapsedSinceActivityEndSec = elapsedFrom(r2.metric.sampledAt); return; }
        if (r2.status === 'skip') return;
      }
    }
  }

  function chooseMethod(kind) {
    return new Promise((resolve) => {
      const isPulse = kind === 'pulse';
      const sup = isPulse ? cameraSupport() : micSupport();
      const done = (v) => resolve(v);
      const profile = store.getProfile(opts.profileId);
      root.innerHTML = `
        <section class="panel" aria-labelledby="mm-h">
          <p class="context-line">פרופיל: <strong>${esc(profile ? profile.nickname : '')}</strong> · מצב: <strong>${esc(CONTEXTS[opts.context] || '')}${opts.contextNote ? ' — ' + esc(opts.contextNote) : ''}</strong></p>
          <h3 id="mm-h">${isPulse ? 'איך למדוד את הדופק?' : 'איך למדוד את קצב הנשימה?'}</h3>
          <div class="method-grid">
            <button class="method" id="m-sensor" ${sup.ok ? '' : 'disabled'}>
              <span class="m-title">${isPulse ? '📷 מצלמה (PPG)' : '🎙️ מיקרופון'} ${isPulse ? '' : '<span class="badge exp">ניסיוני</span>'}</span>
              <span class="m-desc">${isPulse ? 'אצבע על עדשת המצלמה האחורית, כ-34 שניות.' : 'הטלפון בעדינות ליד הפה והאף, 60 שניות במקום שקט.'}</span>
              ${sup.ok ? '' : `<span class="m-warn">${esc(sup.why)}</span>`}
            </button>
            <button class="method" id="m-manual">
              <span class="m-title">✋ ספירה ידנית בשעון עצר</span>
              <span class="m-desc">${isPulse ? 'ספירת פעימות בפרק כף היד, 30 או 60 שניות.' : 'ספירת נשימות, 30 או 60 שניות.'} עובד תמיד, בלי הרשאות.</span>
            </button>
          </div>
          <div class="btn-row">
            <button class="btn ghost" id="m-skip">דילוג על ${isPulse ? 'הדופק' : 'הנשימה'}</button>
            <button class="btn ghost" id="m-cancel">ביטול</button>
          </div>
        </section>`;
      root.querySelector('#m-sensor').addEventListener('click', () => done(isPulse ? 'camera' : 'mic'));
      root.querySelector('#m-manual').addEventListener('click', () => done('manual'));
      root.querySelector('#m-skip').addEventListener('click', () => done('skip'));
      root.querySelector('#m-cancel').addEventListener('click', () => done('cancel'));
    });
  }

  function showSummary() {
    const profile = store.getProfile(opts.profileId);
    const hasAny = data.pulse || data.breathing;
    root.innerHTML = `
      <section class="panel" aria-labelledby="sum-h">
        <h3 id="sum-h">כרטיס תוצאות</h3>
        <p class="context-line">פרופיל: <strong>${esc(profile ? profile.nickname : '')}</strong> · מצב: <strong>${esc(CONTEXTS[opts.context] || '')}${opts.contextNote ? ' — ' + esc(opts.contextNote) : ''}</strong> · ${esc(fmtDateTime(new Date(startedAt).toISOString()))}</p>
        ${hasAny ? resultCard(data) : '<p class="notice warn">לא נאספה אף מדידה. אפשר לחזור ולמדוד, או לצאת.</p>'}
        ${hasAny ? `<label class="field">הערה קצרה (אופציונלי)
          <input type="text" id="sum-note" maxlength="200" placeholder="למשל: עליתי במדרגות"></label>` : ''}
        <p class="hint">${data.pulse && data.breathing ? 'הדופק והנשימה נמדדו ברצף (לא בו-זמנית) — מוצגות חותמות הזמן של כל מדד.' : ''}</p>
        <div class="btn-row">
          ${hasAny ? '<button class="btn primary big" id="sum-save">שמירת המדידה</button>' : ''}
          <button class="btn secondary" id="sum-again">מדידה מחדש</button>
          <button class="btn ghost" id="sum-cancel">${hasAny ? 'ביטול ללא שמירה' : 'יציאה'}</button>
        </div>
      </section>`;
    wireReplay(root, data);
    announce('המדידה הסתיימה. אפשר לשמור את התוצאות');
    const save = root.querySelector('#sum-save');
    if (save) save.addEventListener('click', () => {
      const note = (root.querySelector('#sum-note').value || '').trim();
      const created = data.pulse ? data.pulse.sampledAt : data.breathing.sampledAt;
      const first = [data.pulse, data.breathing].filter(Boolean).map((m) => m.elapsedSinceActivityEndSec).filter((x) => x !== null && x !== undefined);
      try {
        const ev = store.addEvent({
          profileId: opts.profileId,
          context: opts.context,
          contextNote: opts.contextNote || '',
          createdAt: created,
          pulse: data.pulse,
          breathing: data.breathing,
          note,
          challengeId: opts.challengeId || null,
          challengeStage: opts.challengeStage || null,
          recoveryElapsedSec: first.length ? Math.min(...first) : null,
        });
        toast('המדידה נשמרה');
        if (opts.onSaved) opts.onSaved(ev); else showSaved(ev);
      } catch (err) {
        toast('השמירה נכשלה: ' + err.message);
      }
    });
    root.querySelector('#sum-again').addEventListener('click', () => {
      data.pulse = null; data.breathing = null; cancelled = false;
      run();
    });
    root.querySelector('#sum-cancel').addEventListener('click', () => { opts.onCancel && opts.onCancel(); });
  }

  function showSaved(ev) {
    root.innerHTML = `
      <section class="panel" role="status">
        <h3>✔ המדידה נשמרה</h3>
        <p>התוצאה נשמרה במכשיר זה בלבד.</p>
        <div class="btn-row">
          <a class="btn primary" href="#/records/history">לרשומות שלי</a>
          <a class="btn secondary" href="#/measure">מדידה נוספת</a>
          <a class="btn ghost" href="#/">למסך הראשי</a>
        </div>
      </section>`;
  }

  run();
  return { destroy() { cancelled = true; } };
}

// ---------- כרטיס תוצאות משולב (משמש גם את הרשומות) ----------
export function metricLine(kind, m) {
  if (!m) return '';
  const val = kind === 'pulse' ? m.bpm : m.rpm;
  const unit = kind === 'pulse' ? 'פעימות לדקה' : 'נשימות לדקה';
  const cls = kind === 'pulse' ? 'pulse' : 'breath';
  const experimental = m.source === 'measured_microphone' ? ' <span class="badge exp">ניסיוני</span>' : '';
  const demo = m.source === 'demo_simulated' ? ' <span class="badge sim">הדגמה</span>' : '';
  return `<div class="res res-${cls}">
    <div class="res-head">${kind === 'pulse' ? '❤ דופק' : '🫁 נשימה'}${experimental}${demo}</div>
    <div class="kpi"><span class="kpi-num ${cls}">${val}</span><span class="kpi-unit">${unit}</span></div>
    <dl class="res-meta">
      <div><dt>מקור</dt><dd>${esc(SOURCES[m.source] || m.source)}</dd></div>
      <div><dt>איכות</dt><dd>${esc(QUALITY[m.quality] || '')}</dd></div>
      <div><dt>זמן מדידה</dt><dd>${esc(fmtDateTime(m.sampledAt))}</dd></div>
      <div><dt>משך</dt><dd>${m.durationSec} שנ׳</dd></div>
      ${m.elapsedSinceActivityEndSec !== null && m.elapsedSinceActivityEndSec !== undefined ? `<div><dt>מתום הפעילות</dt><dd>${fmtClock(m.elapsedSinceActivityEndSec)}</dd></div>` : ''}
    </dl>
  </div>`;
}

export function resultCard(ev) {
  const p = ev.pulse, b = ev.breathing;
  const pTimes = p && p.beatTimesMs && p.beatTimesMs.length;
  const bTimes = b && b.breathTimesMs && b.breathTimesMs.length;
  let html = `<div class="result-card">${metricLine('pulse', p)}${metricLine('breath', b)}</div>`;
  if (p && !pTimes) html += '<p class="hint">לדופק נשמר ערך ממוצע בלבד (אין זמני פעימות), לכן לא מוצג גרף פעימות.</p>';
  if (pTimes) {
    html += p.method === 'tap'
      ? tapTimeline(p, 'pulse')
      : beatTimeline({ events: p.beatTimesMs, durationMs: p.durationSec * 1000, color: PULSE_COLOR, label: 'פעימות שזוהו במדידה', desc: `${p.beatTimesMs.length} פעימות` });
    if (audioSupported()) html += '<button class="btn secondary small" data-replay="pulse">🔊 השמעת הפעימות שנמדדו</button>';
  }
  if (bTimes) {
    html += b.method === 'tap'
      ? tapTimeline(b, 'breath')
      : beatTimeline({ events: b.breathTimesMs, durationMs: b.durationSec * 1000, color: BREATH_COLOR, label: 'נשימות שזוהו במדידה', desc: `${b.breathTimesMs.length} נשימות` });
  }
  return html;
}

// השמעת טיקים לפי זמני הפעימות שנמדדו (רק אחרי לחיצה)
export function wireReplay(root, ev) {
  root.querySelectorAll('[data-replay="pulse"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ctx = ensureAudio();
      if (!ctx || !ev.pulse || !ev.pulse.beatTimesMs.length) return;
      const t0 = ctx.currentTime + 0.1;
      ev.pulse.beatTimesMs.forEach((ms) => tick(t0 + ms / 1000, { freq: 880 }));
    });
  });
}
