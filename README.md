# שליחת הודעות גיוס – אתר GitHub Pages

ממשק קל-משקל לבחירת לידים מ־Google Sheets ושליחה אוטומטית של הודעת WhatsApp ראשונית מתבנית בגלסיקס. כל הלוגיקה הכבדה (קריאה מ־Sheets, קריאה ל־Glassix, עדכון `sent_at`) רצה ב־n8n דרך 2 webhooks. האתר עצמו סטטי לחלוטין — רק 4 קבצים, ללא build step.

## הפעלה מקומית

```bash
python3 -m http.server 5173
# פתחי בדפדפן: http://localhost:5173
```

## פריסה ל־GitHub Pages

1. צרי repo חדש (לדוגמה `recruiter-sender`).
2. דחפי את הקבצים: `index.html`, `app.js`, `styles.css`, `README.md`.
3. ב־GitHub: Settings → Pages → Source: branch `main`, folder `/ (root)`.
4. בתוך דקה תקבלי URL בסגנון `https://<user>.github.io/recruiter-sender/`.

## איך נכנסים — פורמט הסיסמה

הסיסמה כוללת **שני חלקים** מופרדים ב־`=`:

```
<n8n-subdomain>=<secret>
```

- **`subdomain`** – שם הסביבה ב־n8n Cloud (החלק שלפני `.app.n8n.cloud`).
- **`secret`** – הסוד שמוגדר ב־n8n כ־Header Auth credential.

האתר עצמו לא מכיל את כתובת ה־n8n בקוד; זו הסיבה שהיא חלק מהסיסמה. כל מי שמורשה לשלוח – יודע את שני החלקים.

## הזרימה

1. **כניסה** → המשתמשת מקלידה את הסיסמה ולוחצת "בדוק לידים".
2. **בחירה ומיפוי** → האתר מציג את כל הלידים שעדיין לא קיבלו הודעה (מכל הטאבים בגיליון). למילוי:
   - **שמך** – ייכנס ל־`{{2}}` בתבנית.
   - **מיפוי משרות** – לכל ערך ייחודי של `adset_name` (גולמי), רשמי איך תרצי שיופיע בהודעה.
   - **בחירת לידים** – סמני מי לקבל את ההודעה.
3. **שליחה** → לחיצה על "שלח הודעות". n8n רץ בלולאה (עם 2 שניות בין הודעה), שולח לגלסיקס, מעדכן `sent_at` בגיליון.
4. **דו"ח** → טבלה: מי קיבל בהצלחה, מי נכשל ולמה.

## ארכיטקטורה

```
דפדפן (GitHub Pages, סטטי)
   │
   ├── POST {subdomain}.app.n8n.cloud/webhook/glassix-recruit/get-leads
   │     header: X-App-Secret  →  n8n מחזיר רשימת לידים פנויים + משרות ייחודיות
   │
   └── POST {subdomain}.app.n8n.cloud/webhook/glassix-recruit/send-messages
         header: X-App-Secret  →  n8n רץ בלולאה: Glassix /protocols/send + עדכון Sheets
                                  →  מחזיר דו"ח לכל ליד
```

## תלות ב־n8n

האתר לא יעבוד בלי שני ה־workflows הללו ב־n8n פעילים:

- **`wf-get-leads`** – Webhook על נתיב `glassix-recruit/get-leads`. קורא דינמית את כל הטאבים מהגיליון, מסנן לידים עם `sent_at` ריק, מחזיר JSON.
- **`wf-send-messages`** – Webhook על נתיב `glassix-recruit/send-messages`. לולאה פנימית עם delay של 2 שניות, קורא ל־Glassix `/protocols/send` עם תבנית מאושרת ו־3 פרמטרים, מעדכן `sent_at` או `last_error` בטאב המקור של כל ליד.
- **`wf-send-manual`** – Webhook על נתיב `glassix-recruit/send-manual`. שליחה ידנית של טופס (שם/טלפון/משרה) ללא מעבר דרך הגיליון.
