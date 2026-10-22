// בדיקות אחסון: ניקוי נתונים, ייצוא/ייבוא ומחיקה (עם localStorage מדומה).
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;

const store = await import('../js/storage.js');
let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!cond) failed++; };

const a = store.addProfile({ nickname: 'דנה', relation: 'me', age: 16, sex: 'female', medical: 'פרט רגיש' });
const b = store.addProfile({ nickname: 'רן', relation: 'friend' });
check('שני פרופילים נשמרו', store.getProfiles().length === 2);
check('כינוי חובה', (() => { try { store.addProfile({ nickname: '  ' }); return false; } catch { return true; } })());

const ev = store.addEvent({
  profileId: a.id, context: 'rest',
  pulse: { bpm: 72, source: 'counted_manual', sampledAt: new Date().toISOString(), durationSec: 30, quality: 'manual', method: 'count', beatTimesMs: [] },
  breathing: { rpm: 16, source: 'counted_manual', sampledAt: new Date().toISOString(), durationSec: 30, quality: 'manual', method: 'count', breathTimesMs: [] },
});
check('אירוע נשמר עם שני מדדים', ev.pulse.bpm === 72 && ev.breathing.rpm === 16);
check('ערך לא סביר נדחה', (() => { try { store.addEvent({ profileId: a.id, context: 'rest', pulse: { bpm: 900, source: 'counted_manual' } }); return false; } catch { return true; } })());
check('מקור לא חוקי מנוקה', store.addEvent({ profileId: b.id, context: 'bogus', pulse: { bpm: 80, source: 'toString' } }).pulse.source === 'counted_manual');

const json = store.exportData({ includeBackground: false });
const parsed = JSON.parse(json);
check('ייצוא בלי רקע מרוקן גיל/מין/רקע', parsed.profiles.every((p) => p.age === null && p.sex === '' && p.medical === ''));
check('ייצוא עם רקע שומר אותו', JSON.parse(store.exportData({ includeBackground: true })).profiles.find((p) => p.id === a.id).medical === 'פרט רגיש');

check('ייבוא קובץ לא תקין נדחה', !store.parseImport('not json').ok && !store.parseImport('{"app":"other"}').ok);
check('ייבוא גרסה עתידית נדחה', !store.parseImport(JSON.stringify({ app: 'pulse-breath-lab', schema: 99 })).ok);
const bad = JSON.parse(json);
bad.events.push({ id: 'x', profileId: 'nope', context: 'rest', pulse: { bpm: 70 } });
bad.profiles.push({ id: '<img onerror=1>', nickname: '<script>alert(1)</script>' });
const imp = store.parseImport(JSON.stringify(bad));
check('אירוע ללא פרופיל נזרק', imp.ok && imp.events.length === 2);

store.clearAll();
check('מחיקה מלאה', store.getProfiles().length === 0 && store.getEvents().length === 0);
const res = store.applyImport(imp, 'merge');
check('מיזוג מוסיף', res.addedP === 3 && res.addedE === 2, JSON.stringify(res));
store.deleteProfile(a.id);
check('מחיקת פרופיל מוחקת את מדידותיו', !store.getEvents().some((e) => e.profileId === a.id));

console.log(failed ? `\n${failed} בדיקות נכשלו` : '\nכל הבדיקות עברו');
process.exit(failed ? 1 : 0);
