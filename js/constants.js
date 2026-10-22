// קבועים משותפים: תוויות מצב, מקורות מדידה, איכות.

export const CONTEXTS = {
  rest: 'מנוחה',
  walk: 'אחרי הליכה/פעילות',
  effort: 'אחרי מאמץ',
  recovery: 'התאוששות',
  before_sleep: 'לפני השינה',
  after_wake: 'אחרי התעוררות',
  other: 'אחר',
};

export const SOURCES = {
  measured_camera: 'מצלמה (PPG)',
  measured_manual: 'הקשות משתמש',
  measured_microphone: 'מיקרופון (ניסיוני)',
  counted_manual: 'ספירה ידנית',
  demo_simulated: 'הדגמה',
};

export const SOURCE_SHORT = {
  measured_camera: 'מצלמה',
  measured_manual: 'הקשות',
  measured_microphone: 'מיקרופון',
  counted_manual: 'ספירה',
  demo_simulated: 'הדגמה',
};

export const QUALITY = {
  good: 'טובה',
  medium: 'בינונית',
  poor: 'לא מספקת',
  manual: 'ידנית (ללא מדד איכות)',
};

export const RELATIONS = {
  me: 'אני',
  family: 'בן/בת משפחה',
  friend: 'חבר/ה',
  other: 'אחר',
};

export const SEXES = {
  '': 'לא מצוין',
  female: 'נקבה',
  male: 'זכר',
  other: 'אחר',
};

export const CREDIT = 'פותח על ידי אורי העליון';

export const PULSE_COLOR = '#c62828';
export const BREATH_COLOR = '#1565c0';

export const MEDICAL_WARNING =
  'יישום זה נועד ללמידה ולהתנסות פדגוגית בלבד. הוא אינו מכשיר רפואי, אינו מיועד לאבחון מחלות או הפרעות בקצב הלב ואינו מהווה תחליף לייעוץ, בדיקה או טיפול רפואי. המדידות עשויות להיות לא מדויקות ואין להסתמך עליהן לצורך קבלת החלטות רפואיות. אם מתקבלת תוצאה חריגה או עולה חשש לבעיה רפואית, מומלץ לפנות לרופא. במקרה של כאבים בחזה, קוצר נשימה משמעותי, עילפון או תסמינים חמורים אחרים יש לפנות מיד לעזרה רפואית דחופה.';

export const RHYTHM_DISCLAIMER =
  'המחשה לימודית של תחושת הקצב בלבד. הצלילים והקווים אינם מתארים במדויק הפרעת קצב ואינם כלי אבחוני.';

export const REPORT_DISCLAIMER = 'דוח לימודי בלבד — אינו מיועד לאבחון או לייעוץ רפואי';
