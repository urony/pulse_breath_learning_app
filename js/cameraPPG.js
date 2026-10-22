// מדידת דופק במצלמה (PPG אופטי): אצבע על העדשה האחורית, ניתוח פריימים מקומי ב-canvas.
// התמונה אינה נשמרת ואינה נשלחת. הזרם משוחרר בסיום, בעצירה ובמעבר מסך.

import { acquire, release, onAbort, cameraSupport, describeError } from './permissions.js';
import { analyzePPG, liveBeats } from './dsp.js';
import { drawTrace } from './live.js';
import { ensureAudio, tick, audioSupported } from './audio.js';
import { beatTimeline } from './charts.js';
import { esc, fmtClock, announce } from './util.js';
import { PULSE_COLOR, QUALITY } from './constants.js';

export const SETTLE_MS = 4000;
export const MEASURE_MS = 30000;

const FAIL_TEXT = {
  not_covered: 'האצבע לא כיסתה את העדשה לאורך כל המדידה.',
  low_fps: 'המצלמה סיפקה מעט מדי פריימים בשנייה (לרוב בגלל תאורה חלשה). נסו אור חזק יותר או פנס.',
  too_short: 'המדידה הסתיימה מוקדם מדי.',
  flat_signal: 'לא התקבל אות פעימה (האות שטוח). בדקו שהאצבע מכסה את העדשה וללא לחץ חזק.',
  few_beats: 'זוהו מעט מדי פעימות.',
  unstable: 'האות לא היה יציב מספיק לזיהוי פעימות.',
  low_quality: 'איכות האות לא הספיקה לתוצאה אמינה (ייתכן תנועה או חשיפה לא יציבה).',
  out_of_range: 'הערך שחושב מחוץ לטווח הסביר — לא נשמר.',
};

