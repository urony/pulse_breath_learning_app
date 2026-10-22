// "לגלות וללמוד": גלריית המחשות קצב, השוואה למדידה שלי, והסברים קצרים.

import { loadContent } from '../content.js';
import { mountGallery, compareRows } from '../rhythms.js';
import * as store from '../storage.js';
import { CONTEXTS } from '../constants.js';
import { esc, fmtDateTime } from '../util.js';

export async function learnScreen(root) {
  root.innerHTML = '<h1 tabindex="-1">לגלות וללמוד</h1><p>טוען…</p>';
  let rhythms, concepts;
  try {
    [rhythms, concepts] = await Promise.all([loadContent('rhythms'), loadContent('concepts')]);
  } catch (err) {
    root.innerHTML = `<h1 tabindex="-1">לגלות וללמוד</h1><p class="notice warn">לא ניתן לטעון את התוכן (${esc(err.message)}). ודאו שהאתר רץ משרת (לא מקובץ מקומי).</p>`;
    return;
  }
  const events = store.getEvents().filter((e) => e.pulse).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  root.innerHTML = `
    <h1 tabindex="-1">לגלות וללמוד</h1>
    <p><a class="btn ghost small" href="#/guide">מדריכים לתלמיד ולמורה</a> <a class="btn ghost small" href="#/privacy">פרטיות ובטיחות</a></p>
    <section aria-labelledby="g-h">
      <h2 id="g-h">כיצד נשמעים ונראים קצבים שונים?</h2>
      <div id="gallery"></div>
    </section>
    <section aria-labelledby="c-h" class="panel">
      <h2 id="c-h">המדידה שלי מול המחשה לימודית</h2>
      ${events.length ? `
      <div class="grid2">
        <label class="field">מדידה שלי
          <select id="cmp-ev">${events.map((e) => `<option value="${esc(e.id)}">${esc(store.getProfile(e.profileId)?.nickname || '')} · ${esc(CONTEXTS[e.context])} · ${esc(fmtDateTime(e.createdAt))}</option>`).join('')}</select></label>
        <label class="field">המחשה
          <select id="cmp-rh">${rhythms.items.map((d) => `<option value="${d.id}">${esc(d.title)}</option>`).join('')}</select></label>
      </div>
      <div id="cmp-out"></div>` : '<p class="hint">אחרי שתשמרו מדידת דופק אפשר יהיה להשוות אותה חזותית להמחשה. השוואה כזו היא רק לשם ההבחנה בין נתון נמדד להדגמה.</p>'}
    </section>
    <section aria-labelledby="x-h">
      <h2 id="x-h">${esc(concepts.title)}</h2>
      <p class="hint">${esc(concepts.intro)}</p>
      <div class="accordion">
        ${concepts.items.map((it, i) => `
          <div class="acc">
            <h3><button class="acc-btn" aria-expanded="false" aria-controls="cx-${i}"><span>${esc(it.title)}</span><span class="chev" aria-hidden="true">▾</span></button></h3>
            <div id="cx-${i}" class="acc-body" hidden><p>${esc(it.body)}</p></div>
          </div>`).join('')}
      </div>
    </section>`;

  mountGallery(root.querySelector('#gallery'), rhythms);

  if (events.length) {
    const out = root.querySelector('#cmp-out');
    const draw = () => {
      const ev = events.find((e) => e.id === root.querySelector('#cmp-ev').value);
      out.innerHTML = compareRows(ev, rhythms, root.querySelector('#cmp-rh').value);
    };
    root.querySelector('#cmp-ev').addEventListener('change', draw);
    root.querySelector('#cmp-rh').addEventListener('change', draw);
    draw();
  }

  root.querySelectorAll('.accordion .acc-btn').forEach((btn) => btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open));
    document.getElementById(btn.getAttribute('aria-controls')).hidden = open;
  }));
}
