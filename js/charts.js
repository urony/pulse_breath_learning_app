// גרפי SVG נגישים: קו (עם ציר שני אופציונלי), עמודות וציר זמן של פעימות.
// הבחנה בין מדדים לא רק בצבע אלא גם בצורת סמן ובסוג קו (עיוורון צבעים).

import { esc } from './util.js';
import { PULSE_COLOR, BREATH_COLOR } from './constants.js';

let uidCounter = 0;
const nextId = () => `ch${++uidCounter}`;

export const MARKERS = ['circle', 'square', 'triangle', 'diamond', 'cross'];
export const DASHES = ['', '7 4', '2 4', '10 4 2 4', '4 2'];

export const PULSE_STYLE = { color: PULSE_COLOR, dash: '', marker: 'circle' };
export const BREATH_STYLE = { color: BREATH_COLOR, dash: '7 4', marker: 'square' };

function niceTicks(lo, hi, target = 5) {
  if (!(hi > lo)) { hi = lo + 1; }
  const span = hi - lo;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { ticks, min: start, max: end };
}

function markerSvg(kind, x, y, color, filled = true, r = 4.5) {
  const f = filled ? color : '#fff';
  const common = `stroke="${color}" stroke-width="2" fill="${f}"`;
  switch (kind) {
    case 'square': return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" ${common}/>`;
    case 'triangle': return `<polygon points="${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}" ${common}/>`;
    case 'diamond': return `<polygon points="${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}" ${common}/>`;
    case 'cross': return `<path d="M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}" stroke="${color}" stroke-width="2.5" fill="none"/>`;
    default: return `<circle cx="${x}" cy="${y}" r="${r}" ${common}/>`;
  }
}

