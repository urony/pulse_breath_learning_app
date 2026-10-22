// גלריית המחשות קצב: קווים אנכיים על ציר זמן וצפצוף/טיק לכל פעימה מדומה.
// אין תרשימי אק"ג. כל התוכן מסומן "הדגמה". שום צליל אינו מתחיל בלי לחיצת משתמש.

import { beatTimeline } from './charts.js';
import { ensureAudio, tick, stopAllSounds, startRumble, audioSupported } from './audio.js';
import { onAbort } from './permissions.js';
import { esc } from './util.js';
import { PULSE_COLOR, RHYTHM_DISCLAIMER } from './constants.js';

export const LOOP_MS = 12000;

function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// מחזיר { beats:[ms], special:[indexes], silent:boolean }
export function buildPattern(id, variant) {
  const beats = [];
  const special = [];
  if (id === 'sinus') {
    const r = lcg(11);
    for (let t = 200; t < LOOP_MS - 300; t += 800 + (r() - 0.5) * 40) beats.push(Math.round(t));
  } else if (id === 'tachy') {
    const r = lcg(12);
    for (let t = 150; t < LOOP_MS - 150; t += 444 + (r() - 0.5) * 10) beats.push(Math.round(t));
  } else if (id === 'brady') {
    const r = lcg(13);
    for (let t = 300; t < LOOP_MS - 500; t += 1333 + (r() - 0.5) * 60) beats.push(Math.round(t));
  } else if (id === 'af') {
    const r = lcg(14);
    let t = 200;
    while (t < LOOP_MS - 350) { beats.push(Math.round(t)); t += 280 + r() * 520; }
  } else if (id === 'premature') {
    // פעימות בקצב 75 לדקה; כל חמישית מגיעה מוקדם, והבאה אחריה בזמנה (הפסקה ארוכה יותר)
    for (let k = 0, base = 400; base < LOOP_MS - 300; k++, base += 800) {
      if (k % 5 === 4) { beats.push(base - 360); special.push(beats.length - 1); } else beats.push(base);
    }
  } else if (id === 'flutter') {
    if (variant === 'irregular') {
      const r = lcg(15);
      const gaps = [400, 600, 800];
      let t = 200;
      while (t < LOOP_MS - 500) { beats.push(Math.round(t)); t += gaps[Math.floor(r() * 3)]; }
    } else {
      for (let t = 200; t < LOOP_MS - 300; t += 400) beats.push(t);
    }
  } else if (id === 'vf') {
    return { beats: [], special: [], silent: true };
  }
  return { beats, special, silent: false };
}

let active = null; // נגן פעיל יחיד
let unAbort = null;

export function stopRhythm() {
  if (active) { active.stop(); active = null; }
  stopAllSounds();
}

class Player {
  constructor(card, def, getVariant) {
    this.card = card;
    this.def = def;
    this.getVariant = getVariant;
    this.raf = 0;
    this.sched = 0;
    this.playing = false;
  }

