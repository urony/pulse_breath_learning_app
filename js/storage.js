// אחסון מקומי בלבד (localStorage). אין שליחה לשום שרת.
// כולל גרסת schema, הגירה בסיסית ואימות/ניקוי של נתונים מיובאים.

import { uid } from './util.js';
import { CONTEXTS, SOURCES, QUALITY, RELATIONS, SEXES } from './constants.js';

export const SCHEMA_VERSION = 1;
const KEY = 'pulseBreathLab.v1';

let state = null;
export let memoryOnly = false;

function emptyState() {
  return { schema: SCHEMA_VERSION, profiles: [], events: [], settings: {} };
}

// ---------- ניקוי נתונים ----------
const has = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, lo, hi) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const isoOrNull = (v) => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
};
const numArray = (v, max = 600) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0).slice(0, max) : [];

export function sanitizeProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const nickname = str(p.nickname, 30).trim();
  if (!nickname) return null;
  return {
    id: str(p.id, 80) || uid(),
    nickname,
    relation: has(RELATIONS, p.relation) ? p.relation : 'other',
    age: num(p.age, 1, 120),
    sex: has(SEXES, p.sex) ? p.sex : '',
    medical: str(p.medical, 500),
    createdAt: isoOrNull(p.createdAt) || new Date().toISOString(),
  };
}

function sanitizeMetric(m, kind) {
  if (!m || typeof m !== 'object') return null;
  const value = kind === 'pulse' ? num(m.bpm, 20, 300) : num(m.rpm, 2, 90);
  if (value === null) return null;
  const out = {
    source: has(SOURCES, m.source) ? m.source : 'counted_manual',
    sampledAt: isoOrNull(m.sampledAt) || new Date().toISOString(),
    durationSec: num(m.durationSec, 1, 600) ?? 60,
    quality: has(QUALITY, m.quality) ? m.quality : 'manual',
    method: ['camera', 'microphone', 'count', 'tap', 'demo'].includes(m.method) ? m.method : 'count',
    elapsedSinceActivityEndSec: num(m.elapsedSinceActivityEndSec, 0, 36000),
  };
  if (kind === 'pulse') {
    out.bpm = value;
    out.beatTimesMs = numArray(m.beatTimesMs);
  } else {
    out.rpm = value;
    out.breathTimesMs = numArray(m.breathTimesMs);
  }
  return out;
}

export function sanitizeEvent(e) {
  if (!e || typeof e !== 'object') return null;
  const pulse = sanitizeMetric(e.pulse, 'pulse');
  const breathing = sanitizeMetric(e.breathing, 'breath');
  if (!pulse && !breathing) return null;
  return {
    id: str(e.id, 80) || uid(),
    profileId: str(e.profileId, 80),
    context: has(CONTEXTS, e.context) ? e.context : 'other',
    contextNote: str(e.contextNote, 60),
    createdAt: isoOrNull(e.createdAt) || new Date().toISOString(),
    pulse,
    breathing,
    note: str(e.note, 200),
    challengeId: e.challengeId ? str(e.challengeId, 80) : null,
    challengeStage: ['baseline', 'immediate', 'recovery'].includes(e.challengeStage) ? e.challengeStage : null,
    recoveryElapsedSec: num(e.recoveryElapsedSec, 0, 36000),
  };
}

function migrate(data) {
  // כרגע קיימת גרסה אחת בלבד. כאן יתווספו שלבי הגירה עתידיים (v1 -> v2 וכו').
  if (!data || typeof data !== 'object') return emptyState();
  const out = emptyState();
  out.profiles = (Array.isArray(data.profiles) ? data.profiles : []).map(sanitizeProfile).filter(Boolean);
  const ids = new Set(out.profiles.map((p) => p.id));
  out.events = (Array.isArray(data.events) ? data.events : [])
    .map(sanitizeEvent)
    .filter((e) => e && ids.has(e.profileId));
  out.settings = data.settings && typeof data.settings === 'object' ? { ...data.settings } : {};
  return out;
}