export function legendHtml(series) {
  return `<ul class="legend">${series.map((s) => {
    if (s.bar) {
      const pid = nextId();
      const fill = s.pattern === 'hatch' ? `url(#${pid})` : s.color;
      const defs = s.pattern === 'hatch'
        ? `<defs><pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><rect width="3" height="6" fill="${s.color}"/></pattern></defs>` : '';
      return `<li><svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">${defs}<rect x="1" y="1" width="20" height="12" fill="${fill}" stroke="${s.color}" stroke-width="1.5"/></svg><span>${esc(s.name)}</span></li>`;
    }
    const sw = `<svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">
      <line x1="2" y1="7" x2="32" y2="7" stroke="${s.color}" stroke-width="2.5" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>
      ${markerSvg(s.marker || 'circle', 17, 7, s.color, !s.demo, 4)}</svg>`;
    return `<li>${sw}<span>${esc(s.name)}${s.demo ? ' (הדגמה)' : ''}</span></li>`;
  }).join('')}</ul>`;
}

function emptyChart(text) {
  return `<div class="empty-chart" role="note">${esc(text)}</div>`;
}

/**
 * גרף קו. series[i] = { name, axis:'left'|'right', color, dash, marker, demo, points:[{x,y,label?}] }
 */
export function lineChart(o) {
  const series = (o.series || []).filter((s) => s.points && s.points.length);
  if (!series.length) return emptyChart(o.emptyText || 'אין מספיק נתונים להצגה');
  const W = o.width || 360, H = o.height || 250;
  const hasRight = series.some((s) => s.axis === 'right');
  const m = { l: 46, r: hasRight ? 46 : 14, t: 14, b: 46 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;

  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  let xMin = o.xMin ?? Math.min(...xs), xMax = o.xMax ?? Math.max(...xs);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  const xt = niceTicks(xMin, xMax, 5);
  if (o.xMin === undefined) xMin = xt.min;
  if (o.xMax === undefined) xMax = xt.max;

  const ranges = {};
  for (const axis of ['left', 'right']) {
    const ss = series.filter((s) => (s.axis || 'left') === axis);
    if (!ss.length) continue;
    const ys = ss.flatMap((s) => s.points.map((p) => p.y));
    (o.hLines || []).filter((h) => (h.axis || 'left') === axis).forEach((h) => ys.push(h.y));
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = Math.max((hi - lo) * 0.15, 3);
    lo = Math.max(0, lo - pad); hi += pad;
    const t = niceTicks(lo, hi, 5);
    ranges[axis] = t;
  }
  const X = (x) => m.l + ((x - xMin) / (xMax - xMin)) * pw;
  const Y = (y, axis) => { const r = ranges[axis || 'left']; return m.t + ph - ((y - r.min) / (r.max - r.min)) * ph; };

  let g = '';
  // רשת וציר שמאלי
  const lt = ranges.left || ranges.right;
  lt.ticks.forEach((tv) => {
    const y = m.t + ph - ((tv - lt.min) / (lt.max - lt.min)) * ph;
    g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${y}" y2="${y}" class="grid"/>`;
    if (ranges.left) g += `<text x="${m.l - 6}" y="${y + 4}" text-anchor="end" class="tick">${tv}</text>`;
  });
  if (ranges.right) {
    ranges.right.ticks.forEach((tv) => {
      const y = m.t + ph - ((tv - ranges.right.min) / (ranges.right.max - ranges.right.min)) * ph;
      g += `<text x="${m.l + pw + 6}" y="${y + 4}" text-anchor="start" class="tick">${tv}</text>`;
    });
  }
  xt.ticks.filter((v) => v >= xMin && v <= xMax).forEach((tv) => {
    const x = X(tv);
    g += `<line x1="${x}" x2="${x}" y1="${m.t + ph}" y2="${m.t + ph + 4}" class="axis"/>`;
    g += `<text x="${x}" y="${m.t + ph + 17}" text-anchor="middle" class="tick">${esc(o.xTickFmt ? o.xTickFmt(tv) : tv)}</text>`;
  });
  g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${m.t + ph}" y2="${m.t + ph}" class="axis"/>`;
  g += `<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t + ph}" class="axis"/>`;
  if (ranges.right) g += `<line x1="${m.l + pw}" x2="${m.l + pw}" y1="${m.t}" y2="${m.t + ph}" class="axis"/>`;

  // קווי ייחוס (למשל בסיס במנוחה)
  (o.hLines || []).forEach((h) => {
    const y = Y(h.y, h.axis);
    g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${y}" y2="${y}" stroke="${h.color || '#555'}" stroke-width="1.5" stroke-dasharray="1 5" stroke-linecap="round"/>`;
    g += `<text x="${m.l + pw - 2}" y="${y - 4}" text-anchor="end" class="tick" fill="${h.color || '#555'}">${esc(h.label || '')}</text>`;
  });

  // תוויות צירים
  g += `<text x="${m.l + pw / 2}" y="${H - 6}" text-anchor="middle" class="axis-label">${esc(o.xLabel || '')}</text>`;
  if (o.yLabel) g += `<text transform="translate(12 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" class="axis-label" fill="${series.find((s) => (s.axis || 'left') === 'left')?.color || '#333'}">${esc(o.yLabel)}</text>`;
  if (hasRight && o.y2Label) g += `<text transform="translate(${W - 10} ${m.t + ph / 2}) rotate(90)" text-anchor="middle" class="axis-label" fill="${series.find((s) => s.axis === 'right')?.color || '#333'}">${esc(o.y2Label)}</text>`;

  // סדרות
  series.forEach((s) => {
    const pts = [...s.points].sort((a, b) => a.x - b.x);
    const axis = s.axis || 'left';
    if (pts.length > 1) {
      g += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} points="${pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.y, axis).toFixed(1)}`).join(' ')}"/>`;
    }
    pts.forEach((p) => {
      g += markerSvg(s.marker || 'circle', X(p.x), Y(p.y, axis), s.color, !s.demo);
      g += `<title>${esc(s.name)}: ${esc(p.label || `${p.y}`)}</title>`;
    });
  });

  const aria = o.desc || o.title || 'גרף';
  return `<figure class="chart">
    ${o.title ? `<figcaption class="chart-title">${esc(o.title)}</figcaption>` : ''}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}" direction="ltr">${g}</svg>
    ${legendHtml(series)}
  </figure>`;
}

/**
 * גרף עמודות מקובצות. o.groups=[{label, values:[...]}], o.series=[{name,color,pattern,axis}]
 */
function splitLabel(label, max = 20) {
  const words = String(label).split(' ');
  const lines = [];
  let cur = '';
  words.forEach((w) => { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

// עמודות אופקיות: קריאות כשיש הרבה קבוצות
function hBarChart(o, groups, series) {
  const W = o.width || 360;
  const hasRight = series.some((s) => s.axis === 'right');
  const labelW = 124;
  const rowH = 16 * series.length + 18;
  const m = { l: labelW, r: 30, t: hasRight ? 30 : 10, b: 34 };
  const pw = W - m.l - m.r, ph = groups.length * rowH;
  const H = m.t + ph + m.b;
  const ranges = {};
  for (const axis of ['left', 'right']) {
    const idx = series.map((s, i) => ((s.axis || 'left') === axis ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const vals = groups.flatMap((g) => idx.map((i) => g.values[i]).filter((v) => v !== null && v !== undefined));
    ranges[axis] = niceTicks(0, Math.max(...vals, 1) * 1.1, 4);
  }
  const id = nextId();
  let g = `<defs>${series.map((s, i) => (s.pattern === 'hatch'
    ? `<pattern id="${id}p${i}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><rect width="3" height="6" fill="${s.color}"/></pattern>` : '')).join('')}</defs>`;
  const X = (v, axis) => m.l + (v / ranges[axis].max) * pw;
  (ranges.left || ranges.right).ticks.forEach((tv) => {
    const ax = ranges.left ? 'left' : 'right';
    const x = X(tv, ax);
    g += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${m.t + ph}" class="grid"/>`;
    g += `<text x="${x}" y="${m.t + ph + 14}" text-anchor="middle" class="tick">${tv}</text>`;
  });
  if (ranges.right && ranges.left) ranges.right.ticks.forEach((tv) => {
    g += `<text x="${X(tv, 'right')}" y="${m.t - 6}" text-anchor="middle" class="tick">${tv}</text>`;
  });
  g += `<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t + ph}" class="axis"/>`;
  groups.forEach((grp, gi) => {
    const y0 = m.t + gi * rowH;
    splitLabel(grp.label, 20).forEach((ln, li, arr) => {
      g += `<text x="${m.l - 6}" y="${y0 + rowH / 2 + 4 + (li - (arr.length - 1) / 2) * 12}" text-anchor="end" class="tick">${esc(ln)}</text>`;
    });
    series.forEach((s, si) => {
      const v = grp.values[si];
      if (v === null || v === undefined) return;
      const w = Math.max(1, (v / ranges[s.axis || 'left'].max) * pw);
      const y = y0 + 9 + si * 16;
      const fill = s.pattern === 'hatch' ? `url(#${id}p${si})` : s.color;
      g += `<rect x="${m.l}" y="${y - 5}" width="${w}" height="14" fill="${fill}" stroke="${s.color}" stroke-width="1.5"><title>${esc(s.name)}: ${v}</title></rect>`;
      g += `<text x="${m.l + w + 4}" y="${y + 6}" class="tick bar-val">${Math.round(v * 10) / 10}</text>`;
    });
  });
  const lc = series.find((s) => (s.axis || 'left') === 'left');
  const rc = series.find((s) => s.axis === 'right');
  if (o.yLabel) g += `<text x="${m.l + pw / 2}" y="${H - 4}" text-anchor="middle" class="axis-label" fill="${(lc || rc).color}">${esc(o.yLabel)}</text>`;
  if (hasRight && o.y2Label) g += `<text x="${m.l + pw / 2}" y="12" text-anchor="middle" class="axis-label" fill="${rc.color}">${esc(o.y2Label)}</text>`;
  return `<figure class="chart">
    ${o.title ? `<figcaption class="chart-title">${esc(o.title)}</figcaption>` : ''}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.desc || o.title || 'גרף עמודות')}" direction="ltr">${g}</svg>
    ${legendHtml(series.map((s) => ({ ...s, bar: true })))}
  </figure>`;
}

