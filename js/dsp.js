// עיבוד אותות — פונקציות טהורות (ללא DOM), ניתנות לבדיקה ב-Node.
//
// מגבלות חשובות (ראו גם README):
//  * PPG ממצלמת טלפון הוא אות אופטי של נפח דם באצבע — לא אק"ג, ולא כלי אבחוני.
//  * זיהוי נשימה במיקרופון רגיש לרעש, לדיבור ולרוח; האלגוריתם שמרני וידחה מדידות חשודות.
//  * הספים כוונו על אותות סינתטיים ועל ניסויי שדה מוגבלים; אינם מובטחים בכל דגם.

import { mean, median, std } from './util.js';

// ---------- כלים ----------
export function movingAverage(x, w) {
  w = Math.max(1, Math.round(w));
  const n = x.length;
  const out = new Array(n);
  const half = w >> 1;
  let sum = 0, cnt = 0, lo = 0, hi = -1;
  for (let i = 0; i < n; i++) {
    const wantHi = Math.min(n - 1, i + half);
    const wantLo = Math.max(0, i - half);
    while (hi < wantHi) { hi++; sum += x[hi]; cnt++; }
    while (lo < wantLo) { sum -= x[lo]; cnt--; lo++; }
    out[i] = sum / cnt;
  }
  return out;
}

// דיכוי קפיצות פתאומיות (חשיפה אוטומטית, תנועה): חיתוך הפרש בין פריימים עוקבים לפי סטיית החציון.
// קפיצות גדולות פי כמה מפעימה אמיתית, ולכן חיתוך שומר על הפעימות ומסיר את המדרגות.
export function suppressSteps(x) {
  if (x.length < 3) return x.slice();
  const df = [];
  for (let i = 1; i < x.length; i++) df.push(x[i] - x[i - 1]);
  const ad = df.map(Math.abs).sort((a, b) => a - b);
  const clip = Math.max(3 * ad[ad.length >> 1], 0.05);
  const out = [x[0]];
  for (const d of df) out.push(out[out.length - 1] + Math.max(-clip, Math.min(clip, d)));
  return out;
}

// דגימה אחידה (אינטרפולציה לינארית) מתוך דגימות עם חותמות זמן לא אחידות
export function resampleUniform(t, v, fs) {
  if (t.length < 2) return { v: [], t0: t[0] || 0 };
  const t0 = t[0];
  const dt = 1000 / fs;
  const n = Math.floor((t[t.length - 1] - t0) / dt) + 1;
  const out = new Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const ti = t0 + i * dt;
    while (j < t.length - 2 && t[j + 1] < ti) j++;
    const span = t[j + 1] - t[j];
    const a = span > 0 ? (ti - t[j]) / span : 0;
    out[i] = v[j] + (v[j + 1] - v[j]) * Math.min(1, Math.max(0, a));
  }
  return { v: out, t0 };
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
}

// מקסימומים מקומיים עם דיכוי מקסימום לא-מקסימלי לפי מרחק מינימלי (במדגמים)
function pickPeaks(x, minDist, minAmp) {
  const cand = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > minAmp) cand.push(i);
  }
  cand.sort((a, b) => x[b] - x[a]);
  const taken = [];
  const blocked = new Uint8Array(x.length);
  for (const i of cand) {
    if (blocked[i]) continue;
    taken.push(i);
    for (let k = Math.max(0, i - minDist + 1); k < Math.min(x.length, i + minDist); k++) blocked[k] = 1;
  }
  return taken.sort((a, b) => a - b);
}

function parabolic(x, i) {
  if (i <= 0 || i >= x.length - 1) return i;
  const a = x[i - 1], b = x[i], c = x[i + 1];
  const d = a - 2 * b + c;
  return d === 0 ? i : i + 0.5 * (a - c) / d;
}

