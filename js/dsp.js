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
/**
 * @param {number[]} tMs  חותמות זמן (ms) של פריימים
 * @param {number[]} red  ממוצע ערוץ אדום בכל פריים
 * @param {{settleMs?:number, minBpm?:number, maxBpm?:number}} opts
 */
export function analyzePPG(tMs, red, opts = {}) {
  const FS = 30;
  const settleMs = opts.settleMs ?? 0;
  const minBpm = opts.minBpm ?? 40;
  const maxBpm = opts.maxBpm ?? 200;

  const res = {
    ok: false, quality: 'poor', reason: '', bpm: null, beatTimesMs: [], ibisMs: [],
    nBeats: 0, validFraction: 0, acf: 0, fps: 0, durationSec: 0, ibiMinMs: null, ibiMaxMs: null,
  };
  if (tMs.length < 40) { res.reason = 'too_short'; return res; }

  // השמטת תקופת התייצבות (חשיפה אוטומטית וכו')
  const start = tMs[0] + settleMs;
  const idx0 = tMs.findIndex((t) => t >= start);
  const t = tMs.slice(idx0).map((v) => v - tMs[idx0]);
  const v = red.slice(idx0);
  if (t.length < 40) { res.reason = 'too_short'; return res; }

  res.durationSec = t[t.length - 1] / 1000;
  res.fps = (t.length - 1) / res.durationSec;
  if (res.durationSec < 8) { res.reason = 'too_short'; return res; }
  if (res.fps < 12) { res.reason = 'low_fps'; return res; }

  const { v: u } = resampleUniform(t, v, FS);
  // בחזרה לכיוון הפיזיולוגי: נפח דם גדול -> בליעה גבוהה -> ערך אדום נמוך
  const inv = u.map((a) => -a);
  const base = movingAverage(inv, FS * 1.5);
  const hp = inv.map((a, i) => a - base[i]);
  const lp = movingAverage(movingAverage(hp, 3), 3);

  const amp = std(lp);
  if (!(amp > 0.05)) { res.reason = 'flat_signal'; return res; }

  // מרחק מינימלי בין פעימות: ~60% מהמחזוריות הדומיננטית (מונע ספירת הניקוב הדיקרוטי כפעימה)
  const lag = dominantLag(lp, Math.round(FS * 60 / maxBpm), Math.round(FS * 60 / minBpm));
  const minDist = lag ? Math.max(Math.round(FS * 60 / maxBpm * 0.85), Math.round(0.6 * lag)) : Math.round(FS * 60 / maxBpm * 0.85);
  const rough = pickPeaks(lp, minDist, 0);
  const ampsPos = rough.map((i) => lp[i]).filter((a) => a > 0);
  const thr = Math.max(0.25 * percentile(ampsPos, 0.9), 0.15 * amp);
  const peaksIdx = rough.filter((i) => lp[i] > thr);
  const beatTimes = peaksIdx.map((i) => (parabolic(lp, i) * 1000) / FS);

  res.nBeats = beatTimes.length;
  res.beatTimesMs = beatTimes.map((x) => Math.round(x));
  if (beatTimes.length < 6) { res.reason = 'few_beats'; return res; }

  const ibis = [];
  for (let i = 1; i < beatTimes.length; i++) ibis.push(beatTimes[i] - beatTimes[i - 1]);
  const med = median(ibis);
  const valid = ibis.filter((x) => x >= 0.7 * med && x <= 1.4 * med && x >= 60000 / maxBpm && x <= 60000 / minBpm);
  res.validFraction = valid.length / ibis.length;
  res.ibisMs = ibis.map((x) => Math.round(x));

  res.acf = autocorrStrength(lp, (med / 1000) * FS);

  if (valid.length < 5) { res.reason = 'unstable'; return res; }
  const avgIbi = mean(valid);
  const bpm = 60000 / avgIbi;
  if (bpm < minBpm || bpm > maxBpm) { res.reason = 'out_of_range'; return res; }

  res.ibiMinMs = Math.round(Math.min(...valid));
  res.ibiMaxMs = Math.round(Math.max(...valid));

  // איכות
  const enoughBeats = beatTimes.length >= Math.max(10, res.durationSec * minBpm / 60 * 0.6);
  if (res.validFraction >= 0.85 && res.acf >= 0.5 && enoughBeats && res.durationSec >= 20) res.quality = 'good';
  else if (res.validFraction >= 0.7 && res.acf >= 0.35 && beatTimes.length >= 8) res.quality = 'medium';
  else { res.quality = 'poor'; res.reason = 'low_quality'; return res; }

  res.ok = true;
  res.bpm = Math.round(bpm * 10) / 10;
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
  const { v: u } = resampleUniform(t, v, FS);
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
