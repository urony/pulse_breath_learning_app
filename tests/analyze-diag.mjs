// ניתוח קובץ אבחון PPG שהורד מהאפליקציה: node tests/analyze-diag.mjs file.json
import fs from 'node:fs';
import { resampleUniform, movingAverage, analyzePPG } from '../js/dsp.js';

const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { ts, red } = d;
const FS = 30;
const { v: u } = resampleUniform(ts, red, FS);
console.log('n', ts.length, 'fps', (ts.length / (ts.at(-1) / 1000)).toFixed(1), 'min/max', Math.min(...red), Math.max(...red));
// קפיצות בין פריימים
const jumps = [];
for (let i = 1; i < red.length; i++) if (Math.abs(red[i] - red[i - 1]) > 1.5) jumps.push([i, ts[i], (red[i] - red[i - 1]).toFixed(1)]);
console.log('big jumps (>1.5):', jumps.length, JSON.stringify(jumps.slice(0, 20)));
// ספקטרום על הנגזרת/מסונן
const base = movingAverage(u, FS * 1.5);
const hp = u.map((a, i) => a - base[i]);
function dft(x, f) { let re = 0, im = 0; for (let i = 0; i < x.length; i++) { const w = 2 * Math.PI * f * i / FS; re += x[i] * Math.cos(w); im += x[i] * Math.sin(w); } return Math.hypot(re, im) / x.length; }
const spec = [];
for (let f = 0.4; f <= 4; f += 0.05) spec.push([f, dft(hp, f)]);
spec.sort((a, b) => b[1] - a[1]);
console.log('top freqs (Hz, bpm, amp):', spec.slice(0, 8).map(([f, a]) => `${f.toFixed(2)}Hz/${(f * 60).toFixed(0)}bpm/${a.toFixed(3)}`).join('  '));
console.log('analyze (settle 0):', JSON.stringify({ ...analyzePPG(ts, red, { settleMs: 0 }), beatTimesMs: undefined, ibisMs: undefined }));
console.log('analyze (settle 4000):', JSON.stringify({ ...analyzePPG(ts, red, { settleMs: 4000 }), beatTimesMs: undefined, ibisMs: undefined }));
