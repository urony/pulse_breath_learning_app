// בדיקות לעיבוד האות על אותות סינתטיים (לא מחליפות בדיקה על מכשירים אמיתיים).
import { analyzePPG, analyzeBreathing, bpmFromCount } from '../js/dsp.js';

let failed = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!cond) failed++;
}
// מחולל פסאודו-אקראי דטרמיניסטי
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

function synthPPG({ steps = 0, bpm = 72, seconds = 36, fps = 30, noise = 0.35, amp = 1.5, hrv = 0.03, drift = 4, seed = 1, motion = 0, none = false }) {
  const r = rng(seed);
  const beats = [];
  let tb = 0.3;
  while (tb < seconds + 2) { beats.push(tb); tb += (60 / bpm) * (1 + hrv * gauss(r)); }
  const t = [], v = [];
  let stepOff = 0;
  for (let ms = 0, i = 0; ms < seconds * 1000; i++) {
    const time = ms / 1000;
    let p = 0;
    for (const b of beats) {
      const d = time - b;
      if (d > -0.3 && d < 0.9) p += Math.exp(-((d - 0.12) ** 2) / (2 * 0.06 ** 2)) + 0.35 * Math.exp(-((d - 0.38) ** 2) / (2 * 0.08 ** 2));
    }
    const slow = drift * Math.sin(2 * Math.PI * 0.05 * time) + drift * 0.5 * Math.sin(2 * Math.PI * 0.013 * time + 1);
    const mot = motion * Math.sin(2 * Math.PI * 1.7 * time) * (Math.sin(2 * Math.PI * 0.2 * time) > 0.5 ? 1 : 0);
    if (steps && r() < steps) stepOff += (r() < 0.5 ? -1 : 1) * (3 + 6 * r());
    v.push(200 - (none ? 0 : amp * p) + slow + mot + stepOff + noise * gauss(r));
    t.push(ms);
    ms += 1000 / fps + (r() - 0.5) * 6; // ג'יטר
  }
  return { t, v, truth: bpm };
}

for (const bpm of [48, 60, 72, 95, 130, 160]) {
  const s = synthPPG({ bpm, seed: bpm });
  const r = analyzePPG(s.t, s.v, { settleMs: 4000 });
  check(`PPG נקי ${bpm} BPM`, r.ok && Math.abs(r.bpm - bpm) <= 2, `-> ${r.bpm} (${r.quality}, valid=${r.validFraction.toFixed(2)}, acf=${r.acf.toFixed(2)}, ${r.reason})`);
}
{
  const s = synthPPG({ bpm: 80, noise: 0.9, seed: 77 });
  const r = analyzePPG(s.t, s.v, { settleMs: 4000 });
  check('PPG רועש: דיוק או דחייה', !r.ok || Math.abs(r.bpm - 80) <= 4, `-> ${r.ok} ${r.bpm} ${r.quality} ${r.reason}`);
}
{
  const s = synthPPG({ none: true, noise: 0.5, seed: 5 });
  const r = analyzePPG(s.t, s.v, { settleMs: 4000 });
  check('רעש בלבד: אין BPM', !r.ok && r.bpm === null, `-> ${r.reason} beats=${r.nBeats} valid=${r.validFraction.toFixed(2)} acf=${r.acf.toFixed(2)}`);
}
{
  const s = synthPPG({ none: true, noise: 0.5, seed: 6, drift: 10 });
  const r = analyzePPG(s.t, s.v, { settleMs: 4000 });
  check('רעש ודריפט בלבד: אין BPM', !r.ok, `-> ${r.reason}`);
}
{
  const s = synthPPG({ bpm: 75, motion: 6, seed: 9 });
  const r = analyzePPG(s.t, s.v, { settleMs: 4000 });
  check('תנועה: דיוק או דחייה', !r.ok || Math.abs(r.bpm - 75) <= 4, `-> ${r.ok} ${r.bpm} ${r.quality} ${r.reason}`);
}
{
  const s = synthPPG({ bpm: 70, fps: 6, seed: 3 });
  const r = analyzePPG(s.t, s.v, { settleMs: 4000 });
  check('קצב פריימים נמוך מאוד נדחה', !r.ok && r.reason === 'low_fps', `-> ${r.reason}`);
  const s2 = synthPPG({ bpm: 70, fps: 10, seed: 4 });
  const r2 = analyzePPG(s2.t, s2.v, { settleMs: 4000 });
  check('10 פריימים בשנייה: דיוק או דחייה', !r2.ok || Math.abs(r2.bpm - 70) <= 3, `-> ${r2.bpm} ${r2.reason}`);
}
{
  const s = synthPPG({ bpm: 70, seconds: 6, seed: 3 });
  const r = analyzePPG(s.t, s.v, { settleMs: 0 });
  check('מדידה קצרה מדי נדחית', !r.ok);
}

