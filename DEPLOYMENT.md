# פרסום ב-GitHub Pages — צעד אחר צעד

האתר סטטי לגמרי: אין build ואין תלויות. כל הנתיבים בקוד יחסיים, ולכן הוא פועל גם תחת נתיב repository כמו `https://USER.github.io/pulse-breath-lab/` (ללא שינוי הגדרות base).

## 1. יצירת repository

1. היכנסו ל-GitHub ← **New repository**. שם מומלץ: `pulse-breath-lab`. אפשר Public (נדרש לחשבון חינמי ל-Pages).
2. אל תסמנו "Add README" (יש כבר קובץ בפרויקט).

## 2. העלאת הקבצים

מתיקיית `pulse-breath-lab` (שורש הפרויקט, ובה `index.html`):

```bash
git init
git add .
git commit -m "מעבדת הדופק והנשימה — גרסה ראשונה"
git branch -M main
git remote add origin https://github.com/USER/pulse-breath-lab.git
git push -u origin main
```

> חשוב: `index.html` חייב להיות בשורש ה-repository (לא בתיקייה פנימית). הקובץ `.nojekyll` שבפרויקט מבטיח ש-GitHub לא יעבד את האתר דרך Jekyll.

## 3. הפעלת Pages

1. ב-repository: **Settings ← Pages**.
2. תחת **Build and deployment ← Source** בחרו **Deploy from a branch**.
3. Branch: `main`, תיקייה: `/ (root)` ← **Save**.
4. אחרי דקה-שתיים מופיעה כתובת האתר בראש העמוד: `https://USER.github.io/pulse-breath-lab/`.

## 4. בדיקה אחרי פרסום

פתחו את הכתובת בטלפון (https נדרש למצלמה ולמיקרופון — GitHub Pages מספק זאת) ובדקו:

- מופיעה ההצהרה הרפואית בכניסה הראשונה, וכפתור "המשך" נדלק רק אחרי סימון "קראתי והבנתי".
- מסך "לגלות וללמוד" טוען כרטיסי קצבים (מוכיח שקובצי `content/he/*.json` נטענים מהנתיב הנכון).
- יצירת פרופיל ושמירת מדידה ידנית; סגירת הדפדפן ופתיחה מחדש — הנתונים נשארים.
- "למדוד עכשיו" ← מצלמה: הדפדפן מבקש הרשאה רק אחרי הלחיצה.
- "הפקת דוח PDF" ← תצוגה מקדימה ← הדפסה ← שמירה כ-PDF (בדקו עברית ו-RTL).

## הגדרות repository / base path

אין צורך בהגדרת base path: האתר משתמש בנתיבים יחסיים (`css/…`, `js/…`, `content/he/…`) ובניווט לפי `#` (hash), כך שהוא עובד מכל תת-נתיב. לדמות זאת מקומית:

```bash
node tests/serve.mjs 8081 /pulse-breath-lab/
# http://localhost:8081/pulse-breath-lab/
```

(ב-Git Bash ב-Windows יש להקדים `MSYS_NO_PATHCONV=1` כדי שהנתיב לא יומר.)

## דומיין מותאם אישית (אופציונלי)

ב-**Settings ← Pages ← Custom domain** מזינים את הדומיין ומגדירים רשומת DNS לפי ההוראות של GitHub. מסמנים **Enforce HTTPS**.

## עדכון האתר

עורכים קבצים (למשל `content/he/*.json`), ואז:

```bash
git add .
git commit -m "עדכון תוכן"
git push
```

האתר מתעדכן תוך דקה. אם דפדפן מציג גרסה ישנה — רענון כפוי (Ctrl+Shift+R). קובצי ה-JSON נטענים עם `no-cache`.

## פתרון בעיות

| תסמין | סיבה אפשרית |
|---|---|
| 404 בכתובת האתר | Pages לא הופעל, או שה-branch/תיקייה לא נבחרו |
| דף ריק | `index.html` אינו בשורש; או שנפתח כקובץ מקומי במקום דרך שרת |
| "לא ניתן לטעון את התוכן" | נתיב `content/he/` שונה, או שהקבצים לא הועלו |
| אין אפשרות להפעיל מצלמה/מיקרופון | הכתובת אינה https, או שההרשאה נחסמה בהגדרות האתר בדפדפן |