export function runCameraPulse(root) {
  return new Promise((resolve) => {
    let stream = null, video = null, stopLoop = null, ui = null, finished = false;
    let tickOn = false;
    const unAbort = onAbort(() => finish({ status: 'cancel' }));

    function cleanup() {
      if (ui) { clearInterval(ui); ui = null; }
      if (stopLoop) { stopLoop(); stopLoop = null; }
      if (video) { try { video.pause(); } catch { /* ignore */ } video.srcObject = null; video.remove(); }
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
      const sup = cameraSupport();
      root.innerHTML = `
        <section class="panel" aria-labelledby="cam-h">
          <h3 id="cam-h">מדידת דופק במצלמה</h3>
          ${note ? `<p class="notice warn" role="alert">${esc(note)}</p>` : ''}
          <ol class="steps">
            <li>שבו בנוחות והניחו את היד על השולחן.</li>
            <li>הניחו בעדינות את קצה האצבע על <strong>עדשת המצלמה האחורית</strong> (ועל הפנס, אם יש), כך שהעדשה מכוסה כולה. <strong>בלי ללחוץ חזק</strong>.</li>
            <li>הישארו במנוחה ללא תנועה. המדידה נמשכת כ-${Math.round((SETTLE_MS + MEASURE_MS) / 1000)} שניות.</li>
          </ol>
          <p class="hint">הניתוח מתבצע במכשיר שלך בלבד. התמונה לא נשמרת ולא נשלחת, והמצלמה נכבית בסיום. אם הפנס מתחמם — עצרו.</p>
          ${sup.ok ? '' : `<p class="notice warn">${esc(sup.why)}</p>`}
          <div class="btn-row">
            <button class="btn primary big" id="cam-start" ${sup.ok ? '' : 'disabled'}>הפעלת מצלמה והתחלת מדידה</button>
            <button class="btn secondary" id="cam-manual">ספירה ידנית במקום</button>
            <button class="btn ghost" id="cam-skip">דילוג על הדופק</button>
          </div>
        </section>`;
      root.querySelector('#cam-start').addEventListener('click', begin);
      root.querySelector('#cam-manual').addEventListener('click', () => finish({ status: 'manual' }));
      root.querySelector('#cam-skip').addEventListener('click', () => finish({ status: 'skip' }));
    }

    async function begin() {
      root.innerHTML = '<section class="panel"><p role="status">מבקש גישה למצלמה…</p></section>';
      try {
        stream = await acquire({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } },
          audio: false,
        });
      } catch (err) {
        showPrepare(describeError(err, 'camera'));
        return;
      }
      if (finished) { release(stream); return; }

      // פנס — רק אם הדפדפן תומך
      let torch = false;
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.torch) {
          await track.applyConstraints({ advanced: [{ torch: true }] });
          torch = true;
        }
      } catch { torch = false; }

      video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.className = 'hidden-video';
      document.body.appendChild(video);
      video.srcObject = stream;
      try { await video.play(); } catch { /* ייתכן שיתחיל בכל מקרה */ }

      root.innerHTML = `
        <section class="panel" aria-labelledby="cam-run-h">
          <h3 id="cam-run-h">מודדים… <span id="cam-phase" class="phase">מתייצב</span></h3>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="cam-prog"><div class="bar" id="cam-bar"></div></div>
          <p class="big-num" aria-live="off"><span id="cam-left">${fmtClock((SETTLE_MS + MEASURE_MS) / 1000)}</span></p>
          <p id="cam-cover" class="cover-state" role="status"></p>
          <canvas id="cam-trace" class="trace" aria-label="אות פעימה חי" role="img"></canvas>
          <p class="hint" id="cam-info">${torch ? 'הפנס הופעל על ידי הדפדפן.' : 'הדפדפן אינו מאפשר שליטה בפנס במכשיר זה — מדדו באור חזק עם אצבע שמכסה את העדשה.'} הנקודות מסמנות פעימות שזוהו בפועל.</p>
          <label class="check"><input type="checkbox" id="cam-tick" ${audioSupported() ? '' : 'disabled'}> השמעת טיק בכל פעימה שזוהתה (ברירת מחדל: כבוי)</label>
          <div class="btn-row"><button class="btn secondary" id="cam-stop">עצירה וחזרה</button></div>
          <div class="sr-only" id="cam-sr" aria-live="polite"></div>
        </section>`;

      const ts = [], reds = [];
      let covered = 0, total = 0, saturated = 0;
      let wallStart = 0, t0 = null;
      let lastCover = true, lastTickTime = -1;
      const c = document.createElement('canvas');
      c.width = 40; c.height = 30;
      const cx = c.getContext('2d', { willReadFrequently: true });
      let stopped = false;
      let doneAnalysis = false;

      root.querySelector('#cam-tick').addEventListener('change', (e) => {
        tickOn = e.target.checked;
        if (tickOn) ensureAudio();
      });
      root.querySelector('#cam-stop').addEventListener('click', () => { stopped = true; showPrepare(); });

      const useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
      let lastCallbackWall = performance.now();
      function sampleOnce(meta) {
        if (stopped || finished) return;
        try {
          cx.drawImage(video, 0, 0, 40, 30);
          const d = cx.getImageData(10, 8, 20, 14).data;
          let r = 0, g = 0, b = 0;
          const n = d.length / 4;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
          r /= n; g /= n; b /= n;
          const t = meta && meta.captureTime ? meta.captureTime : performance.now();
          if (t0 === null) { t0 = t; wallStart = Date.now(); }
          const elapsed = t - t0;
          const isCovered = r > 60 && r > 1.5 * g && r > 1.5 * b;
          lastCover = isCovered;
          ts.push(elapsed);
          reds.push(r);
          if (elapsed >= SETTLE_MS) {
            total++;
            if (isCovered) covered++;
            if (r > 250) saturated++;
          }
          if (elapsed >= SETTLE_MS + MEASURE_MS && !doneAnalysis) {
            doneAnalysis = true;
            stopped = true;
            clearInterval(watchdog);
            finalize();
            return;
          }
        } catch { /* פריים בעייתי — מדלגים */ }
      }
      function onFrame(now, meta) {
        lastCallbackWall = performance.now();
        sampleOnce(meta);
        if (!stopped && !finished) schedule();
      }
      function schedule() {
        if (useRVFC) video.requestVideoFrameCallback(onFrame);
        else requestAnimationFrame((now) => onFrame(now, null));
      }
      // גיבוי בטיימר: אם דפדפן אינו מספק callback לפריים (או שהוא מושהה), דוגמים בטיימר
      const watchdog = setInterval(() => {
        if (stopped || finished) return;
        if (performance.now() - lastCallbackWall > 150) sampleOnce(null);
      }, 33);
      stopLoop = () => { stopped = true; clearInterval(watchdog); document.removeEventListener('visibilitychange', onHide); };
      function onHide() { if (document.hidden && !stopped) { stopped = true; showPrepare('המדידה הופסקה כי האפליקציה עברה לרקע.'); } }
      document.addEventListener('visibilitychange', onHide);
      schedule();

      ui = setInterval(() => {
        if (finished || !ts.length) return;
        const elapsed = ts[ts.length - 1];
        const pct = Math.min(100, (elapsed / (SETTLE_MS + MEASURE_MS)) * 100);
        const bar = root.querySelector('#cam-bar');
        if (!bar) return;
        bar.style.width = pct + '%';
        root.querySelector('#cam-prog').setAttribute('aria-valuenow', String(Math.round(pct)));
        root.querySelector('#cam-left').textContent = fmtClock((SETTLE_MS + MEASURE_MS - elapsed) / 1000);
        root.querySelector('#cam-phase').textContent = elapsed < SETTLE_MS ? 'מתייצב' : 'מודד';
        const cv = root.querySelector('#cam-cover');
        cv.textContent = lastCover ? '✔ האצבע מכסה את העדשה' : '✖ האצבע אינה מכסה את העדשה — כסו אותה בעדינות';
        cv.className = 'cover-state ' + (lastCover ? 'ok' : 'bad');
        const lb = liveBeats(ts, reds, 8000);
        const canvas = root.querySelector('#cam-trace');
        const markers = [];
        if (lb.trace && lb.trace.length) {
          lb.t.forEach((bt) => markers.push(Math.round(((bt - lb.offsetMs) * lb.fs) / 1000)));
        }
        drawTrace(canvas, lb.trace, { color: PULSE_COLOR, markers, emptyText: 'ממתין לאות…' });
        if (tickOn && lb.t.length) {
          const last = lb.t[lb.t.length - 1];
          if (last > lastTickTime && elapsed - last < 700) { lastTickTime = last; tick(undefined, { freq: 880 }); }
        }
      }, 250);

      function finalize() {
        if (ui) { clearInterval(ui); ui = null; }
        const analysis = analyzePPG(ts, reds, { settleMs: SETTLE_MS });
        const coverage = total ? covered / total : 0;
        // שחרור המצלמה מיד בתום הדגימה
        if (video) { try { video.pause(); } catch { /* ignore */ } video.srcObject = null; video.remove(); }
        release(stream); stream = null;
        if (finished) return;
        if (coverage < 0.8) { analysis.ok = false; analysis.reason = 'not_covered'; }
        showResult(analysis, coverage, saturated / Math.max(1, total), wallStart + SETTLE_MS);
      }
    }

    function showResult(a, coverage, satFrac, sampledAtMs) {
      announce(a.ok ? `המדידה הסתיימה: ${a.bpm} פעימות לדקה` : 'המדידה לא הצליחה');
      if (!a.ok) {
        root.innerHTML = `
          <section class="panel" aria-labelledby="cam-res-h">
            <h3 id="cam-res-h">המדידה לא הצליחה</h3>
            <p class="notice warn" role="alert">${esc(FAIL_TEXT[a.reason] || 'האות לא היה מספיק אמין.')} לא נשמר ערך.</p>
            <ul class="tips">
              <li>כסו את העדשה כולה בעדינות, בלי ללחוץ חזק.</li>
              <li>נסו אור חזק או פנס, ושבו ללא תנועה.</li>
              <li>אפשר לעבור לספירה ידנית.</li>
            </ul>
            ${satFrac > 0.5 ? '<p class="hint">התמונה הייתה בהירה מאוד — ייתכן שהעדשה לא כוסתה היטב.</p>' : ''}
            <div class="btn-row">
              <button class="btn primary" id="cam-again">מדידה חוזרת</button>
              <button class="btn secondary" id="cam-manual">ספירה ידנית</button>
              <button class="btn ghost" id="cam-skip">דילוג</button>
            </div>
          </section>`;
        root.querySelector('#cam-again').addEventListener('click', () => showPrepare());
        root.querySelector('#cam-manual').addEventListener('click', () => finish({ status: 'manual' }));
        root.querySelector('#cam-skip').addEventListener('click', () => finish({ status: 'skip' }));
        return;
      }
      const good = a.quality === 'good';
      root.innerHTML = `
        <section class="panel" aria-labelledby="cam-res-h">
          <h3 id="cam-res-h">תוצאת מדידת דופק</h3>
          <p class="kpi"><span class="kpi-num pulse">${a.bpm}</span><span class="kpi-unit">פעימות לדקה</span></p>
          <p>איכות האות: <strong>${esc(QUALITY[a.quality])}</strong> · מקור: מצלמה (PPG) · ללא טענה לדיוק קליני.</p>
          ${good ? `
            ${beatTimeline({ events: a.beatTimesMs, durationMs: a.durationSec * 1000, color: PULSE_COLOR, label: 'פעימות שזוהו במדידה', desc: `${a.beatTimesMs.length} פעימות שזוהו` })}
            <p class="hint">מרווחים בין פעימות עוקבות: ${a.ibiMinMs}–${a.ibiMaxMs} אלפיות השנייה. מדידת PPG בטלפון אינה אק״ג ואינה מתאימה לאבחון סדירות הקצב.</p>`
          : '<p class="notice">האיכות בינונית — נשמר רק הערך הממוצע (BPM), ללא ציר פעימות. מומלץ לחזור על המדידה.</p>'}
          <div class="btn-row">
            <button class="btn primary" id="cam-use">שימוש בתוצאה</button>
            <button class="btn secondary" id="cam-again">מדידה חוזרת</button>
            <button class="btn ghost" id="cam-manual">ספירה ידנית במקום</button>
          </div>
        </section>`;
      root.querySelector('#cam-use').addEventListener('click', () => finish({
        status: 'done',
        metric: {
          bpm: a.bpm,
          source: 'measured_camera',
          method: 'camera',
          sampledAt: new Date(sampledAtMs).toISOString(),
          durationSec: Math.round(a.durationSec),
          beatTimesMs: good ? a.beatTimesMs : [],
          quality: a.quality,
        },
      }));
      root.querySelector('#cam-again').addEventListener('click', () => showPrepare());
      root.querySelector('#cam-manual').addEventListener('click', () => finish({ status: 'manual' }));
    }

    showPrepare();
  });
}
