// מדידת קצב נשימה במיקרופון (ניסיוני). מעבד מעטפת אנרגיה של רעש נשימה בזמן אמת.
// לא מקליט ולא שומר קול — נשמרים רק מספרים (מעטפת אנרגיה בזיכרון עד לסיום המדידה).

import { acquire, release, onAbort, micSupport, describeError } from './permissions.js';
import { analyzeBreathing, movingAverage } from './dsp.js';
import { drawTrace } from './live.js';
import { beatTimeline } from './charts.js';
import { esc, fmtClock, announce, sleep } from './util.js';
import { BREATH_COLOR, QUALITY } from './constants.js';

export const BREATH_MEASURE_SEC = 60;
const MIN_STOP_SEC = 30;
const BAND_LO = 200, BAND_HI = 2000;

const FAIL_TEXT = {
  too_short: 'המדידה הייתה קצרה מדי (נדרשות לפחות 30 שניות).',
  no_signal: 'לא זוהה שינוי מספק בעוצמת הקול. ייתכן שהטלפון רחוק מדי או שהנשימה שקטה מאוד.',
  noisy: 'זוהה רעש או דיבור שמפריעים לזיהוי הנשימה.',
  few_breaths: 'זוהו מעט מדי נשימות.',
  unstable: 'מחזורי הנשימה שזוהו לא היו יציבים מספיק.',
  low_quality: 'איכות האות לא הספיקה לתוצאה אמינה.',
  out_of_range: 'הערך שחושב מחוץ לטווח הסביר — לא נשמר.',
};