// מקדם מתאם עצמי מנורמל סביב מרווח פעימה צפוי
function autocorrStrength(x, lagCenter) {
  const n = x.length;
  const m = mean(x);
  let den = 0;
  for (let i = 0; i < n; i++) den += (x[i] - m) ** 2;
  if (den === 0) return 0;
  let best = 0;
  const lo = Math.max(2, Math.floor(lagCenter * 0.85));
  const hi = Math.ceil(lagCenter * 1.15);
  for (let lag = lo; lag <= hi && lag < n - 2; lag++) {
    let num = 0;
    for (let i = 0; i + lag < n; i++) num += (x[i] - m) * (x[i + lag] - m);
    best = Math.max(best, (num / den) * (n / (n - lag)));
  }
  return best;
}

// הלג (במדגמים) של המחזוריות הדומיננטית: הקטן ביותר שעוצמתו קרובה למקסימום (מונע בחירת הכפלה)
function dominantLag(x, loLag, hiLag) {
  const n = x.length;
  const m = mean(x);
  let den = 0;
  for (let i = 0; i < n; i++) den += (x[i] - m) ** 2;
  if (den === 0) return null;
  const vals = [];
  let best = -Infinity;
  for (let lag = loLag; lag <= hiLag && lag < n / 2; lag++) {
    let num = 0;
    for (let i = 0; i + lag < n; i++) num += (x[i] - m) * (x[i + lag] - m);
    const r = (num / den) * (n / (n - lag));
    vals.push([lag, r]);
    if (r > best) best = r;
  }
  if (!(best > 0)) return null;
  for (let k = 1; k < vals.length - 1; k++) {
    const [lag, r] = vals[k];
    if (r >= 0.8 * best && r >= vals[k - 1][1] && r >= vals[k + 1][1]) return lag;
  }
  return vals.find(([, r]) => r === best)[0];
}

// ================== PPG: דופק מצלמה ==================
// הספק ספקטרלי (DFT עם חלון Hann) בתחום הדופק לחלון של האות המסונן
function windowSpectrum(seg, fs, minBpm, maxBpm) {
  const W = seg.length;
  const m = mean(seg);
  const w = seg.map((x, i) => (x - m) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1))));
  const P = [];
  for (let f = (minBpm * 0.6) / 60; f <= maxBpm / 60 + 1e-9; f += 0.02) {
    let re = 0, im = 0;
    for (let i = 0; i < W; i++) {
      const a = (2 * Math.PI * f * i) / fs;
      re += w[i] * Math.cos(a);
      im += w[i] * Math.sin(a);
    }
    P.push([f, re * re + im * im]);
  }
  return P;
}