  start(withSound) {
    stopRhythm();
    active = this;
    this.playing = true;
    this.pattern = buildPattern(this.def.id, this.getVariant());
    this.sound = withSound && audioSupported();
    this.loopsScheduled = 0;
    const fig = this.card.querySelector('.timeline');
    this.ph = fig.querySelector('.playhead');
    this.heart = this.card.querySelector('.heart');
    this.m = Number(fig.dataset.mL);
    this.pw = Number(fig.dataset.pw);
    this.ph.setAttribute('visibility', 'visible');
    this.perf0 = performance.now() + 60;
    this.lastPos = -1;
    this.lastLoop = -1;

    if (this.sound) {
      const ctx = ensureAudio();
      this.ctx0 = ctx.currentTime + 0.06;
      this.scheduleAhead();
      this.sched = setInterval(() => this.scheduleAhead(), 400);
      if (this.pattern.silent) startRumble();
    }
    this.card.classList.add('playing');
    this.card.querySelector('[data-act="stop"]').disabled = false;
    const loop = () => {
      if (!this.playing) return;
      const el = performance.now() - this.perf0;
      if (el >= 0) {
        const loopIdx = Math.floor(el / LOOP_MS);
        const pos = el - loopIdx * LOOP_MS;
        this.ph.setAttribute('x1', this.m + (pos / LOOP_MS) * this.pw);
        this.ph.setAttribute('x2', this.m + (pos / LOOP_MS) * this.pw);
        const from = loopIdx !== this.lastLoop ? -1 : this.lastPos;
        this.pattern.beats.forEach((b, i) => {
          if (b > from && b <= pos) this.flash(this.pattern.special.includes(i));
        });
        this.lastPos = pos;
        this.lastLoop = loopIdx;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  scheduleAhead() {
    const ctx = ensureAudio();
    while (this.ctx0 + (this.loopsScheduled * LOOP_MS) / 1000 < ctx.currentTime + 2.5) {
      const base = this.ctx0 + (this.loopsScheduled * LOOP_MS) / 1000;
      this.pattern.beats.forEach((b, i) => {
        const sp = this.pattern.special.includes(i);
        tick(base + b / 1000, { freq: sp ? 520 : 880, gain: 0.5, dur: sp ? 0.1 : 0.07 });
      });
      this.loopsScheduled++;
    }
  }

  flash(special) {
    if (!this.heart) return;
    this.heart.classList.remove('beat', 'beat-early');
    void this.heart.getBoundingClientRect(); // הפעלה מחדש של האנימציה
    this.heart.classList.add(special ? 'beat-early' : 'beat');
  }

  stop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    clearInterval(this.sched);
    if (this.ph) this.ph.setAttribute('visibility', 'hidden');
    if (this.heart) this.heart.classList.remove('beat', 'beat-early');
    this.card.classList.remove('playing');
    const stopBtn = this.card.querySelector('[data-act="stop"]');
    if (stopBtn) stopBtn.disabled = true;
  }
}

function timelineFor(def, variant) {
  const p = buildPattern(def.id, variant);
  return beatTimeline({
    events: p.beats,
    durationMs: LOOP_MS,
    color: PULSE_COLOR,
    simulated: true,
    highlight: p.special,
    label: `המחשה: ${def.title}`,
    emptyLabel: 'אין פעימות דופק אפקטיביות',
    desc: p.silent ? 'ציר זמן ללא פעימות — המחשת פרפור חדרים' : `${p.beats.length} פעימות מדומות ב-12 שניות`,
  });
}

// בונה את הגלריה לתוך root. content = תוכן rhythms.json
export function mountGallery(root, content) {
  const variants = {};
  root.innerHTML = `
    <p class="lead">${esc(content.intro)}</p>
    <p class="notice sim-notice">${esc(RHYTHM_DISCLAIMER)}</p>
    <div class="rhythm-list">
      ${content.items.map((d) => `
        <article class="rhythm-card ${d.emergency ? 'emergency' : ''}" id="rc-${d.id}" data-id="${d.id}">
          <h3>
            <button class="acc-btn" aria-expanded="false" aria-controls="rb-${d.id}">
              <span>${esc(d.title)}</span><span class="badge sim">הדגמה</span><span class="chev" aria-hidden="true">▾</span>
            </button>
          </h3>
          <div class="rc-body" id="rb-${d.id}" hidden>
            <p class="notice sim-notice small">${esc(RHYTHM_DISCLAIMER)}</p>
            <p class="short">${esc(d.short)}</p>
            ${d.emergency ? `<p class="notice danger" role="note">${esc(d.emergency)}</p>` : ''}
            ${d.variants ? `<fieldset class="seg"><legend>גרסה</legend>${d.variants.map((v, i) => `<label><input type="radio" name="var-${d.id}" value="${v.id}" ${i === 0 ? 'checked' : ''}> ${esc(v.label)}</label>`).join('')}</fieldset>` : ''}
            <div class="tl-host"></div>
            <div class="heart-row"><span class="heart" aria-hidden="true">♥</span>
              <div class="btn-row">
                ${audioSupported() ? '<button class="btn primary" data-act="sound">▶ הפעלה עם צליל</button>' : ''}
                <button class="btn secondary" data-act="silent">▶ הפעלה ללא צליל</button>
                <button class="btn ghost" data-act="stop" disabled>■ עצירה והשתקה</button>
              </div>
            </div>
            <p class="details">${esc(d.details)}</p>
            <p class="limits"><strong>מגבלות:</strong> ${esc(d.limits)}</p>
          </div>
        </article>`).join('')}
    </div>`;

  root.querySelectorAll('.rhythm-card').forEach((card) => {
    const def = content.items.find((d) => d.id === card.dataset.id);
    const getVariant = () => {
      const r = card.querySelector(`input[name="var-${def.id}"]:checked`);
      return r ? r.value : undefined;
    };
    variants[def.id] = getVariant;
    const host = card.querySelector('.tl-host');
    const render = () => { host.innerHTML = timelineFor(def, getVariant()); };
    render();
    const player = new Player(card, def, getVariant);
    const btn = card.querySelector('.acc-btn');
    const body = card.querySelector('.rc-body');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      body.hidden = open;
      if (open && active === player) stopRhythm();
    });
    card.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', () => { if (active === player) stopRhythm(); render(); }));
    const snd = card.querySelector('[data-act="sound"]');
    if (snd) snd.addEventListener('click', () => player.start(true));
    card.querySelector('[data-act="silent"]').addEventListener('click', () => player.start(false));
    card.querySelector('[data-act="stop"]').addEventListener('click', () => stopRhythm());
  });

  if (unAbort) unAbort();
  unAbort = onAbort(() => stopRhythm());
}

// השוואה בין "המדידה שלי" לבין המחשה: שתי שורות בלבד, עם סימון מקור
export function compareRows(event, content, rhythmId) {
  const def = content.items.find((d) => d.id === rhythmId) || content.items[0];
  const p = buildPattern(def.id, undefined);
  const mine = event && event.pulse;
  let myRow;
  if (!mine) {
    myRow = '<p class="notice">במדידה שנבחרה אין נתוני דופק.</p>';
  } else if (mine.beatTimesMs && mine.beatTimesMs.length) {
    myRow = beatTimeline({
      events: mine.beatTimesMs, durationMs: LOOP_MS, color: PULSE_COLOR, simulated: false,
      label: `המדידה שלי (${mine.bpm} פעימות לדקה)`, desc: 'זמני פעימות שנמדדו',
    });
  } else {
    myRow = `<div class="chart"><p class="chart-title">המדידה שלי <span class="badge real">נמדד</span></p><p>${mine.bpm} פעימות לדקה — נשמר ערך ממוצע בלבד, ללא זמני פעימות, ולכן אין ציר פעימות להצגה.</p></div>`;
  }
  return `${myRow}${timelineFor(def)}
    <p class="hint">מוצגות 12 השניות הראשונות. השוואה חזותית בלבד — אין דירוג דמיון ואין התאמה להפרעת קצב.</p>`;
}
