// ניהול הרשאות מצלמה/מיקרופון: בקשה רק אחרי לחיצה מפורשת, ושחרור מובטח של כל הזרמים.

const active = new Set();

export const isSecure = () => window.isSecureContext;
export const hasMedia = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

export function cameraSupport() {
  if (!isSecure()) return { ok: false, why: 'הדפדפן חוסם גישה למצלמה בדף שאינו מאובטח (נדרש https).' };
  if (!hasMedia()) return { ok: false, why: 'הדפדפן במכשיר זה אינו תומך בגישה למצלמה.' };
  return { ok: true };
}
export function micSupport() {
  if (!isSecure()) return { ok: false, why: 'הדפדפן חוסם גישה למיקרופון בדף שאינו מאובטח (נדרש https).' };
  if (!hasMedia()) return { ok: false, why: 'הדפדפן במכשיר זה אינו תומך בגישה למיקרופון.' };
  return { ok: true };
}

export function describeError(err, kind) {
  const what = kind === 'camera' ? 'למצלמה' : 'למיקרופון';
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `ההרשאה ${what} נדחתה. אפשר לאשר אותה בהגדרות האתר בדפדפן, או לבחור בספירה ידנית.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `לא נמצא ${kind === 'camera' ? 'מצלמה מתאימה' : 'מיקרופון'} במכשיר.`;
    case 'NotReadableError':
    case 'AbortError':
      return `${kind === 'camera' ? 'המצלמה' : 'המיקרופון'} בשימוש באפליקציה אחרת או שאינו זמין כרגע.`;
    default:
      return `לא ניתן להפעיל גישה ${what} (${(err && err.message) || 'שגיאה לא ידועה'}).`;
  }
}

// מבקש זרם; חייב להיקרא ישירות מתוך לחיצת משתמש.
export async function acquire(constraints) {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  active.add(stream);
  return stream;
}

export function release(stream) {
  if (!stream) return;
  try { stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } }); } catch { /* ignore */ }
  active.delete(stream);
}

export function releaseAll() {
  Array.from(active).forEach(release);
}

// רישום פעולות ניקוי (טיימרים, לולאות מדידה) שמופעלות במעבר מסך או בסגירת הדף
const aborters = new Set();
export function onAbort(fn) {
  aborters.add(fn);
  return () => aborters.delete(fn);
}
export function abortAll() {
  Array.from(aborters).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  aborters.clear();
  releaseAll();
}

export function activeCount() { return active.size; }

// שחרור בעת סגירת הדף או מעבר לרקע
window.addEventListener('pagehide', abortAll);
