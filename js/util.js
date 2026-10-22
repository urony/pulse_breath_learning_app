// פונקציות עזר כלליות: הצפנת טקסט, תאריכים, חלונות דו-שיח, הורדת קבצים.


export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; }
export function median(a) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function std(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round1 = (v) => Math.round(v * 10) / 10;

const dtDate = new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dtTime = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' });
export function fmtDate(iso) { const d = new Date(iso); return isNaN(d) ? '' : dtDate.format(d); }
export function fmtTime(iso) { const d = new Date(iso); return isNaN(d) ? '' : dtTime.format(d); }
export function fmtDateTime(iso) { return `${fmtDate(iso)} ${fmtTime(iso)}`.trim(); }
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
export function toDateInputValue(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- הודעות ----------
export function announce(message) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = message; }, 30);
}

export function toast(message, ms = 3500) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  announce(message);
  setTimeout(() => el.remove(), ms);
}

// ---------- חלון דו-שיח ----------
let lastFocus = null;
export function openModal({ title, bodyHtml, actions = [], dismissable = true, wide = false }) {
  return new Promise((resolve) => {
    lastFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
        <h2 id="modal-title">${esc(title)}</h2>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-actions"></div>
      </div>`;
    const modal = overlay.querySelector('.modal');
    const actionHost = overlay.querySelector('.modal-actions');
    const close = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.body.classList.remove('modal-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      resolve(value);
    };
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.kind || 'secondary');
      b.textContent = a.label;
      if (a.id) b.id = a.id;
      if (a.disabled) b.disabled = true;
      b.addEventListener('click', () => {
        if (a.validate && !a.validate(modal)) return;
        close(a.value !== undefined ? a.value : a.label);
      });
      actionHost.appendChild(b);
    });
    function onKey(e) {
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); close(null); }
      if (e.key === 'Tab') {
        const f = modal.querySelectorAll('button:not([disabled]), input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.classList.add('modal-open');
    document.body.appendChild(overlay);
    overlay._close = close;
    modal.focus();
    overlay.modalRoot = modal;
    openModal.current = { overlay, modal, close };
  });
}

export async function confirmDialog(title, text, okLabel = 'אישור', danger = false) {
  const r = await openModal({
    title,
    bodyHtml: `<p>${esc(text)}</p>`,
    actions: [
      { label: 'ביטול', kind: 'secondary', value: false },
      { label: okLabel, kind: danger ? 'danger' : 'primary', value: true },
    ],
  });
  return r === true;
}

export async function infoDialog(title, bodyHtml) {
  return openModal({ title, bodyHtml, actions: [{ label: 'סגירה', kind: 'primary', value: true }], wide: true });
}

// ---------- הורדת קובץ ----------
export function downloadFile(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function csvCell(v) {
  const s = String(v ?? '');
  // מניעת הזרקת נוסחאות בגיליונות אלקטרוניים
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
