// ספירה ידנית עם שעון עצר (דופק או נשימה), ואפשרות משנית להקשה בכל אירוע.
// חלופה חיונית: פועלת בלי כל הרשאה ובכל מכשיר.

import { onAbort } from './permissions.js';
import { bpmFromCount } from './dsp.js';
import { beatTimeline } from './charts.js';
import { esc, fmtClock, announce } from './util.js';
import { PULSE_COLOR, BREATH_COLOR } from './constants.js';
import { ensureAudio, tick, audioSupported } from './audio.js';

const CFG = {
  pulse: {
    title: 'ספירת דופק ידנית',
    unit: 'פעימות לדקה',
    eventWord: 'פעימות',
    max: 500, lo: 20, hi: 300,
    color: PULSE_COLOR,
    how: `<li>הניחו שתי אצבעות (לא אגודל) על פרק כף היד, בצד האגודל, או בעדינות על הצוואר — <strong>בלי ללחוץ חזק, במיוחד בצוואר</strong>.</li>
          <li>לחצו "התחלה" וספרו כל פעימה עד סיום הזמן.</li>`,
    tapHelp: 'אפשר במקום זאת להקיש על הכפתור הגדול בכל פעימה — כך נרשם ציר זמן של הקשות (לא מדידת מצלמה).',
  },
  breath: {
    title: 'ספירת נשימות ידנית',
    unit: 'נשימות לדקה',
    eventWord: 'נשימות',
    max: 150, lo: 2, hi: 90,
    color: BREATH_COLOR,
    how: `<li>שבו בנוחות. ספרו את מספר הפעמים שהחזה או הבטן עולים (שאיפה + נשיפה = נשימה אחת).</li>
          <li>כשאפשר, מדדו נשימה של מישהו בלי שיתמקד בה — מודעות משנה את הקצב.</li>`,
    tapHelp: 'הקשה בכל נשימה היא חלופה משנית; ספירה פשוטה לרוב נוחה ומדויקת יותר.',
  },
};

