// פרופילים מקומיים: כינוי בלבד כשדה חובה; גיל, מין ורקע רפואי אופציונליים בלבד.

import * as store from './storage.js';
import { openModal, confirmDialog, esc, toast, fmtDate } from './util.js';
import { RELATIONS, SEXES } from './constants.js';

export function profileForm(p = {}) {
  const rel = p.relation || (store.getProfiles().length ? 'family' : 'me');
  return `
    <form id="pf" novalidate>
      <label class="field">כינוי (חובה — לא שם מלא)
        <input type="text" id="pf-nick" maxlength="30" required value="${esc(p.nickname || '')}" autocomplete="off">
      </label>
      <label class="field">יחס
        <select id="pf-rel">${Object.entries(RELATIONS).map(([k, v]) => `<option value="${k}" ${k === rel ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <label class="check" id="pf-consent-row" ${rel === 'me' ? 'hidden' : ''}>
        <input type="checkbox" id="pf-consent" ${p.id ? 'checked' : ''}> האדם (או הורה/אפוטרופוס שלו אם הוא קטין) הסכים לפתיחת הפרופיל ולמדידות
      </label>
      <p class="hint">אספו מדדים של אחרים רק בהסכמתם.</p>
      <fieldset class="optional">
        <legend>פרטים אופציונליים — אין חובה למלא</legend>
        <p class="notice small">אלה נתונים רגישים. הם נשמרים רק במכשיר הזה, נכללים בייצוא או ב-PDF רק אם תבחרו זאת במפורש, וניתן למחוק אותם בכל עת.</p>
        <label class="field">גיל
          <input type="number" id="pf-age" min="1" max="120" inputmode="numeric" value="${p.age ?? ''}">
        </label>
        <label class="field">מין
          <select id="pf-sex">${Object.entries(SEXES).map(([k, v]) => `<option value="${k}" ${k === (p.sex || '') ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
        <label class="field">פרטי רקע רפואיים רלוונטיים (טקסט חופשי, עד 500 תווים)
          <textarea id="pf-med" maxlength="500" rows="3" placeholder="למשל: תרופות שמשפיעות על הדופק">${esc(p.medical || '')}</textarea>
        </label>
      </fieldset>
      <p class="error" id="pf-err" role="alert" hidden></p>
    </form>`;
}

// מחזיר את הפרופיל שנשמר, או null אם בוטל
export async function editProfileDialog(profile = null) {
  let result = null;
  const promise = openModal({
    title: profile ? 'עריכת פרופיל' : 'פרופיל חדש',
    bodyHtml: profileForm(profile || {}),
    actions: [
      { label: 'ביטול', kind: 'secondary', value: false },
      {
        label: 'שמירה', kind: 'primary', value: true,
        validate: (modal) => {
          const err = modal.querySelector('#pf-err');
          const nick = modal.querySelector('#pf-nick').value.trim();
          const rel = modal.querySelector('#pf-rel').value;
          const fail = (msg) => { err.textContent = msg; err.hidden = false; return false; };
          if (!nick) return fail('נא להזין כינוי.');
          if (rel !== 'me' && !modal.querySelector('#pf-consent').checked) return fail('נדרשת הסכמה של האדם לפתיחת פרופיל.');
          const ageRaw = modal.querySelector('#pf-age').value.trim();
          const age = ageRaw === '' ? null : Number(ageRaw);
          if (age !== null && !(age >= 1 && age <= 120)) return fail('הגיל חייב להיות בין 1 ל-120, או להישאר ריק.');
          result = {
            nickname: nick, relation: rel, age,
            sex: modal.querySelector('#pf-sex').value,
            medical: modal.querySelector('#pf-med').value.trim(),
          };
          return true;
        },
      },
    ],
  });
  const modal = openModal.current.modal;
  const rel = modal.querySelector('#pf-rel');
  rel.addEventListener('change', () => { modal.querySelector('#pf-consent-row').hidden = rel.value === 'me'; });
  modal.querySelector('#pf-nick').focus();
  const ok = await promise;
  if (ok !== true || !result) return null;
  const saved = profile ? store.updateProfile(profile.id, result) : store.addProfile(result);
  toast(profile ? 'הפרופיל עודכן' : 'הפרופיל נוצר');
  return saved;
}

export async function deleteProfileFlow(profile) {
  const n = store.getEvents().filter((e) => e.profileId === profile.id).length;
  const ok = await confirmDialog(
    'מחיקת פרופיל',
    `למחוק את הפרופיל "${profile.nickname}" ואת ${n} המדידות שלו? לא ניתן לשחזר.`,
    'מחיקה', true,
  );
  if (ok) { store.deleteProfile(profile.id); toast('הפרופיל נמחק'); }
  return ok;
}

// רשימת הפרופילים ופעולות ניהול
export function renderProfilesPanel(root, onChange) {
  const profiles = store.getProfiles();
  const events = store.getEvents();
  root.innerHTML = `
    <div class="panel-head"><h2>הפרופילים שלי</h2>
      <button class="btn primary" id="pr-add">+ פרופיל חדש</button></div>
    <p class="hint">הפרופילים והמדידות נשמרים במכשיר זה בלבד.</p>
    ${profiles.length ? `<ul class="card-list">${profiles.map((p) => {
      const n = events.filter((e) => e.profileId === p.id).length;
      return `<li class="card" data-id="${esc(p.id)}">
        <div class="card-main">
          <strong class="p-name">${esc(p.nickname)}</strong>
          <span class="chip">${esc(RELATIONS[p.relation])}</span>
          <span class="muted">${n} מדידות · נוצר ${esc(fmtDate(p.createdAt))}</span>
          ${(p.age || p.sex || p.medical) ? '<span class="chip sens" title="יש פרטי רקע שמורים">פרטי רקע שמורים</span>' : ''}
        </div>
        <div class="btn-row">
          <a class="btn secondary small" href="#/measure?p=${encodeURIComponent(p.id)}">מדידה</a>
          <button class="btn secondary small" data-act="edit">עריכה</button>
          <button class="btn danger small" data-act="del">מחיקה</button>
        </div></li>`;
    }).join('')}</ul>` : '<div class="empty"><p>עוד אין פרופילים. צרו פרופיל כדי להתחיל למדוד ולשמור.</p></div>'}`;
  root.querySelector('#pr-add').addEventListener('click', async () => {
    const p = await editProfileDialog();
    if (p) onChange();
  });
  root.querySelectorAll('.card').forEach((li) => {
    const p = store.getProfile(li.dataset.id);
    li.querySelector('[data-act="edit"]').addEventListener('click', async () => { if (await editProfileDialog(p)) onChange(); });
    li.querySelector('[data-act="del"]').addEventListener('click', async () => { if (await deleteProfileFlow(p)) onChange(); });
  });
}
