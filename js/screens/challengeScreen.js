// אתגר "איך הגוף מתאושש?": מסלול מודרך — בסיס, פעילות, מדידה מיד אחריה, והתאוששות.

import * as store from '../storage.js';
import { mountMeasure } from '../measure.js';
import { editProfileDialog } from '../profiles.js';
import { recoveryView, demoChallengeEvents } from '../recovery.js';
import { onAbort } from '../permissions.js';
import { esc, uid, fmtClock, confirmDialog, announce } from '../util.js';

const SKEY = 'pbl.challenge';
const TARGETS = [60, 120, 180];
const ACTIVITIES = {
  jump: 'קפיצות במקום',
  march: 'צעידה במקום',
  step: 'עלייה וירידה ממדרגה',
  other: 'פעילות אחרת שמתאימה לי',
};

function loadState() {
  try { return JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch { return null; }
}
function saveState(s) {
  try { if (s) sessionStorage.setItem(SKEY, JSON.stringify(s)); else sessionStorage.removeItem(SKEY); } catch { /* ignore */ }
}

export function challengeScreen(root, params) {
  let st = loadState();
  if (st && !store.getProfile(st.profileId)) { st = null; saveState(null); }
  let clock = null;
  const stopClock = () => { if (clock) { clearInterval(clock); clock = null; } };
  onAbort(stopClock);

  root.innerHTML = '<h1 tabindex="-1">אתגר ההתאוששות — איך הגוף מתאושש?</h1><div id="ch-body"></div>';
  const body = root.querySelector('#ch-body');

  const go = (stage, patch = {}) => {
    st = { ...st, ...patch, stage };
    saveState(st);
    render();
    window.scrollTo(0, 0);
  };
  const challengeEvents = () => store.getEvents().filter((e) => e.challengeId === st.challengeId);

  function render() {
    stopClock();
    if (!st) return renderSetup();
    switch (st.stage) {
      case 'baseline': return renderBaseline();
      case 'activity': return renderActivity();
      case 'immediate': return renderImmediate();
      case 'recovery': return renderRecovery();
      case 'summary': return renderSummary();
      default: return renderSetup();
    }
  }

  // ---------- 0. הקדמה והגדרה ----------
  function renderSetup() {
    const profiles = store.getProfiles();
    body.innerHTML = `
      <div class="panel">
        <h2>מה בודקים?</h2>
        <p>כיצד הלב והנשימה מגיבים למאמץ קצר, ואיך הם חוזרים בהדרגה לכיוון רמת המנוחה.</p>
        <ol class="steps">
          <li><strong>הסבר</strong> (המסך הזה).</li>
          <li><strong>מדידת בסיס במנוחה</strong> — ישיבה שקטה כמה דקות, ואז דופק ונשימה.</li>
          <li><strong>פעילות קצרה מותאמת אישית</strong> — לא חובה.</li>
          <li><strong>מדידה מיד אחרי</strong> הפעילות, במהירות האפשרית.</li>
          <li><strong>התאוששות</strong> — מדידות חוזרות כעבור כדקה, שתי דקות ושלוש דקות.</li>
          <li><strong>סיכום</strong> — גרפים והפרשים מהבסיס.</li>
        </ol>
        <p class="notice safety" role="note"><strong>בטיחות:</strong> בצעו פעילות שמתאימה ליכולת שלכם ולהנחיות המורה. אפשר לדלג על הפעילות ולהשתמש בנתוני הדגמה. עצרו מיד באי נוחות, סחרחורת, קוצר נשימה חריג או כאב בחזה.</p>
      </div>
      ${profiles.length ? `
      <form class="panel" id="ch-form" novalidate>
        <label class="field">מי משתתף?
          <select id="ch-prof">${profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.nickname)}</option>`).join('')}</select></label>
        <label class="field">איזו פעילות?
          <select id="ch-act">${Object.entries(ACTIVITIES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label class="field">משך הפעילות
          <select id="ch-dur"><option value="30">30 שניות</option><option value="60" selected>60 שניות</option><option value="90">90 שניות</option><option value="120">2 דקות</option></select></label>
        <div class="btn-row">
          <button class="btn primary big" type="submit">התחלת האתגר</button>
          <button class="btn secondary" type="button" id="ch-demo">הצגה בנתוני הדגמה (בלי מאמץ)</button>
          <button class="btn ghost" type="button" id="ch-new">+ פרופיל חדש</button>
        </div>
      </form>` : `
      <div class="panel"><p>כדי לבצע את האתגר צריך פרופיל מקומי.</p>
        <div class="btn-row"><button class="btn primary big" id="ch-new">יצירת פרופיל</button>
        <button class="btn secondary" id="ch-demo">הצגה בנתוני הדגמה</button></div></div>`}`;
    const newBtn = body.querySelector('#ch-new');
    if (newBtn) newBtn.addEventListener('click', async () => { if (await editProfileDialog()) renderSetup(); });
    body.querySelector('#ch-demo').addEventListener('click', () => renderDemo());
    const form = body.querySelector('#ch-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      st = {
        challengeId: uid(),
        profileId: body.querySelector('#ch-prof').value,
        activity: body.querySelector('#ch-act').value,
        durationSec: Number(body.querySelector('#ch-dur').value),
        activityEndMs: null,
      };
      go('baseline');
    });
  }

  function renderDemo() {
    let combined = false;
    const draw = () => {
      body.innerHTML = `
        <div class="panel">
          <h2>דוגמה בנתוני הדגמה</h2>
          <p class="hint">כך נראה סיכום אתגר. הנתונים מדומים (ללא מדידה ובלי מאמץ) ואינם נשמרים.</p>
          <fieldset class="seg"><legend>תצוגה</legend>
            <label><input type="radio" name="dm" value="sep" ${combined ? '' : 'checked'}> גרפים נפרדים</label>
            <label><input type="radio" name="dm" value="comb" ${combined ? 'checked' : ''}> גרף משולב (שני צירים)</label>
          </fieldset>
          <div id="dm-view">${recoveryView(demoChallengeEvents(), { demo: true, combined })}</div>
          <div class="btn-row"><button class="btn primary" id="dm-back">חזרה להגדרות האתגר</button></div>
        </div>`;
      body.querySelectorAll('input[name="dm"]').forEach((r) => r.addEventListener('change', () => { combined = r.value === 'comb'; draw(); }));
      body.querySelector('#dm-back').addEventListener('click', () => renderSetup());
    };
    draw();
    window.scrollTo(0, 0);
  }

  const profileName = () => { const p = store.getProfile(st.profileId); return p ? p.nickname : ''; };
  const header = (n, title) => `<div class="stepper" aria-label="התקדמות">שלב ${n} מתוך 4 · ${esc(profileName())}</div><h2>${title}</h2>`;

  // ---------- 1. בסיס ----------
  function renderBaseline() {
    const done = challengeEvents().find((e) => e.challengeStage === 'baseline');
    if (done) { go('activity'); return; }
    body.innerHTML = `
      <div class="panel">
        ${header(1, 'מדידת בסיס במנוחה')}
        <p>שבו בשקט כמה דקות לפני המדידה, בלי לדבר ובלי להתאמץ. אפשר להפעיל שעון מנוחה של 3 דקות (לא חובה).</p>
        <p class="big-num" id="rest-clock" aria-live="off">3:00</p>
        <div class="btn-row">
          <button class="btn secondary" id="rest-start">הפעלת שעון מנוחה</button>
          <button class="btn primary big" id="base-go">מדידת בסיס</button>
        </div>
        <div class="btn-row"><button class="btn ghost small" id="ch-quit">יציאה מהאתגר</button></div>
      </div>`;
    let restStart = 0;
    body.querySelector('#rest-start').addEventListener('click', () => {
      restStart = Date.now();
      stopClock();
      clock = setInterval(() => {
        const left = 180 - (Date.now() - restStart) / 1000;
        const el = body.querySelector('#rest-clock');
        if (!el) return stopClock();
        el.textContent = fmtClock(Math.ceil(Math.max(0, left)));
        if (left <= 0) { stopClock(); announce('זמן המנוחה הסתיים. אפשר למדוד'); }
      }, 500);
    });
    body.querySelector('#ch-quit').addEventListener('click', quit);
    body.querySelector('#base-go').addEventListener('click', () => {
      stopClock();
      body.innerHTML = '<div id="ch-measure"></div>';
      mountMeasure(body.querySelector('#ch-measure'), {
        profileId: st.profileId, context: 'rest', challengeId: st.challengeId, challengeStage: 'baseline',
        onSaved: () => go('activity'),
        onCancel: () => renderBaseline(),
      });
    });
  }

  async function quit() {
    if (await confirmDialog('יציאה מהאתגר', 'המדידות שכבר נשמרו יישארו ברשומות. לצאת מהאתגר?', 'יציאה')) {
      saveState(null); st = null; renderSetup();
    }
  }

  // ---------- 2. פעילות ----------
  function renderActivity() {
    body.innerHTML = `
      <div class="panel">
        ${header(2, 'פעילות קצרה')}
        <p>פעילות: <strong>${esc(ACTIVITIES[st.activity] || '')}</strong> במשך <strong>${fmtClock(st.durationSec)}</strong>. בצעו בקצב שמתאים לכם.</p>
        <p class="notice safety" role="note">עצרו מיד באי נוחות, סחרחורת, קוצר נשימה חריג או כאב בחזה.</p>
        <p class="big-num" id="act-clock" aria-live="off">${fmtClock(st.durationSec)}</p>
        <div class="btn-row">
          <button class="btn primary big" id="act-start">התחלת הפעילות</button>
          <button class="btn secondary" id="act-done" hidden>סיימתי</button>
          <button class="btn danger" id="act-stop" hidden>עצירה — לא מרגיש/ה טוב</button>
        </div>
        <div class="btn-row"><button class="btn ghost small" id="act-demo">דילוג על הפעילות — נתוני הדגמה</button>
        <button class="btn ghost small" id="ch-quit">יציאה מהאתגר</button></div>
      </div>`;
    const finishActivity = (stopped) => {
      stopClock();
      go('immediate', { activityEndMs: Date.now(), stoppedEarly: !!stopped });
    };
    body.querySelector('#ch-quit').addEventListener('click', quit);
    body.querySelector('#act-demo').addEventListener('click', () => renderDemo());
    body.querySelector('#act-start').addEventListener('click', () => {
      const t0 = Date.now();
      body.querySelector('#act-start').hidden = true;
      body.querySelector('#act-done').hidden = false;
      body.querySelector('#act-stop').hidden = false;
      announce('הפעילות התחילה');
      clock = setInterval(() => {
        const left = st.durationSec - (Date.now() - t0) / 1000;
        const el = body.querySelector('#act-clock');
        if (!el) return stopClock();
        el.textContent = fmtClock(Math.ceil(Math.max(0, left)));
        if (left <= 0) { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); finishActivity(false); }
      }, 250);
    });
    body.querySelector('#act-done').addEventListener('click', () => finishActivity(false));
    body.querySelector('#act-stop').addEventListener('click', () => finishActivity(true));
  }

  // ---------- 3. מיד אחרי ----------
  function elapsedNow() { return st.activityEndMs ? (Date.now() - st.activityEndMs) / 1000 : 0; }
  function renderImmediate() {
    const done = challengeEvents().find((e) => e.challengeStage === 'immediate');
    if (done) { go('recovery'); return; }
    body.innerHTML = `
      <div class="panel">
        ${header(3, 'מדידה מיד אחרי הפעילות')}
        ${st.stoppedEarly ? '<p class="notice warn" role="alert">עצרתם את הפעילות. שבו, נשמו ברוגע, ואם התחושה אינה חולפת או שיש כאב בחזה, קוצר נשימה חריג או סחרחורת — פנו לעזרה. אפשר להמשיך למדוד כשמרגישים טוב.</p>' : ''}
        <p>מדדו במהירות האפשרית. הזמן שחלף מתום הפעילות נרשם עם כל מדידה:</p>
        <p class="big-num" id="el-clock" aria-live="off">${fmtClock(elapsedNow())}</p>
        <div class="btn-row"><button class="btn primary big" id="imm-go">מדידה עכשיו</button></div>
        <div class="btn-row"><button class="btn ghost small" id="ch-quit">יציאה מהאתגר</button></div>
      </div>`;
    clock = setInterval(() => { const el = body.querySelector('#el-clock'); if (!el) return stopClock(); el.textContent = fmtClock(elapsedNow()); }, 500);
    body.querySelector('#ch-quit').addEventListener('click', quit);
    body.querySelector('#imm-go').addEventListener('click', () => {
      stopClock();
      body.innerHTML = '<div id="ch-measure"></div>';
      mountMeasure(body.querySelector('#ch-measure'), {
        profileId: st.profileId, context: 'effort', challengeId: st.challengeId, challengeStage: 'immediate',
        activityEndMs: st.activityEndMs,
        onSaved: () => go('recovery'),
        onCancel: () => renderImmediate(),
      });
    });
  }

  // ---------- 4. התאוששות ----------
  function renderRecovery() {
    const recs = challengeEvents().filter((e) => e.challengeStage === 'recovery');
    const metricsSel = st.recMetrics || { pulse: true, breath: true };
    body.innerHTML = `
      <div class="panel">
        ${header(4, 'התאוששות — מדידות חוזרות')}
        <p>עברו: <strong class="big-inline" id="el-clock">${fmtClock(elapsedNow())}</strong> מתום הפעילות. מדדו כעבור כדקה, שתי דקות ושלוש דקות — הזמן האמיתי של כל מדידה נרשם.</p>
        <p class="hint">מדידה אחת (דופק ונשימה) נמשכת בין חצי דקה לכמה דקות, ולכן ייתכן שנקודות המדידה יתחפפו. לא נעשה ניסיון ״ליישר״ את הזמנים — מוצגים הזמנים בפועל. כדי להספיק, אפשר למדוד רק מדד אחד בכל נקודה.</p>
        <fieldset class="seg"><legend>מה למדוד בנקודות ההתאוששות?</legend>
          <label><input type="checkbox" id="rm-p" ${metricsSel.pulse ? 'checked' : ''}> דופק</label>
          <label><input type="checkbox" id="rm-b" ${metricsSel.breath ? 'checked' : ''}> נשימה</label>
        </fieldset>
        <ul class="target-list">
          ${TARGETS.map((t, i) => {
            const ev = recs[i];
            const el = ev ? ev.recoveryElapsedSec : null;
            return `<li class="target ${ev ? 'done' : ''}" data-t="${t}">
              <div><strong>נקודה ${i + 1} — כ-${fmtClock(t)}</strong>
              <span class="status" data-status>${ev ? `✔ נמדד בזמן ${fmtClock(el)}` : ''}</span></div>
              ${ev ? '' : `<button class="btn primary small" data-measure>מדידה עכשיו</button>`}
            </li>`;
          }).join('')}
        </ul>
        <div class="btn-row">
          <button class="btn secondary" id="rec-sum" ${recs.length ? '' : 'disabled'}>סיום וסיכום</button>
          <button class="btn ghost small" id="ch-quit">יציאה מהאתגר</button>
        </div>
      </div>`;
    const updateTargets = () => {
      const e = elapsedNow();
      const clk = body.querySelector('#el-clock');
      if (!clk) return stopClock();
      clk.textContent = fmtClock(e);
      body.querySelectorAll('.target:not(.done)').forEach((li) => {
        const t = Number(li.dataset.t);
        const s = li.querySelector('[data-status]');
        const diff = t - e;
        li.classList.toggle('ready', diff <= 10);
        s.textContent = diff > 10 ? `בעוד ${fmtClock(diff)}` : diff > -25 ? 'זה הזמן למדוד' : `עבר הזמן המתוכנן (${fmtClock(-diff)} איחור) — אפשר למדוד ויירשם הזמן בפועל`;
      });
    };
    updateTargets();
    clock = setInterval(updateTargets, 500);
    body.querySelector('#ch-quit').addEventListener('click', quit);
    const sel = () => ({ pulse: body.querySelector('#rm-p').checked, breath: body.querySelector('#rm-b').checked });
    body.querySelector('#rec-sum').addEventListener('click', () => go('summary'));
    body.querySelectorAll('[data-measure]').forEach((btn) => btn.addEventListener('click', () => {
      const m = sel();
      if (!m.pulse && !m.breath) { announce('יש לבחור לפחות מדד אחד'); return; }
      st.recMetrics = m; saveState(st);
      stopClock();
      body.innerHTML = '<div id="ch-measure"></div>';
      mountMeasure(body.querySelector('#ch-measure'), {
        profileId: st.profileId, context: 'recovery', challengeId: st.challengeId, challengeStage: 'recovery',
        activityEndMs: st.activityEndMs, metrics: m,
        onSaved: () => { const n = challengeEvents().filter((e) => e.challengeStage === 'recovery').length; go(n >= TARGETS.length ? 'summary' : 'recovery'); },
        onCancel: () => renderRecovery(),
      });
    }));
  }

  // ---------- 5. סיכום ----------
  function renderSummary() {
    let combined = false;
    const draw = () => {
      body.innerHTML = `
        <div class="panel">
          <h2>סיכום האתגר — ${esc(profileName())}</h2>
          <p class="hint">המדידות כבר נשמרו ברשומות. מוצגים הזמנים האמיתיים של כל מדידה.</p>
          <fieldset class="seg"><legend>תצוגה</legend>
            <label><input type="radio" name="sm" value="sep" ${combined ? '' : 'checked'}> גרפים נפרדים</label>
            <label><input type="radio" name="sm" value="comb" ${combined ? 'checked' : ''}> גרף משולב (שני צירים)</label>
          </fieldset>
          ${recoveryView(challengeEvents(), { combined })}
          <div class="btn-row">
            <a class="btn primary" href="#/records/history">לרשומות שלי</a>
            <button class="btn secondary" id="sm-new">אתגר חדש</button>
            <a class="btn ghost" href="#/report">הפקת דוח PDF</a>
          </div>
        </div>`;
      body.querySelectorAll('input[name="sm"]').forEach((r) => r.addEventListener('change', () => { combined = r.value === 'comb'; draw(); }));
      body.querySelector('#sm-new').addEventListener('click', () => { saveState(null); st = null; renderSetup(); });
    };
    draw();
  }

  render();
}
