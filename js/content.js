// טעינת קובצי תוכן עריכים מתיקיית content/he (JSON). המורה יכול להחליף ניסוחים בלי לגעת בלוגיקה.

const cache = new Map();

export async function loadContent(name) {
  if (cache.has(name)) return cache.get(name);
  const res = await fetch(`content/he/${name}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`לא ניתן לטעון את התוכן ${name}`);
  const data = await res.json();
  cache.set(name, data);
  return data;
}