export function runMicBreathing(root) {
  return new Promise((resolve) => {
    let stream = null, actx = null, timer = null, finished = false, onVis = null;
    const unAbort = onAbort(() => finish({ status: 'cancel' }));

    function cleanup() {
      if (timer) { clearInterval(timer); timer = null; }
      if (onVis) { document.removeEventListener('visibilitychange', onVis); onVis = null; }
      if (actx) { try { actx.close(); } catch { /* ignore */ } actx = null; }
      release(stream);
      stream = null;
    }
    function finish(r) {
      if (finished) return;
      finished = true;
      cleanup();
      unAbort();
      resolve(r);
    }

    function showPrepare(note = '') {
      cleanup();
      const sup = micSupport();
      root.innerHTML = `
        <section class="panel" aria-labelledby="mic-h">
          <h3 id="mic-h">מדידת קצב נשימה במיקרופון <span class="badge exp">ניסיוני</span></h3>
          ${note ? `<p class="notice warn" role="alert">${esc(note)}</p>` : ''}
          <ol class="steps">
            <li>היכנסו למקום <strong>שקט</strong>. אל תדברו במהלך המדידה.</li>
            <li>החזיקו את הטלפון <strong>בעדינות, במרחק נוח</strong> (כ-15–30 ס״מ) מהפה והאף — בלי להצמיד אותו ובלי לחסום את הנשימה.</li>
            <li>נשמו כרגיל, בלי לשנות את קצב הנשימה בכוונה. המדידה נמשכת ${BREATH_MEASURE_SEC} שניות.</li>
          </ol>
          <p class="hint">הקול מעובד במכשיר בלבד ואינו מוקלט, נשמר או נשלח. המיקרופון נסגר בסיום. זיהוי נשימה במיקרופון רגיש לרעש ולרוח; אם אין אות אמין לא יירשם ערך.</p>
          ${sup.ok ? '' : `<p class="notice warn">${esc(sup.why)}</p>`}
          <div class="btn-row">
            <button class="btn primary big" id="mic-start" ${sup.ok ? '' : 'disabled'}>הפעלת מיקרופון והתחלת מדידה</button>
            <button class="btn secondary" id="mic-manual">ספירה ידנית במקום</button>
            <button class="btn ghost" id="mic-skip">דילוג על הנשימה</button>
          </div>
        </section>`;
      root.querySelector('#mic-start').addEventListener('click', begin);
      root.querySelector('#mic-manual').addEventListener('click', () => finish({ status: 'manual' }));
      root.querySelector('#mic-skip').addEventListener('click', () => finish({ status: 'skip' }));
    }

    async function begin() {
      root.innerHTML = '<section class="panel"><p role="status">מבקש גישה למיקרופון…</p></section>';
      try {
        stream = await acquire({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
          video: false,
        });
      } catch (err) {
        showPrepare(describeError(err, 'mic'));
        return;
      }
      if (finished) { release(stream); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      try {
        actx = new AC();
        if (actx.state === 'suspended') await actx.resume();
      } catch {
        showPrepare('לא ניתן להפעיל עיבוד שמע בדפדפן זה.');
        return;
      }
      const src = actx.createMediaStreamSource(stream);
      const an = actx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0;
      src.connect(an); // אינו מחובר לרמקול — אין משוב קולי
      const freq = new Float32Array(an.frequencyBinCount);
      const td = new Float32Array(an.fftSize);
      const binHz = actx.sampleRate / an.fftSize;
      const lo = Math.max(1, Math.round(BAND_LO / binHz));
      const hi = Math.min(an.frequencyBinCount - 1, Math.round(BAND_HI / binHz));

      // ספירה לאחור קצרה
      root.innerHTML = `<section class="panel" aria-live="assertive"><h3>היו מוכנים…</h3><p class="big-num" id="mic-cd">3</p><p>החזיקו את הטלפון בעדינות ונשמו כרגיל.</p></section>`;
      for (let i = 3; i > 0; i--) {
        const cd = root.querySelector('#mic-cd');
        if (!cd || finished) return;
        cd.textContent = String(i);
        await sleep(1000);
        if (finished) return;
      }

      root.innerHTML = `
        <section class="panel" aria-labelledby="mic-run-h">
          <h3 id="mic-run-h">מקשיבים לנשימה… <span class="badge exp">ניסיוני</span></h3>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="mic-prog"><div class="bar" id="mic-bar"></div></div>
          <p class="big-num"><span id="mic-left">${fmtClock(BREATH_MEASURE_SEC)}</span></p>
          <div class="meter" aria-hidden="true"><div class="meter-fill" id="mic-level"></div></div>
          <p id="mic-state" class="cover-state" role="status">מתחיל…</p>
          <canvas id="mic-trace" class="trace" role="img" aria-label="מעטפת עוצמת הקול (נשימה)"></canvas>
          <p class="hint">העקומה מראה את שינויי עוצמת הרעש בטווח הנשימה (לא הקלטה). גלים איטיים = מחזורי נשימה.</p>
          <div class="btn-row">
            <button class="btn secondary" id="mic-stop" disabled>סיום מוקדם</button>
            <button class="btn ghost" id="mic-abort">עצירה וחזרה</button>
          </div>
        </section>`;

      const ts = [], ln = [];
      const t0 = performance.now();
      const wall0 = Date.now();
      let peakLevel = 0, silentFrames = 0, clipFrames = 0;
      let done = false;
      const stopBtn = root.querySelector('#mic-stop');
      root.querySelector('#mic-abort').addEventListener('click', () => { done = true; showPrepare(); });
      stopBtn.addEventListener('click', () => complete());

      onVis = () => {
        if (document.hidden && !done) { done = true; showPrepare('המדידה הופסקה כי האפליקציה עברה לרקע.'); }
      };
      document.addEventListener('visibilitychange', onVis);

      function complete() {
        if (done) return;
        done = true;
        const a = analyzeBreathing(ts, ln);
        const quietFrac = silentFrames / Math.max(1, ts.length);
        const clipFrac = clipFrames / Math.max(1, ts.length);
        cleanup();
        if (finished) return;
        showResult(a, { quietFrac, clipFrac }, wall0);
      }

      timer = setInterval(() => {
        if (done || finished) return;
        const elapsed = (performance.now() - t0) / 1000;
        an.getFloatFrequencyData(freq);
        an.getFloatTimeDomainData(td);
        let p = 0;
        for (let i = lo; i <= hi; i++) p += Math.pow(10, Math.max(freq[i], -140) / 10);
        ts.push(elapsed * 1000);
        ln.push(Math.log(p + 1e-14));
        let peak = 0, sumSq = 0;
        for (let i = 0; i < td.length; i++) { const a = Math.abs(td[i]); if (a > peak) peak = a; sumSq += td[i] * td[i]; }
        const rms = Math.sqrt(sumSq / td.length);
        peakLevel = Math.max(peakLevel * 0.9, peak);
        if (rms < 0.0003) silentFrames++;
        if (peak > 0.98) clipFrames++;

        const pct = Math.min(100, (elapsed / BREATH_MEASURE_SEC) * 100);
        root.querySelector('#mic-bar').style.width = pct + '%';
        root.querySelector('#mic-prog').setAttribute('aria-valuenow', String(Math.round(pct)));
        root.querySelector('#mic-left').textContent = fmtClock(BREATH_MEASURE_SEC - elapsed);
        root.querySelector('#mic-level').style.width = Math.min(100, Math.sqrt(rms) * 220) + '%';
        const st = root.querySelector('#mic-state');
        if (rms < 0.0003) { st.textContent = '✖ כמעט אין אות מהמיקרופון — בדקו שהמיקרופון אינו מכוסה'; st.className = 'cover-state bad'; }
        else if (peak > 0.98) { st.textContent = '✖ הקול חזק מדי — התרחקו מעט או עברו למקום שקט'; st.className = 'cover-state bad'; }
        else { st.textContent = '✔ המיקרופון קולט אות'; st.className = 'cover-state ok'; }
        stopBtn.disabled = elapsed < MIN_STOP_SEC;

        if (ts.length > 40 && ts.length % 4 === 0) {
          const win = Math.min(ts.length, 20 * 20);
          const seg = ln.slice(-win);
          const sm = movingAverage(seg, 16);
          const bl = movingAverage(sm, 160);
          drawTrace(root.querySelector('#mic-trace'), sm.map((v, i) => v - bl[i]), { color: BREATH_COLOR, emptyText: 'ממתין לאות…' });
        }
        if (elapsed >= BREATH_MEASURE_SEC) complete();
      }, 50);
    }

    function showResult(a, env, wall0) {
      announce(a.ok ? `המדידה הסתיימה: ${a.rpm} נשימות לדקה` : 'המדידה לא הצליחה');
      if (!a.ok) {
        root.innerHTML = `
          <section class="panel" aria-labelledby="mic-res-h">
            <h3 id="mic-res-h">התוצאות לא התקבלו היטב</h3>
            <p class="notice warn" role="alert">התוצאות לא התקבלו היטב — כדאי לנסות שוב במקום שקט. ${esc(FAIL_TEXT[a.reason] || '')} לא נשמר ערך.</p>
            ${env.quietFrac > 0.5 ? '<p class="hint">כמעט לא נקלט אות — בדקו הרשאות ושהמיקרופון אינו מכוסה.</p>' : ''}
            ${env.clipFrac > 0.1 ? '<p class="hint">הקול היה חזק מדי בחלק מהזמן.</p>' : ''}
            <div class="btn-row">
              <button class="btn primary" id="mic-again">מדידה חוזרת</button>
              <button class="btn secondary" id="mic-manual">ספירה ידנית</button>
              <button class="btn ghost" id="mic-skip">דילוג</button>
            </div>
          </section>`;
        root.querySelector('#mic-again').addEventListener('click', () => showPrepare());
        root.querySelector('#mic-manual').addEventListener('click', () => finish({ status: 'manual' }));
        root.querySelector('#mic-skip').addEventListener('click', () => finish({ status: 'skip' }));
        return;
      }
      const good = a.quality === 'good';
      root.innerHTML = `
        <section class="panel" aria-labelledby="mic-res-h">
          <h3 id="mic-res-h">תוצאת מדידת נשימה <span class="badge exp">ניסיוני</span></h3>
          <p class="kpi"><span class="kpi-num breath">${a.rpm}</span><span class="kpi-unit">נשימות לדקה</span></p>
          <p>איכות האות: <strong>${esc(QUALITY[a.quality])}</strong> · מקור: מיקרופון (ניסיוני). זוהו ${a.nBreaths} מחזורי נשימה.</p>
          ${good ? beatTimeline({ events: a.breathTimesMs, durationMs: a.durationSec * 1000, color: BREATH_COLOR, label: 'נשימות שזוהו במדידה', desc: `${a.nBreaths} נשימות שזוהו` })
            : '<p class="notice">האיכות בינונית — נשמר רק הערך הממוצע, ללא ציר נשימות. מומלץ לחזור על המדידה.</p>'}
          <div class="btn-row">
            <button class="btn primary" id="mic-use">שימוש בתוצאה</button>
            <button class="btn secondary" id="mic-again">מדידה חוזרת</button>
            <button class="btn ghost" id="mic-manual">ספירה ידנית במקום</button>
          </div>
        </section>`;
      root.querySelector('#mic-use').addEventListener('click', () => finish({
        status: 'done',
        metric: {
          rpm: a.rpm,
          source: 'measured_microphone',
          method: 'microphone',
          sampledAt: new Date(wall0).toISOString(),
          durationSec: Math.round(a.durationSec),
          breathTimesMs: good ? a.breathTimesMs : [],
          quality: a.quality,
        },
      }));
      root.querySelector('#mic-again').addEventListener('click', () => showPrepare());
      root.querySelector('#mic-manual').addEventListener('click', () => finish({ status: 'manual' }));
    }

    showPrepare();
  });
}
