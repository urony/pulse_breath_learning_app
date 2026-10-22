// מסך "למדוד עכשיו": בחירת פרופיל ומצב, ואז זרימת המדידה.

import * as store from '../storage.js';
import { mountMeasure } from '../measure.js';
import { editProfileDialog } from '../profiles.js';
import { esc } from '../util.js';
import { CONTEXTS } from '../constants.js';

export function measureScreen(root, params) {
  const profiles = store.getProfiles();
  if (!profiles.length) {
    root.innerHTML = `
      <h1 tabindex="-1">למדוד עכשיו</h1>
      <div class="panel">
        <p>כדי לשמור מדידות צריך פרופיל מקומי עם כינוי בלבד.</p>
        <button class="btn primary big" id="ms-new">יצירת פרופיל</button>
      </div>`;
    root.querySelector('#ms-new').addEventListener('click', async () => {
      if (await editProfileDialog()) measureScreen(root, params);
    });
    return;
  }

  const preselect = params.get('p');
  const selected = profiles.some((p) => p.id === preselect) ? preselect : profiles[0].id;
  root.innerHTML = `
    <h1 tabindex="-1">למדוד עכשיו</h1>
    <div id="ms-area">
      <form class="panel" id="ms-form" novalidate>
        <label class="field">מי נמדד?
          <select id="ms-prof">${profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.nickname)}</option>`).join('')}</select>
        </label>
        <button type="button" class="btn ghost small" id="ms-new">+ פרופיל חדש</button>
        <fieldset class="chips">
          <legend>באיזה מצב מודדים?</legend>
          ${Object.entries(CONTEXTS).map(([k, v], i) => `<label class="chip-radio"><input type="radio" name="ms-ctx" value="${k}" ${i === 0 ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}
        </fieldset>
        <label class="field" id="ms-other" hidden>תיאור קצר של המצב
          <input type="text" id="ms-note" maxlength="60" placeholder="למשל: אחרי ריצה קצרה">
        </label>
        <ul class="tips">
          <li>שבו במנוחה לפני מדידת מנוחה (כמה דקות).</li>
          <li>אפשר למדוד דופק, נשימה, או שניהם ברצף. אפשר לדלג על כל אחד.</li>
          <li>למדוד אחרים — רק בהסכמתם.</li>
        </ul>
        <button class="btn primary big" type="submit">המשך למדידה</button>
      </form>
    </div>`;
  const form = root.querySelector('#ms-form');
  form.querySelectorAll('input[name="ms-ctx"]').forEach((r) => r.addEventListener('change', () => {
    root.querySelector('#ms-other').hidden = form.querySelector('input[name="ms-ctx"]:checked').value !== 'other';
  }));
  root.querySelector('#ms-new').addEventListener('click', async () => {
    const p = await editProfileDialog();
    if (p) { params.set('p', p.id); measureScreen(root, params); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const context = form.querySelector('input[name="ms-ctx"]:checked').value;
    const contextNote = context === 'other' ? root.querySelector('#ms-note').value.trim() : '';
    const profileId = root.querySelector('#ms-prof').value;
    const area = root.querySelector('#ms-area');
    area.innerHTML = '';
    mountMeasure(area, {
      profileId,
      context,
      contextNote,
      onCancel: () => measureScreen(root, params),
    });
    window.scrollTo(0, 0);
  });
}
