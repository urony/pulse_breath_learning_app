// נקודת הכניסה: ניתוב לפי hash (מתאים ל-GitHub Pages תחת נתיב repository), תפריט, והצהרה רפואית.

import * as store from './storage.js';
import { abortAll } from './permissions.js';
import { esc, openModal, toast } from './util.js';
import { MEDICAL_WARNING, CREDIT } from './constants.js';
import { measureScreen } from './screens/measureScreen.js';
import { challengeScreen } from './screens/challengeScreen.js';
import { recordsScreen } from './screens/recordsScreen.js';
import { reportScreen } from './screens/reportScreen.js';
import { learnScreen } from './screens/learnScreen.js';
import { guideScreen, privacyScreen } from './screens/guideScreen.js';

const main = document.getElementById('main');

function homeScreen(root) {
  const profiles = store.getProfiles().length;
  const events = store.getEvents().length;
  root.innerHTML = `
    <section class="hero">
      <h1 tabindex="-1">מעבדת הדופק והנשימה</h1>
      <p class="lead">מודדים, משווים וגם לומדים איך הגוף מגיב למאמץ ומתאושש — עם הנתונים האמיתיים שלכם.</p>
    </section>
    <div class="action-grid">
      <a class="action" href="#/measure"><span class="a-ico" aria-hidden="true">❤</span><span class="a-title">למדוד עכשיו</span><span class="a-desc">בחירת פרופיל ומצב, ומדידת דופק ונשימה</span></a>
      <a class="action" href="#/challenge"><span class="a-ico" aria-hidden="true">⏱</span><span class="a-title">אתגר ההתאוששות</span><span class="a-desc">ניסוי מודרך: מנוחה, מאמץ והתאוששות</span></a>
      <a class="action" href="#/records"><span class="a-ico" aria-hidden="true">📈</span><span class="a-title">התיקים שלי והשוואות</span><span class="a-desc">${profiles} פרופילים · ${events} מדידות</span></a>
      <a class="action" href="#/learn"><span class="a-ico" aria-hidden="true">🔎</span><span class="a-title">לגלות וללמוד</span><span class="a-desc">איך נשמעים ונראים קצבים שונים</span></a>
    </div>
    <div class="home-links">
      <a class="btn secondary" href="#/guide">איך משתמשים?</a>
      <a class="btn secondary" href="#/privacy">פרטיות ובטיחות</a>
      <a class="btn secondary" href="#/report">הפקת דוח PDF</a>
    </div>
    <p class="notice" role="note">הנתונים נשמרים רק במכשיר הזה. יישום לימודי — אינו מכשיר רפואי ואינו מאבחן.</p>`;
}

const routes = {
  '': homeScreen,
  measure: measureScreen,
  challenge: challengeScreen,
  records: (root, params, sub) => recordsScreen(root, params, sub),
  report: reportScreen,
  learn: learnScreen,
  guide: guideScreen,
  privacy: privacyScreen,
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, query = ''] = raw.split('?');
  const [name = '', sub = ''] = pathPart.split('/');
  return { name, sub, params: new URLSearchParams(query) };
}

let renderToken = 0;
async function render() {
  abortAll(); // שחרור מצלמה/מיקרופון/טיימרים ממסך קודם
  const token = ++renderToken;
  const { name, sub, params } = parseHash();
  const fn = routes[name] || homeScreen;
  document.body.dataset.route = name || 'home';
  main.innerHTML = '';
  try {
    await fn(main, params, sub);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<p class="notice warn">אירעה שגיאה בטעינת המסך: ${esc(err.message)}</p><p><a class="btn primary" href="#/">למסך הראשי</a></p>`;
  }
  if (token !== renderToken) return;
  document.querySelectorAll('.nav-link').forEach((a) => {
    const target = a.getAttribute('href').replace(/^#\/?/, '').split('?')[0].split('/')[0];
    a.classList.toggle('active', target === name);
    if (target === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const h1 = main.querySelector('h1');
  if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
  closeMenu();
}

// ---------- תפריט ----------
const menuBtn = document.getElementById('menu-btn');
const menu = document.getElementById('menu');
function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', () => {
  const open = menu.hidden;
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('a, button').focus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus(); } });
document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) closeMenu(); });
document.getElementById('warn-btn').addEventListener('click', () => { closeMenu(); showMedicalWarning(false); });

// ---------- הצהרה רפואית ----------
export async function showMedicalWarning(requireAck) {
  if (requireAck) {
    const r = openModal({
      title: 'לפני שמתחילים — הצהרה רפואית',
      dismissable: false,
      bodyHtml: `<p>${esc(MEDICAL_WARNING)}</p>
        <label class="check"><input type="checkbox" id="ack"> קראתי והבנתי</label>`,
      actions: [{ label: 'המשך ליישום', kind: 'primary', value: true, disabled: true, validate: () => true, id: 'ack-btn' }],
    });
    const modal = openModal.current.modal;
    const btn = modal.querySelector('#ack-btn');
    modal.querySelector('#ack').addEventListener('change', (e) => { btn.disabled = !e.target.checked; });
    modal.querySelector('#ack').focus();
    await r;
    store.setSetting('ackWarning', new Date().toISOString());
  } else {
    await openModal({
      title: 'הצהרה רפואית',
      bodyHtml: `<p>${esc(MEDICAL_WARNING)}</p>`,
      actions: [{ label: 'סגירה', kind: 'primary', value: true }],
    });
  }
}

async function boot() {
  document.getElementById('credit').textContent = CREDIT;
  store.load();
  if (store.memoryOnly) toast('האחסון המקומי אינו זמין בדפדפן (גלישה פרטית?) — הנתונים לא יישמרו אחרי סגירה.', 8000);
  window.addEventListener('hashchange', render);
  await render();
  if (!store.getSetting('ackWarning')) await showMedicalWarning(true);
}
boot();