// ---------- טעינה ושמירה ----------
export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? migrate(JSON.parse(raw)) : emptyState();
  } catch (err) {
    console.warn('לא ניתן לקרוא אחסון מקומי', err);
    memoryOnly = true;
    state = emptyState();
  }
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    memoryOnly = true;
    console.warn('לא ניתן לשמור באחסון מקומי', err);
    return false;
  }
  return true;
}

export const getState = () => load();
export const getProfiles = () => load().profiles;
export const getEvents = () => load().events;
export const getProfile = (id) => load().profiles.find((p) => p.id === id) || null;
export const getSetting = (k, d = null) => (k in load().settings ? load().settings[k] : d);
export function setSetting(k, v) {
  load().settings[k] = v;
  save();
}

export function addProfile(data) {
  const p = sanitizeProfile({ ...data, id: uid(), createdAt: new Date().toISOString() });
  if (!p) throw new Error('נדרש כינוי');
  load().profiles.push(p);
  save();
  return p;
}

export function updateProfile(id, data) {
  const s = load();
  const i = s.profiles.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const p = sanitizeProfile({ ...s.profiles[i], ...data, id });
  if (!p) throw new Error('נדרש כינוי');
  s.profiles[i] = p;
  save();
  return p;
}

export function deleteProfile(id) {
  const s = load();
  s.profiles = s.profiles.filter((p) => p.id !== id);
  s.events = s.events.filter((e) => e.profileId !== id);
  save();
}

export function addEvent(data) {
  const e = sanitizeEvent({ ...data, id: uid() });
  if (!e) throw new Error('אין מדידה תקינה לשמירה');
  if (!getProfile(e.profileId)) throw new Error('הפרופיל לא נמצא');
  load().events.push(e);
  save();
  return e;
}

export function updateEventNote(id, note) {
  const e = load().events.find((x) => x.id === id);
  if (e) { e.note = str(note, 200); save(); }
}

export function deleteEvent(id) {
  const s = load();
  s.events = s.events.filter((e) => e.id !== id);
  save();
}

export function clearAll() {
  state = emptyState();
  save();
  try { sessionStorage.clear(); } catch { /* ignore */ }
}

// ---------- ייצוא וייבוא ----------
export function exportData({ includeBackground = false } = {}) {
  const s = load();
  const profiles = s.profiles.map((p) =>
    includeBackground ? p : { ...p, age: null, sex: '', medical: '' });
  return JSON.stringify(
    {
      app: 'pulse-breath-lab',
      schema: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      includesBackgroundDetails: includeBackground,
      profiles,
      events: s.events,
    },
    null,
    2,
  );
}

// מחזיר { ok, error, profiles, events } אחרי בדיקת תקינות; אינו מריץ שום קוד מהקובץ.
export function parseImport(text) {
  let data;
  if (typeof text !== 'string' || text.length > 20 * 1024 * 1024) return { ok: false, error: 'הקובץ גדול או לא תקין' };
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'הקובץ אינו JSON תקין' }; }
  if (!data || data.app !== 'pulse-breath-lab') return { ok: false, error: 'הקובץ אינו קובץ ייצוא של מעבדת הדופק והנשימה' };
  if (typeof data.schema !== 'number' || data.schema > SCHEMA_VERSION) {
    return { ok: false, error: 'גרסת הקובץ חדשה מדי עבור גרסה זו של היישום' };
  }
  const m = migrate(data);
  return { ok: true, profiles: m.profiles, events: m.events };
}

export function applyImport({ profiles, events }, mode = 'merge') {
  const s = load();
  if (mode === 'replace') { s.profiles = []; s.events = []; }
  const pIds = new Set(s.profiles.map((p) => p.id));
  const eIds = new Set(s.events.map((e) => e.id));
  let addedP = 0, addedE = 0;
  profiles.forEach((p) => { if (!pIds.has(p.id)) { s.profiles.push(p); pIds.add(p.id); addedP++; } });
  events.forEach((e) => { if (!eIds.has(e.id) && pIds.has(e.profileId)) { s.events.push(e); eIds.add(e.id); addedE++; } });
  save();
  return { addedP, addedE };
}