// אומדן קצב ספקטרלי על חלונות חופפים: מחזיר חציון הקצב, יחס אות לרעש חציוני, ושיעור חלונות עקביים
function spectralRate(lp, fs, minBpm, maxBpm, dirty) {
  const dur = lp.length / fs;
  const winSec = dur >= 16 ? 10 : 8;
  const W = Math.round(winSec * fs), H = Math.round(2.5 * fs);
  const wins = [];
  let skipped = 0;
  for (let s = 0; s + W <= lp.length; s += H) {
    if (dirty && dirty.slice(s, s + W).some(Boolean)) { skipped++; continue; }
    const P = windowSpectrum(lp.slice(s, s + W), fs, minBpm, maxBpm);
    const inBand = P.filter(([f]) => f * 60 >= minBpm - 1e-6);
    const total = inBand.reduce((a, [, p]) => a + p, 0);
    if (!(total > 0)) continue;
    let best = inBand[0];
    inBand.forEach((p) => { if (p[1] > best[1]) best = p; });
    const at = (f) => P.reduce((a, p) => (Math.abs(p[0] - f) < Math.abs(a[0] - f) ? p : a), P[0]);
    // שיא אמיתי חייב להיות "פסגה": שקע משני צדיו. שיא בקצה התחום (רעש איטי/סחיפה) נפסל
    const leftDip = at(best[0] * 0.7)[1] < 0.6 * best[1];
    const rightF = best[0] * 1.45;
    const rightDip = rightF > maxBpm / 60 || at(rightF)[1] < 0.6 * best[1];
    if (!(leftDip && rightDip)) { wins.push({ bpm: NaN, snr: 0 }); continue; }
    // הרמוניה שנייה חזקה מדי: אם בחצי התדר יש הספק משמעותי — זה כנראה הקצב האמיתי
    const half = inBand.reduce((a, p) => (Math.abs(p[0] - best[0] / 2) < Math.abs(a[0] - best[0] / 2) ? p : a), P[0]);
    if (half[0] * 60 >= minBpm && Math.abs(half[0] - best[0] / 2) < 0.02 && half[1] >= 0.6 * best[1]) best = half;
    const near = inBand.filter(([f]) => Math.abs(f - best[0]) <= 0.12).reduce((a, [, p]) => a + p, 0);
    wins.push({ bpm: best[0] * 60, snr: near / total });
  }
  if (wins.length < 2) return { artifact: true, skipped, windows: wins.length };
  const finite = wins.filter((x) => Number.isFinite(x.bpm));
  if (finite.length < 2) return { bpm: NaN, snr: 0, consistency: 0, looseConsistency: 0, windows: wins.length, skipped };
  const bpm = median(finite.map((x) => x.bpm));
  const tol = Math.max(3, 0.06 * bpm);
  const consistency = wins.filter((x) => Math.abs(x.bpm - bpm) <= tol).length / wins.length;
  // סבילות רחבה: קצב לב אמיתי משתנה (נשימה, פעילות) גם בתוך מדידה של חצי דקה
  const tolLoose = Math.max(5, 0.18 * bpm);
  const looseConsistency = wins.filter((x) => Math.abs(x.bpm - bpm) <= tolLoose).length / wins.length;
  return { bpm, snr: median(finite.map((x) => x.snr)), consistency, looseConsistency, windows: wins.length, skipped };
}

// מסמן מקטעים (באורך ~2 שניות) שבהם האנרגיה גבוהה בהרבה מהרגיל — תנועה או הפרעה, לא דופק
function artifactMask(lp, fs) {
  const seg = Math.round(2 * fs);
  const rms = [];
  for (let s = 0; s + seg <= lp.length; s += seg) {
    const x = lp.slice(s, s + seg);
    rms.push(Math.sqrt(x.reduce((a, b) => a + b * b, 0) / seg));
  }
  const ref = [...rms].sort((a, b) => a - b)[Math.floor(rms.length / 4)] || 0;
  const mask = new Array(lp.length).fill(false);
  rms.forEach((r, k) => {
    if (ref > 0 && r > 3.5 * ref) for (let i = k * seg; i < Math.min(lp.length, (k + 1) * seg); i++) mask[i] = true;
  });
  return mask;
}

// שיאים עם סף מקומי (חלון של כ-4 מחזורים) ומרחק מינימלי
function pickPeaksLocal(x, minDist, thrFrac) {
  const cand = [];
  for (let i = 1; i < x.length - 1; i++) if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 0) cand.push(i);
  const win = Math.round((minDist / 0.6) * 4);
  const kept = cand.filter((i) => {
    let mx = 0;
    for (let k = Math.max(0, i - win); k < Math.min(x.length, i + win); k++) mx = Math.max(mx, x[k]);
    return x[i] >= thrFrac * mx;
  });
  kept.sort((a, b) => x[b] - x[a]);
  const blocked = new Uint8Array(x.length);
  const out = [];
  for (const i of kept) {
    if (blocked[i]) continue;
    out.push(i);
    for (let k = Math.max(0, i - minDist + 1); k < Math.min(x.length, i + minDist); k++) blocked[k] = 1;
  }
  return out.sort((a, b) => a - b);
}

