// צליל: טיקים קצרים (WebAudio). נוצר רק אחרי פעולת משתמש; כפתור עצירה/השתקה זמין תמיד.

let ctx = null;
let master = null;

export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function audioSupported() { return !!(window.AudioContext || window.webkitAudioContext); }

export function tick(atTime, { freq = 880, dur = 0.07, gain = 0.5, type = 'sine' } = {}) {
  if (!ctx) return;
  const t = atTime ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// רעש רך ונמוך (להמחשת פרפור חדרים — ללא "דופק")
let noiseNode = null;
export function startRumble() {
  if (!ctx) return;
  stopRumble();
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 140;
  const g = ctx.createGain();
  g.gain.value = 0.35;
  src.connect(lp).connect(g).connect(master);
  src.start();
  noiseNode = src;
}
export function stopRumble() {
  if (noiseNode) { try { noiseNode.stop(); } catch { /* ignore */ } noiseNode = null; }
}

export function now() { return ctx ? ctx.currentTime : 0; }

// עצירת כל הצלילים שתוזמנו מראש (מנתקים את המסלול הישן ויוצרים חדש)
export function stopAllSounds() {
  stopRumble();
  if (!ctx || !master) return;
  try { master.disconnect(); } catch { /* ignore */ }
  master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);
}

export function setMasterGain(v) { if (master) master.gain.value = v; }

export function closeAudio() {
  stopRumble();
  if (ctx) { try { ctx.close(); } catch { /* ignore */ } }
  ctx = null; master = null;
}