export function runManualCount(root, kind) {
  const cfg = CFG[kind];
  return new Promise((resolve) => {
    let timer = null, finished = false;
    const unAbort = onAbort(() => finish({ status: 'cancel' }));
    function finish(r) {
      if (finished) return;
      finished = true;
      if (timer) clearInterval(timer);
      unAbort();
      resolve(r);
    }

    function showSetup() {
      root.innerHTML = `
        <section class="panel" aria-labelledby="mc-h">
          <h3 id="mc-h">${cfg.title}</h3>
          <ol class="steps">${cfg.how}</ol>
          <fieldset class="seg">
            <legend>משך הספירה</legend>
            <label><input type="radio" name="mc-dur" value="30" checked> 30 שניות</label>
            <label><input type="radio" name="mc-dur" value="60"> 60 שניות</label>
          </fieldset>
          <label class="check"><input type="checkbox" id="mc-tap"> תיעוד בהקשות (משני) — ${esc(cfg.tapHelp)}</label>
          ${audioSupported() ? '<label class="check"><input type="checkbox" id="mc-beep"> צליל קצר בסיום הספירה (ברירת מחדל: כבוי)</label>' : ''}
          <div class="btn-row">
            <button class="btn primary big" id="mc-start">התחלה</button>
            <button class="btn ghost" id="mc-skip">דילוג</button>
          </div>
        </section>`;
      root.querySelector('#mc-start').addEventListener('click', () => {
        const dur = Number(root.querySelector('input[name="mc-dur"]:checked').value);
        const tap = root.querySelector('#mc-tap').checked;
        const beep = !!(root.querySelector('#mc-beep') && root.querySelector('#mc-beep').checked);
        if (beep) ensureAudio();
        startRun(dur, tap, beep);
      });
      root.querySelector('#mc-skip').addEventListener('click', () => finish({ status: 'skip' }));
    }

    function startRun(dur, tap, beep) {
      const startMs = performance.now();
      const startWall = Date.now();
      const taps = [];
      root.innerHTML = `
        <section class="panel" aria-labelledby="mc-run-h">
          <h3 id="mc-run-h">${tap ? 'מקישים' : 'סופרים'}… ${esc(cfg.eventWord)}</h3>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="mc-prog"><div class="bar" id="mc-bar"></div></div>
          <p class="big-num" id="mc-left">${fmtClock(dur)}</p>
          ${tap ? `<p class="tap-count" id="mc-count" aria-live="off">0</p>
          <button class="btn tap" id="mc-tapbtn" style="--tap:${cfg.color}">הקישו בכל ${kind === 'pulse' ? 'פעימה' : 'נשימה'}</button>` : '<p class="hint">ספרו בשקט את ה' + esc(cfg.eventWord) + ' עד שהשעון יסתיים.</p>'}
          <div class="btn-row"><button class="btn ghost" id="mc-cancel">ביטול</button></div>
        </section>`;
      if (tap) {
        const btn = root.querySelector('#mc-tapbtn');
        const handler = (e) => {
          e.preventDefault();
          taps.push(Math.round(performance.now() - startMs));
          root.querySelector('#mc-count').textContent = String(taps.length);
        };
        btn.addEventListener('pointerdown', handler);
        btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') handler(e); });
      }
      root.querySelector('#mc-cancel').addEventListener('click', () => { clearInterval(timer); showSetup(); });
      timer = setInterval(() => {
        const el = (performance.now() - startMs) / 1000;
        const left = Math.max(0, dur - el);
        const bar = root.querySelector('#mc-bar');
        if (!bar) return;
        bar.style.width = Math.min(100, (el / dur) * 100) + '%';
        root.querySelector('#mc-prog').setAttribute('aria-valuenow', String(Math.round((el / dur) * 100)));
        root.querySelector('#mc-left').textContent = fmtClock(Math.ceil(left));
        if (el >= dur) {
          clearInterval(timer); timer = null;
          if (navigator.vibrate) navigator.vibrate(200);
          if (beep) tick(undefined, { freq: 660, dur: 0.25, gain: 0.5 });
          showEntry(dur, tap, taps.filter((x) => x <= dur * 1000), startWall);
        }
      }, 100);
    }

    function showEntry(dur, tap, taps, startWall) {
      announce('הזמן הסתיים. הזינו את המספר שנספר');
      root.innerHTML = `
        <section class="panel" aria-labelledby="mc-end-h">
          <h3 id="mc-end-h">הזמן הסתיים</h3>
          <label class="field">כמה ${esc(cfg.eventWord)} ${tap ? 'הוקשו' : 'ספרתם'} ב-${dur} שניות?
            <input type="number" id="mc-n" inputmode="numeric" min="0" max="${cfg.max}" step="1" value="${tap ? taps.length : ''}" autofocus>
          </label>
          <p class="result-line" id="mc-calc" aria-live="polite"></p>
          <div class="btn-row">
            <button class="btn primary" id="mc-ok" disabled>שימוש בתוצאה</button>
            <button class="btn secondary" id="mc-redo">ספירה חוזרת</button>
            <button class="btn ghost" id="mc-skip">דילוג</button>
          </div>
        </section>`;
      const inp = root.querySelector('#mc-n');
      const ok = root.querySelector('#mc-ok');
      const calc = root.querySelector('#mc-calc');
      let value = null;
      const update = () => {
        const raw = inp.value.trim();
        const n = Number(raw);
        value = null;
        ok.disabled = true;
        if (raw === '' || !Number.isInteger(n) || n < 0) { calc.textContent = ''; return; }
        const rate = bpmFromCount(n, dur);
        if (rate === null || rate < cfg.lo || rate > cfg.hi) {
          calc.innerHTML = `<span class="notice warn">הערך (${esc(rate)} ${esc(cfg.unit)}) נראה לא סביר — בדקו את הספירה.</span>`;
          return;
        }
        value = rate;
        calc.innerHTML = `<strong class="kpi-inline ${kind}">${rate}</strong> ${esc(cfg.unit)} <span class="hint">(${n} × ${60 / dur})</span>`;
        ok.disabled = false;
      };
      inp.addEventListener('input', update);
      update();
      ok.addEventListener('click', () => {
        if (value === null) return;
        const times = tap ? taps : [];
        const metric = {
          source: tap ? 'measured_manual' : 'counted_manual',
          method: tap ? 'tap' : 'count',
          sampledAt: new Date(startWall).toISOString(),
          durationSec: dur,
          quality: 'manual',
        };
        if (kind === 'pulse') { metric.bpm = value; metric.beatTimesMs = times; }
        else { metric.rpm = value; metric.breathTimesMs = times; }
        // הצגת ציר ההקשות (אם נאספו) לפני החזרה
        finish({ status: 'done', metric });
      });
      root.querySelector('#mc-redo').addEventListener('click', showSetup);
      root.querySelector('#mc-skip').addEventListener('click', () => finish({ status: 'skip' }));
      inp.focus();
    }

    showSetup();
  });
}

// תצוגת ציר ההקשות בכרטיס תוצאות (ראו measure.js)
export function tapTimeline(metric, kind) {
  const arr = kind === 'pulse' ? metric.beatTimesMs : metric.breathTimesMs;
  if (!arr || !arr.length) return '';
  return beatTimeline({
    events: arr, durationMs: metric.durationSec * 1000, color: CFG[kind].color,
    label: 'הקשות משתמש (לא מדידת חיישן)', desc: `${arr.length} הקשות`,
  });
}
