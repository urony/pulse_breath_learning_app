// מדריכים (תלמיד/מורה) ופרטיות ובטיחות — מרונדרים מקובצי content/he.

import { loadContent } from '../content.js';
import { esc } from '../util.js';
import { MEDICAL_WARNING } from '../constants.js';
import * as store from '../storage.js';
import { confirmDialog, toast } from '../util.js';

function renderDoc(doc) {
  return `
    <h2>${esc(doc.title)}</h2>
    ${doc.intro ? `<p class="lead">${esc(doc.intro)}</p>` : ''}
    ${doc.sections.map((s) => `
      <section class="doc-sec">
        <h3>${esc(s.heading)}</h3>
        ${(s.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('')}
        ${s.bullets ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      </section>`).join('')}`;
}

export async function guideScreen(root, params) {
  const who = params.get('for') === 'teacher' ? 'teacher' : 'student';
  root.innerHTML = '<h1 tabindex="-1">איך משתמשים?</h1><p>טוען…</p>';
  let doc;
  try { doc = await loadContent(who === 'teacher' ? 'teacher-guide' : 'student-guide'); }
  catch (err) { root.innerHTML = `<h1 tabindex="-1">איך משתמשים?</h1><p class="notice warn">${esc(err.message)}</p>`; return; }
  root.innerHTML = `
    <h1 tabindex="-1">איך משתמשים?</h1>
    <nav class="tabs" aria-label="סוג המדריך">
      <a class="tab ${who === 'student' ? 'active' : ''}" href="#/guide?for=student" ${who === 'student' ? 'aria-current="page"' : ''}>מדריך לתלמידים</a>
      <a class="tab ${who === 'teacher' ? 'active' : ''}" href="#/guide?for=teacher" ${who === 'teacher' ? 'aria-current="page"' : ''}>מדריך למורים</a>
    </nav>
    <article class="doc panel">${renderDoc(doc)}</article>
    <p><a class="btn ghost" href="#/privacy">פרטיות ובטיחות</a></p>`;
}

export async function privacyScreen(root) {
  root.innerHTML = '<h1 tabindex="-1">פרטיות ובטיחות</h1><p>טוען…</p>';
  let doc;
  try { doc = await loadContent('privacy'); }
  catch (err) { root.innerHTML = `<h1 tabindex="-1">פרטיות ובטיחות</h1><p class="notice warn">${esc(err.message)}</p>`; return; }
  root.innerHTML = `
    <h1 tabindex="-1">פרטיות ובטיחות</h1>
    <section class="panel warn-box" aria-labelledby="mw-h">
      <h2 id="mw-h">הצהרה רפואית</h2>
      <p>${esc(MEDICAL_WARNING)}</p>
    </section>
    <article class="doc panel">${doc.sections.map((s) => `
      <section class="doc-sec"><h3>${esc(s.heading)}</h3><ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>`).join('')}</article>
    <div class="panel">
      <h2>הנתונים שלי</h2>
      <p>${store.getProfiles().length} פרופילים · ${store.getEvents().length} מדידות במכשיר זה.</p>
      <div class="btn-row">
        <a class="btn secondary" href="#/records/data">ייצוא וייבוא</a>
        <button class="btn danger" id="pv-del">מחיקת כל הנתונים המקומיים</button>
      </div>
    </div>`;
  root.querySelector('#pv-del').addEventListener('click', async () => {
    if (await confirmDialog('מחיקת כל הנתונים', 'כל הפרופילים והמדידות יימחקו מהמכשיר. להמשיך?', 'מחיקת הכול', true)) {
      store.clearAll(); toast('כל הנתונים נמחקו'); privacyScreen(root);
    }
  });
}
