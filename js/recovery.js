// תצוגת התאוששות: גרפים, טבלה וסיכום תצפיתי לאירועי אתגר. משמשת את מסך האתגר, ההשוואות והדוח.
// כל הערכים תיאוריים בלבד — אין דירוג כושר ואין מסקנה קלינית.

import { lineChart, dataTable, PULSE_STYLE, BREATH_STYLE } from './charts.js';
import { esc, fmtClock } from './util.js';
import { SOURCE_SHORT } from './constants.js';

export const STAGE_LABEL = { baseline: 'בסיס במנוחה', immediate: 'מיד אחרי הפעילות', recovery: 'התאוששות' };

function elapsedOf(metric) {
  return metric && metric.elapsedSinceActivityEndSec !== null && metric.elapsedSinceActivityEndSec !== undefined
    ? metric.elapsedSinceActivityEndSec : null;
}

export function splitChallenge(events) {
  const base = events.find((e) => e.challengeStage === 'baseline') || null;
  const imm = events.find((e) => e.challengeStage === 'immediate') || null;
  const rec = events.filter((e) => e.challengeStage === 'recovery')
    .sort((a, b) => (a.recoveryElapsedSec ?? 0) - (b.recoveryElapsedSec ?? 0));
  return { base, imm, rec };
}

function series(events, kind) {
  const { imm, rec } = splitChallenge(events);
  const key = kind === 'pulse' ? 'pulse' : 'breathing';
  const valKey = kind === 'pulse' ? 'bpm' : 'rpm';
  const pts = [];
  [imm, ...rec].filter(Boolean).forEach((e) => {
    const m = e[key];
    const x = elapsedOf(m);
    if (m && x !== null) pts.push({ x, y: m[valKey], label: `${m[valKey]} (${fmtClock(x)})` });
  });
  return pts;
}

function baselineValue(events, kind) {
  const { base } = splitChallenge(events);
  if (!base) return null;
  const m = kind === 'pulse' ? base.pulse : base.breathing;
  return m ? (kind === 'pulse' ? m.bpm : m.rpm) : null;
}

// סימני LRM שומרים על סדר הסימן והמספר בתוך טקסט בעברית (RTL)
const LRM = '\u200E';
const fmtSigned = (v) => `${LRM}${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 10) / 10)}${LRM}`;
const pct = (v, base) => (base ? `${LRM}${(v - base) / base * 100 > 0 ? '+' : (v - base) / base * 100 < 0 ? '−' : ''}${Math.abs(Math.round((v - base) / base * 1000) / 10)}%${LRM}` : '—');

export function recoveryCharts(events, { demo = false, combined = false, titlePrefix = '' } = {}) {
  const pPts = series(events, 'pulse');
  const bPts = series(events, 'breath');
  const pBase = baselineValue(events, 'pulse');
  const bBase = baselineValue(events, 'breath');
  const xFmt = (v) => fmtClock(v);
  const pS = { name: 'דופק (פעימות לדקה)', ...PULSE_STYLE, axis: 'left', demo, points: pPts };
  const bS = { name: 'נשימה (נשימות לדקה)', ...BREATH_STYLE, axis: combined ? 'right' : 'left', demo, points: bPts };
  const xLabel = 'זמן מתום הפעילות (דקות:שניות)';
  if (combined) {
    return lineChart({
      title: `${titlePrefix}דופק ונשימה לאורך ההתאוששות — שני צירים`,
      desc: 'גרף משולב עם שני צירים: ציר שמאלי לדופק בפעימות לדקה וציר ימני לנשימה בנשימות לדקה',
      series: [pS, bS], xLabel, yLabel: 'פעימות לדקה', y2Label: 'נשימות לדקה', xTickFmt: xFmt, xMin: 0,
      hLines: [
        ...(pBase ? [{ y: pBase, label: `בסיס דופק ${pBase}`, color: PULSE_STYLE.color, axis: 'left' }] : []),
        ...(bBase ? [{ y: bBase, label: `בסיס נשימה ${bBase}`, color: BREATH_STYLE.color, axis: 'right' }] : []),
      ],
    });
  }
  return `
    <div class="chart-grid">
      ${lineChart({
        title: `${titlePrefix}דופק לאורך ההתאוששות`, series: [pS], xLabel, yLabel: 'פעימות לדקה', xTickFmt: xFmt, xMin: 0,
        desc: 'דופק בפעימות לדקה כפונקציה של הזמן מתום הפעילות',
        hLines: pBase ? [{ y: pBase, label: `בסיס ${pBase}`, color: PULSE_STYLE.color }] : [],
        emptyText: 'אין מדידות דופק עם זמן התאוששות',
      })}
      ${lineChart({
        title: `${titlePrefix}נשימה לאורך ההתאוששות`, series: [bS], xLabel, yLabel: 'נשימות לדקה', xTickFmt: xFmt, xMin: 0,
        desc: 'קצב נשימה בנשימות לדקה כפונקציה של הזמן מתום הפעילות',
        hLines: bBase ? [{ y: bBase, label: `בסיס ${bBase}`, color: BREATH_STYLE.color }] : [],
        emptyText: 'אין מדידות נשימה עם זמן התאוששות',
      })}
    </div>`;
}