export function barChart(o) {
  const groups = (o.groups || []).filter((g) => g.values.some((v) => v !== null && v !== undefined));
  if (!groups.length) return emptyChart(o.emptyText || 'אין מספיק נתונים להצגה');
  const series = o.series;
  if (groups.length > 5) return hBarChart(o, groups, series);
  const W = o.width || 360, H = o.height || 260;
  const hasRight = series.some((s) => s.axis === 'right');
  const m = { l: 46, r: hasRight ? 46 : 14, t: 14, b: 62 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const ranges = {};
  for (const axis of ['left', 'right']) {
    const idx = series.map((s, i) => ((s.axis || 'left') === axis ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const vals = groups.flatMap((g) => idx.map((i) => g.values[i]).filter((v) => v !== null && v !== undefined));
    const hi = Math.max(...vals, 1);
    ranges[axis] = niceTicks(0, hi * 1.1, 5);
  }
  const id = nextId();
  let defs = `<defs>${series.map((s, i) => (s.pattern === 'hatch'
    ? `<pattern id="${id}p${i}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><rect width="3" height="6" fill="${s.color}"/></pattern>`
    : '')).join('')}</defs>`;
  let g = defs;
  const lt = ranges.left || ranges.right;
  lt.ticks.forEach((tv) => {
    const y = m.t + ph - ((tv - lt.min) / (lt.max - lt.min)) * ph;
    g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${y}" y2="${y}" class="grid"/>`;
    if (ranges.left) g += `<text x="${m.l - 6}" y="${y + 4}" text-anchor="end" class="tick">${tv}</text>`;
  });
  if (ranges.right) ranges.right.ticks.forEach((tv) => {
    const y = m.t + ph - ((tv - ranges.right.min) / (ranges.right.max - ranges.right.min)) * ph;
    g += `<text x="${m.l + pw + 6}" y="${y + 4}" class="tick">${tv}</text>`;
  });
  g += `<line x1="${m.l}" x2="${m.l + pw}" y1="${m.t + ph}" y2="${m.t + ph}" class="axis"/>`;
  g += `<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t + ph}" class="axis"/>`;
  if (ranges.right) g += `<line x1="${m.l + pw}" x2="${m.l + pw}" y1="${m.t}" y2="${m.t + ph}" class="axis"/>`;

  const gw = pw / groups.length;
  const bw = Math.min(34, (gw * 0.78) / series.length);
  groups.forEach((grp, gi) => {
    const cx = m.l + gw * gi + gw / 2;
    series.forEach((s, si) => {
      const v = grp.values[si];
      if (v === null || v === undefined) return;
      const r = ranges[s.axis || 'left'];
      const h = ((v - r.min) / (r.max - r.min)) * ph;
      const x = cx - (series.length * bw) / 2 + si * bw;
      const fill = s.pattern === 'hatch' ? `url(#${id}p${si})` : s.color;
      g += `<rect x="${x + 1}" y="${m.t + ph - h}" width="${bw - 2}" height="${h}" fill="${fill}" stroke="${s.color}" stroke-width="1.5"><title>${esc(s.name)}: ${v}</title></rect>`;
      g += `<text x="${x + bw / 2}" y="${m.t + ph - h - 4}" text-anchor="middle" class="tick bar-val">${Math.round(v * 10) / 10}</text>`;
    });
    // תווית קבוצה — עד שתי שורות
    const words = String(grp.label).split(' ');
    const lines = [];
    let cur = '';
    words.forEach((w) => { if ((cur + ' ' + w).trim().length > Math.max(9, gw / 6)) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((ln, li) => {
      g += `<text x="${cx}" y="${m.t + ph + 15 + li * 12}" text-anchor="middle" class="tick">${esc(ln)}</text>`;
    });
  });
  if (o.yLabel) g += `<text transform="translate(12 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" class="axis-label" fill="${series.find((s) => (s.axis || 'left') === 'left')?.color || '#333'}">${esc(o.yLabel)}</text>`;
  if (hasRight && o.y2Label) g += `<text transform="translate(${W - 10} ${m.t + ph / 2}) rotate(90)" text-anchor="middle" class="axis-label" fill="${series.find((s) => s.axis === 'right')?.color || '#333'}">${esc(o.y2Label)}</text>`;

  const leg = legendHtml(series.map((s) => ({ ...s, bar: true })));
  return `<figure class="chart">
    ${o.title ? `<figcaption class="chart-title">${esc(o.title)}</figcaption>` : ''}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.desc || o.title || 'גרף עמודות')}" direction="ltr">${g}</svg>
    ${leg}
  </figure>`;
}

/**
 * ציר זמן של פעימות/נשימות: קו אנכי בכל אירוע. מבוסס אך ורק על זמנים שנמדדו או הודגמו.
 * o: { events:[ms], durationMs, color, kind:'pulse'|'breath', simulated, highlight:[indices], label, height }
 */
export function beatTimeline(o) {
  const W = o.width || 360, H = o.height || 90;
  const m = { l: 14, r: 14, t: 10, b: 26 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const dur = Math.max(1000, o.durationMs || Math.max(...(o.events || [0])) + 500);
  const X = (ms) => m.l + (ms / dur) * pw;
  let g = `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" class="tl-bg"/>`;
  const secStep = dur > 40000 ? 10 : dur > 15000 ? 5 : 2;
  for (let s = 0; s * 1000 <= dur; s += secStep) {
    const x = X(s * 1000);
    g += `<line x1="${x}" x2="${x}" y1="${m.t + ph}" y2="${m.t + ph + 4}" class="axis"/>`;
    g += `<text x="${x}" y="${m.t + ph + 16}" text-anchor="middle" class="tick">${s}</text>`;
  }
  g += `<text x="${W - m.r}" y="${H - 2}" text-anchor="end" class="axis-label">שניות</text>`;
  const hi = new Set(o.highlight || []);
  (o.events || []).forEach((ms, i) => {
    if (ms > dur) return;
    const x = X(ms);
    const special = hi.has(i);
    g += `<line x1="${x}" x2="${x}" y1="${m.t + (special ? 2 : 8)}" y2="${m.t + ph - 2}" stroke="${o.color}" stroke-width="${special ? 4 : 2.5}" ${special ? 'stroke-dasharray="4 2"' : ''} stroke-linecap="round"/>`;
  });
  if (!(o.events || []).length) {
    g += `<text x="${m.l + pw / 2}" y="${m.t + ph / 2 + 4}" text-anchor="middle" class="tl-empty">${esc(o.emptyLabel || 'אין אירועים להצגה')}</text>`;
  }
  g += `<line x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}" class="playhead" visibility="hidden"/>`;
  const badge = o.simulated ? '<span class="badge sim">הדגמה — לא נמדד</span>' : '<span class="badge real">נמדד</span>';
  return `<figure class="chart timeline" data-m-l="${m.l}" data-pw="${pw}" data-dur="${dur}">
    ${o.label ? `<figcaption class="chart-title">${esc(o.label)} ${badge}</figcaption>` : ''}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.desc || o.label || 'ציר זמן')}" direction="ltr">${g}</svg>
  </figure>`;
}

// טבלת נתונים נגישה לצד גרף
export function dataTable(headers, rows, caption) {
  return `<div class="table-wrap"><table class="data">
    ${caption ? `<caption>${esc(caption)}</caption>` : ''}
    <thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}
