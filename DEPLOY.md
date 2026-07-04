# הכסף שלי — העלאה ל-GitHub ול-Cloudflare Worker

האפליקציה היא **קובץ HTML יחיד ועצמאי** (offline, ללא CDN). כל הקוד, ה-CSS וה-React
מוטמעים בפנים. אפשר לפתוח אותה ישירות בדפדפן, לארח ב-GitHub Pages, או להגיש דרך Cloudflare Worker.

## מצב הנתונים כרגע (חשוב)
- **מקומי, מרובה־משתמשים.** כל משתמש נשמר בנפרד ב-localStorage לפי User ID קבוע:
  - `hakesef_users`, `hakesef_active` (המשתמש הפעיל — מקומי למכשיר), `hakesef_u_<id>` (נתוני המשתמש).
- **אין כרגע סנכרון ענן פעיל.** קוד הסנכרון קיים אבל רדום. תפקיד ה-Worker כרגע: **להגיש את האפליקציה**.

---

## מבנה הריפו (שורש)
```
repo/
├─ index.html         ← האפליקציה (מה שמוגש כאתר)
├─ hotzaot.html       ← עותק זהה (מקור)
├─ worker.js          ← ה-Worker
├─ wrangler.toml      ← הגדרות פריסה
├─ .assetsignore      ← אילו קבצים לא להגיש כאתר
└─ DEPLOY.md
```
> הקבצים הסטטיים יושבים **בשורש** הריפו, ולכן ב-wrangler.toml:
> `[assets] directory = "."`. **אין צורך בתיקיית public.**

---

## תיקון השגיאה "public does not exist"
זו הסיבה לכישלון: ההגדרה הצביעה על `./public` אבל אין תיקייה כזו (הקבצים בשורש).
**התיקון כבר בוצע** בקבצים המצורפים:
- `wrangler.toml` → `directory = "."` (השורש, שם נמצא index.html).
- נוסף `.assetsignore` שמונע הגשה של קבצי מקור/קונפיג (worker.js, wrangler.toml וכו').

פשוט החליפו את שני הקבצים האלה בריפו, ודחפו מחדש — הבנייה תעבור.

> אם בכל זאת תעדיפו את המבנה עם `public/`: צרו תיקייה `public`, העבירו אליה את `index.html`,
> ושנו בחזרה ל-`directory = "./public"`. שתי הדרכים תקינות — בחרו אחת.

---

## אפשרות א' — GitHub (Pages), בלי Cloudflare
1. Settings → Pages → Source: Deploy from a branch → main / (root) → Save.
2. תוך דקה: `https://<user>.github.io/<repo>/`. (Pages מגיש את index.html מהשורש ישירות — פשוט יותר מ-Worker.)

## אפשרות ב' — Cloudflare Worker
### דרך Git (מה שניסית)
מחברים את הריפו ב-Cloudflare (Workers & Pages → Create → Connect to Git). עם ה-`wrangler.toml`
המתוקן (directory = "."), הבנייה תמצא את index.html בשורש ותפרוס. אין build command נדרש
(זו אפליקציה סטטית בלי Vite/React-build).

### דרך CLI (מקומית)
```bash
npm install -g wrangler
wrangler login
wrangler deploy
```
תקבלו `https://hakesef.<subdomain>.workers.dev`.

> **KV לא חובה כרגע** — נחוץ רק ל-API הסנכרון העתידי, שהאפליקציה עדיין לא קוראת לו.
> הבלוק `[[kv_namespaces]]` מוער ב-wrangler.toml.

---

## הבהרה: build או לא?
זו **אפליקציה סטטית בלי שלב build** (אין Vite/React-build). לכן:
- Build command: *ריק* (או `:`).
- Output / assets directory: התיקייה שבה נמצא `index.html` — כאן זה **השורש** (`.`).
- אם היה זה פרויקט Vite/React, אז היה build command `npm run build` ו-assets מ-`dist`. אצלנו לא.

## סנכרון ענן עתידי
ה-Worker כולל כבר API מגובה-KV (`GET/PUT /api/data`, `GET /api/health`). כשנחבר סנכרון:
הנתונים יסתנכרנו **לפי User ID**, והמשתמש הפעיל יישאר **מקומי לכל מכשיר**. להפעלה: יוצרים KV
(`wrangler kv namespace create HAKESEF`), מדביקים id ב-wrangler.toml ומסירים את ההערה.

## עדכון גרסה (בלי לאבד נתונים)
מעדכנים את `index.html` ודוחפים ל-Git (או `wrangler deploy`). נתוני המשתמשים ב-localStorage
של כל מכשיר נשארים כמו שהם.