export function recoveryTable(events) {
  const { base, imm, rec } = splitChallenge(events);
  const ordered = [base, imm, ...rec].filter(Boolean);
  if (!ordered.length) return '';
  const pBase = baselineValue(events, 'pulse');
  const bBase = baselineValue(events, 'breath');
  let prevP = null, prevB = null;
  const rows = ordered.map((e) => {
    const p = e.pulse, b = e.breathing;
    const cell = (m, val, baseV, prev, srcKey) => {
      if (!m) return '—';
      const el = elapsedOf(m);
      const dBase = baseV !== null && e.challengeStage !== 'baseline' ? `<br><small>מהבסיס: ${fmtSigned(val - baseV)} (${pct(val, baseV)})</small>` : '';
      const dPrev = prev !== null && e.challengeStage !== 'baseline' ? `<br><small>מהמדידה הקודמת: ${fmtSigned(val - prev)}</small>` : '';
      return `<strong>${val}</strong> <small>(${esc(SOURCE_SHORT[m.source] || '')}${el !== null ? ', ' + fmtClock(el) : ''})</small>${dBase}${dPrev}`;
    };
    const row = [
      esc(STAGE_LABEL[e.challengeStage] || e.challengeStage || ''),
      cell(p, p && p.bpm, pBase, prevP),
      cell(b, b && b.rpm, bBase, prevB),
    ];
    if (p) prevP = p.bpm;
    if (b) prevB = b.rpm;
    return row;
  });
  return dataTable(['שלב', 'דופק (פעימות לדקה)', 'נשימה (נשימות לדקה)'], rows,
    'ערכים לפי שלב: מקור המדידה וזמן מתום הפעילות בסוגריים, והפרשים מהבסיס ומהמדידה הקודמת');
}

// סיכום תצפיתי (תיאורי): מספרים בלבד
export function recoverySummaryText(events) {
  const out = [];
  for (const kind of ['pulse', 'breath']) {
    const base = baselineValue(events, kind);
    const pts = series(events, kind);
    if (base === null || !pts.length) continue;
    const name = kind === 'pulse' ? 'דופק' : 'קצב נשימה';
    const unit = kind === 'pulse' ? 'פעימות לדקה' : 'נשימות לדקה';
    const peak = pts.reduce((a, b) => (b.y > a.y ? b : a));
    const last = pts[pts.length - 1];
    const words = (v) => {
      const d = Math.round((v - base) * 10) / 10;
      const p = Math.abs(Math.round(((v - base) / base) * 1000) / 10);
      if (d === 0) return 'זהה לבסיס';
      return `${d > 0 ? 'גבוה' : 'נמוך'} ב-${Math.abs(d)} מהבסיס (${p}%)`;
    };
    let t = `${name}: במנוחה ${base} ${unit}`;
    t += `; הערך הגבוה ביותר שנמדד ${peak.y} — ${words(peak.y)}`;
    if (pts.length > 1 || last !== peak) {
      t += `; במדידה האחרונה (${fmtClock(last.x)} מתום הפעילות) ${last.y} — ${words(last.y)}`;
    }
    out.push(t + '.');
  }
  return out;
}

export function recoveryView(events, { demo = false, combined = false, titlePrefix = '' } = {}) {
  const lines = recoverySummaryText(events);
  return `
    ${demo ? '<p class="notice sim-notice"><strong>הדגמה:</strong> הנתונים כאן מדומים ואינם נשמרים כנתונים אישיים.</p>' : ''}
    ${recoveryCharts(events, { demo, combined, titlePrefix })}
    ${recoveryTable(events)}
    ${lines.length ? `<div class="observe"><h3>סיכום תצפיתי</h3><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="hint">מדובר בתיאור מדידות בודדות שנעשו בתנאים לא מתוקננים. אין בו דירוג כושר, קביעה מי ״בריא יותר״ או מסקנה קלינית. זמני המדידה הם הזמנים האמיתיים שנרשמו, ודופק ונשימה נמדדו ברצף ולא בו-זמנית.</p></div>` : ''}`;
}

// ---- נתוני הדגמה (בזיכרון בלבד, לא נשמרים) ----
export function demoChallengeEvents() {
  const mk = (stage, ctx, elapsed, bpm, rpm) => ({
    id: 'demo-' + stage + (elapsed ?? 0),
    profileId: 'demo',
    context: ctx,
    createdAt: new Date().toISOString(),
    challengeStage: stage,
    recoveryElapsedSec: elapsed,
    pulse: { bpm, source: 'demo_simulated', quality: 'manual', durationSec: 30, sampledAt: new Date().toISOString(), elapsedSinceActivityEndSec: elapsed, beatTimesMs: [] },
    breathing: { rpm, source: 'demo_simulated', quality: 'manual', durationSec: 30, sampledAt: new Date().toISOString(), elapsedSinceActivityEndSec: elapsed, breathTimesMs: [] },
  });
  return [
    mk('baseline', 'rest', null, 74, 15),
    mk('immediate', 'effort', 18, 142, 30),
    mk('recovery', 'recovery', 68, 121, 25),
    mk('recovery', 'recovery', 131, 102, 21),
    mk('recovery', 'recovery', 194, 89, 18),
  ];
}