/**
 * @param {number[]} tMs  חותמות זמן (ms) של פריימים
 * @param {number[]} red  אות הדופק (ערוץ אדום או ערוץ נבחר) בכל פריים
 * @param {{settleMs?:number, minBpm?:number, maxBpm?:number}} opts
 *
 * שלבים: דיכוי מדרגות ← הסרת מגמה ← אומדן קצב ספקטרלי עקבי על חלונות ← גילוי פעימות בסינון צר סביב הקצב
 * ← בדיקת מרווחים. הקצב נרשם רק כשהאות מחזורי ועקבי; ציר פעימות נשמר רק כשהמרווחים אמינים.
 */
export function analyzePPG(tMs, red, opts = {}) {
  const FS = 30;
  const settleMs = opts.settleMs ?? 0;
  const minBpm = opts.minBpm ?? 40;
  const maxBpm = opts.maxBpm ?? 200;

  const res = {
    ok: false, quality: 'poor', reason: '', bpm: null, beatTimesMs: [], ibisMs: [],
    nBeats: 0, validFraction: 0, acf: 0, fps: 0, durationSec: 0, ibiMinMs: null, ibiMaxMs: null,
    specBpm: null, specSnr: 0, specConsistency: 0, rateSource: null,
  };
  if (tMs.length < 40) { res.reason = 'too_short'; return res; }

  const start = tMs[0] + settleMs;
  const idx0 = tMs.findIndex((t) => t >= start);
  const t = tMs.slice(idx0).map((v) => v - tMs[idx0]);
  const v = red.slice(idx0);
  if (t.length < 40) { res.reason = 'too_short'; return res; }

  res.durationSec = t[t.length - 1] / 1000;
  res.fps = (t.length - 1) / res.durationSec;
  if (res.durationSec < 10) { res.reason = 'too_short'; return res; }
  if (res.fps < 8) { res.reason = 'low_fps'; return res; }

  const { v: u } = resampleUniform(t, suppressSteps(v), FS);
  const inv = u.map((a) => -a); // נפח דם גדול -> בליעה גבוהה -> ערך אדום נמוך
  const base = movingAverage(inv, FS * 1.5);
  const lp = movingAverage(movingAverage(inv.map((a, i) => a - base[i]), 3), 3);
  if (!(std(lp) > 0.02)) { res.reason = 'flat_signal'; return res; }

  const dirty = artifactMask(lp, FS);
  res.artifactFraction = dirty.filter(Boolean).length / dirty.length;
  const sp = spectralRate(lp, FS, minBpm, maxBpm, dirty);
  if (sp.artifact) { res.reason = res.artifactFraction > 0.1 ? 'motion' : 'too_short'; return res; }
  if (!Number.isFinite(sp.bpm)) { res.reason = 'low_quality'; return res; }
  res.specBpm = Math.round(sp.bpm * 10) / 10;
  res.specSnr = sp.snr;
  res.specConsistency = sp.consistency;
  res.specLooseConsistency = sp.looseConsistency;

  // גילוי פעימות סביב הקצב הספקטרלי
  const f0 = sp.bpm / 60;
  const per = FS / f0;
  const slow = movingAverage(lp, per);
  const bp = movingAverage(lp.map((a, i) => a - slow[i]), Math.max(3, per / 6));
  const minDist = Math.max(2, Math.round(0.5 * per));
  const peaksIdx = pickPeaksLocal(bp, minDist, 0.2);
  const beatTimes = peaksIdx.map((i) => (parabolic(bp, i) * 1000) / FS);
  res.nBeats = beatTimes.length;
  res.beatTimesMs = beatTimes.map((x) => Math.round(x));
  const ibis = [];
  for (let i = 1; i < beatTimes.length; i++) ibis.push(beatTimes[i] - beatTimes[i - 1]);
  res.ibisMs = ibis.map((x) => Math.round(x));
  let valid = [];
  if (ibis.length) {
    const med = median(ibis);
    valid = ibis.filter((x) => x >= 0.7 * med && x <= 1.4 * med && x >= 60000 / maxBpm && x <= 60000 / minBpm);
    res.validFraction = valid.length / ibis.length;
  }
  res.acf = autocorrStrength(lp, per);

  // איכות לפי עקביות ויחס אות לרעש של הספקטרום
  const spectralGood = sp.consistency >= 0.8 && sp.snr >= 0.35;
  const steadyMedium = sp.consistency >= 0.5 && sp.snr >= 0.3 && res.validFraction >= 0.6;
  // קצב משתנה/לא סדיר: הספקטרום חד וברור (יחס אות לרעש גבוה) אך הקצב נע בין חלונות — מוצג ממוצע בלבד
  const varying = !steadyMedium && sp.looseConsistency >= 0.6 && sp.snr >= 0.5 && res.validFraction >= 0.6;
  if (!steadyMedium && !varying) { res.reason = 'low_quality'; return res; }
  res.irregular = varying;
  if (sp.bpm < minBpm || sp.bpm > maxBpm) { res.reason = 'out_of_range'; return res; }

  let bpm = sp.bpm;
  res.rateSource = 'spectral';
  if (!varying && valid.length >= 8) {
    const ibiBpm = 60000 / mean(valid);
    if (Math.abs(ibiBpm - sp.bpm) <= 0.08 * sp.bpm) { bpm = ibiBpm; res.rateSource = 'intervals'; }
  }
  const reliableBeats = !varying && res.validFraction >= 0.8 && valid.length >= 8 && res.rateSource === 'intervals';
  if (valid.length) { res.ibiMinMs = Math.round(Math.min(...valid)); res.ibiMaxMs = Math.round(Math.max(...valid)); }

  res.quality = spectralGood && reliableBeats && res.durationSec >= 20 ? 'good' : 'medium';
  res.ok = true;
  res.bpm = Math.round(bpm * 10) / 10;
  if (res.quality !== 'good') { res.ibiMinMs = null; res.ibiMaxMs = null; }
  return res;
}