{
  // דמוי טלפון אמיתי: 14fps, משרעת פעימה קטנה (0.35) על רקע בהיר, מדרגות חשיפה אקראיות, דופק איטי
  const s = synthPPG({ bpm: 53, fps: 14, amp: 0.35, noise: 0.1, drift: 1.5, steps: 0.015, seconds: 34, seed: 31 });
  const r = analyzePPG(s.t, s.v, { settleMs: 4000 });
  check('PPG חלש עם מדרגות ב-14fps (53 BPM)', r.ok && Math.abs(r.bpm - 53) <= 3, `-> ${r.bpm} (${r.quality}, snr=${(r.specSnr || 0).toFixed(2)}, ${r.reason})`);
}

{
  // עמידות לרעש: רעש לבן, סחיפה אקראית ומדרגות חשיפה אקראיות — אסור לקבל אף אחד כדופק
  let accepted = 0, total = 0;
  for (const kind of ['white', 'walk', 'steps']) {
    for (let seed = 1; seed <= 30; seed++) {
      const r = rng(seed * 7 + kind.length);
      const tt = [], vv = [];
      let w = 0, off = 0;
      for (let i = 0; i < 34 * 30; i++) {
        tt.push((i * 1000) / 30 + (r() - 0.5) * 5);
        w += 0.3 * gauss(r);
        if (r() < 0.01) off += (r() - 0.5) * 12;
        vv.push(220 + (kind === 'white' ? 0.5 * gauss(r) : kind === 'walk' ? w + 0.3 * gauss(r) : off + 0.3 * gauss(r)));
      }
      total++;
      if (analyzePPG(tt, vv, { settleMs: 4000 }).ok) accepted++;
    }
  }
  check('רעש קיצוני סינתטי (לבן/סחיפה/מדרגות): עד 12% קבלות', accepted <= 0.12 * total, `-> ${accepted}/${total}`);
}

// ---------- נשימה ----------
function synthBreath({ rpm = 15, seconds = 60, fs = 20, noise = 0.1, depth = 0.9, speech = 0, seed = 1, none = false }) {
  const r = rng(seed);
  const t = [], v = [];
  const period = 60 / rpm;
  let speechState = 0;
  for (let i = 0; i < seconds * fs; i++) {
    const time = i / fs;
    const ph = (time % period) / period;
    // נשיפה = פרץ רעש: מעטפת חצי-סינוס
    const burst = ph < 0.5 ? Math.sin(Math.PI * ph / 0.5) : 0;
    if (i % 3 === 0) speechState = r() < 0.5 ? 1 : 0;
    let x = -12 + (none ? 0 : depth * burst) + speech * speechState + noise * gauss(r);
    t.push(1000 * time + (r() - 0.5) * 8);
    v.push(x);
  }
  return { t, v };
}
for (const rpm of [8, 12, 16, 20, 28]) {
  const s = synthBreath({ rpm, seed: rpm });
  const r = analyzeBreathing(s.t, s.v);
  check(`נשימה נקייה ${rpm} לדקה`, r.ok && Math.abs(r.rpm - rpm) <= 1.5, `-> ${r.rpm} (${r.quality}, n=${r.nBreaths}, valid=${r.validFraction.toFixed(2)}, rough=${r.roughness.toFixed(2)}, ${r.reason})`);
}
{
  const s = synthBreath({ rpm: 14, depth: 0.6, noise: 0.18, seed: 21 });
  const r = analyzeBreathing(s.t, s.v);
  check('נשימה עדינה ורועשת: דיוק או דחייה', !r.ok || Math.abs(r.rpm - 14) <= 2, `-> ${r.ok} ${r.rpm} ${r.quality} ${r.reason}`);
}
{
  const s = synthBreath({ none: true, seed: 4 });
  const r = analyzeBreathing(s.t, s.v);
  check('שקט בלבד: אין נשימה', !r.ok && r.rpm === null, `-> ${r.reason}`);
}
{
  const s = synthBreath({ none: true, speech: 1.2, seed: 8 });
  const r = analyzeBreathing(s.t, s.v);
  check('דיבור (מודולציה מהירה) נדחה', !r.ok, `-> ${r.reason} rough=${r.roughness.toFixed(2)}`);
}
{
  const s = synthBreath({ rpm: 15, seconds: 20 });
  const r = analyzeBreathing(s.t, s.v);
  check('מדידת נשימה קצרה מדי נדחית', !r.ok && r.reason === 'too_short');
}

// ---------- חישוב ידני לפי קריטריוני הקבלה ----------
check('36 פעימות ב-30 שניות = 72', bpmFromCount(36, 30) === 72);
check('8 נשימות ב-30 שניות = 16', bpmFromCount(8, 30) === 16);
check('קלט לא תקין מחזיר null', bpmFromCount(-1, 30) === null && bpmFromCount(5, 0) === null);

console.log(failed ? `\n${failed} בדיקות נכשלו` : '\nכל הבדיקות עברו');
process.exit(failed ? 1 : 0);