// זיהוי פעימות בחלון קצר לתצוגה חיה בלבד (אינו משמש לחישוב התוצאה הסופית)
export function liveBeats(tMs, red, windowMs = 8000) {
  if (tMs.length < 30) return { t: [], trace: [] };
  const tEnd = tMs[tMs.length - 1];
  const i0 = tMs.findIndex((x) => x >= tEnd - windowMs);
  const t = tMs.slice(i0).map((x) => x - tMs[i0]);
  const v = red.slice(i0);
  if (t.length < 30 || t[t.length - 1] < 3000) return { t: [], trace: [] };
  const FS = 30;
  const { v: u } = resampleUniform(t, suppressSteps(v), FS);
  const inv = u.map((a) => -a);
  const base = movingAverage(inv, FS * 1.5);
  const lp = movingAverage(movingAverage(inv.map((a, i) => a - base[i]), 3), 3);
  const amp = std(lp);
  if (!(amp > 0.05)) return { t: [], trace: lp, offsetMs: tMs[i0] };
  const peaks = pickPeaks(lp, Math.round(FS * 0.28), 0.4 * amp);
  return { t: peaks.map((i) => tMs[i0] + (i * 1000) / FS), trace: lp, offsetMs: tMs[i0], fs: FS };
}

// ================== נשימה: מעטפת אנרגיה מהמיקרופון ==================
/**
 * @param {number[]} tMs  חותמות זמן (ms)
 * @param {number[]} lnPower  לוגריתם הספק בתחום תדרי הנשימה-רעש (200-2000Hz)
 */
export function analyzeBreathing(tMs, lnPower, opts = {}) {
  const FS = 10;
  const minRpm = opts.minRpm ?? 5;
  const maxRpm = opts.maxRpm ?? 40;
  const res = {
    ok: false, quality: 'poor', reason: '', rpm: null, breathTimesMs: [], nBreaths: 0,
    validFraction: 0, roughness: 0, signalStd: 0, durationSec: 0,
  };
  if (tMs.length < 40) { res.reason = 'too_short'; return res; }
  const t = tMs.map((x) => x - tMs[0]);
  res.durationSec = t[t.length - 1] / 1000;
  if (res.durationSec < 25) { res.reason = 'too_short'; return res; }

  // בדיקת "חספוס": אנרגיה במודולציה מהירה (דיבור/רוח) יחסית למודולציה איטית (נשימה)
  const fine = resampleUniform(t, lnPower, 20).v;
  const fineSm = movingAverage(fine, 10);                // ~0.5s
  const slow = movingAverage(fine, 120);                 // ~6s
  const rough = fine.map((a, i) => a - fineSm[i]);
  const resp = fineSm.map((a, i) => a - slow[i]);
  const sRough = std(rough);
  const sResp = std(resp);
  res.roughness = sResp > 0 ? sRough / sResp : Infinity;
  res.signalStd = sResp;

  const x10 = resampleUniform(t, lnPower, FS).v;
  const sm = movingAverage(x10, FS * 0.8);
  const bl = movingAverage(sm, FS * 8);
  const dt = sm.map((a, i) => a - bl[i]);
  const sd = std(dt);
  res.signalStd = sd;
  if (sd < 0.18) { res.reason = 'no_signal'; return res; }

  const minDist = Math.round(FS * 60 / maxRpm);
  const rough2 = pickPeaks(dt, minDist, 0);
  const amps = rough2.map((i) => dt[i]).filter((a) => a > 0);
  const thr = Math.max(0.35 * percentile(amps, 0.9), 0.4 * sd);
  const peaks = rough2.filter((i) => dt[i] > thr);

  // דרישת "עומק": הפרש מספק בין שיא לשפל שבין שיאים
  const kept = [];
  for (const p of peaks) {
    if (!kept.length) { kept.push(p); continue; }
    const prev = kept[kept.length - 1];
    let lo = Infinity;
    for (let k = prev; k <= p; k++) lo = Math.min(lo, dt[k]);
    const depth = Math.min(dt[p], dt[prev]) - lo;
    if (depth >= 0.6 * sd) kept.push(p);
    else if (dt[p] > dt[prev]) kept[kept.length - 1] = p;
  }
  const times = kept.map((i) => (i * 1000) / FS);
  res.nBreaths = times.length;
  res.breathTimesMs = times.map((x) => Math.round(x));
  if (times.length < 5) { res.reason = 'few_breaths'; return res; }

  const ints = [];
  for (let i = 1; i < times.length; i++) ints.push(times[i] - times[i - 1]);
  const med = median(ints);
  const valid = ints.filter((x) => x >= 0.5 * med && x <= 1.8 * med && x >= 60000 / maxRpm && x <= 60000 / minRpm);
  res.validFraction = valid.length / ints.length;
  if (valid.length < 4) { res.reason = 'unstable'; return res; }
  if (res.roughness > 1.0) { res.reason = 'noisy'; return res; }

  const rpm = 60000 / mean(valid);
  if (rpm < minRpm || rpm > maxRpm) { res.reason = 'out_of_range'; return res; }

  if (res.validFraction >= 0.85 && res.roughness < 0.6 && times.length >= 7) res.quality = 'good';
  else if (res.validFraction >= 0.7 && times.length >= 5) res.quality = 'medium';
  else { res.quality = 'poor'; res.reason = 'low_quality'; return res; }

  res.ok = true;
  res.rpm = Math.round(rpm * 10) / 10;
  return res;
}

// זיהוי נשימות לתצוגה חיה (ספירה משוערת בלבד)
export function liveBreathCount(tMs, lnPower) {
  if (tMs.length < 100 || tMs[tMs.length - 1] - tMs[0] < 12000) return null;
  const r = analyzeBreathing(tMs.map((x) => x), lnPower, { minRpm: 3, maxRpm: 45 });
  return r.nBreaths;
}

// ================== חישובים ידניים ==================
export function bpmFromCount(count, durationSec) {
  if (!(count >= 0) || !(durationSec > 0)) return null;
  return Math.round((count * 60 / durationSec) * 10) / 10;
}
