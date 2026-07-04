# הכסף שלי — העלאה ל-GitHub ול-Cloudflare Worker

האפליקציה היא **קובץ HTML יחיד ועצמאי** (offline, ללא CDN). כל הקוד, ה-CSS וה-React
מוטמעים בפנים. אפשר לפתוח אותה ישירות בדפדפן, לארח ב-GitHub Pages, או להגיש דרך Cloudflare Worker.

## מצב הנתונים כרגע (חשוב)
- **מקומי, מרובה־משתמשים.** כל משתמש נשמר בנפרד ב-localStorage של הדפדפן, לפי User ID קבוע:
  - `hakesef_users` — רשימת המשתמשים [{id,name,avatar}]
  - `hakesef_active` — המשתמש הפעיל **במכשיר הזה בלבד** (לא מסונכרן)
  - `hakesef_u_<id>` — כל הנתונים של אותו משתמש (הכנסות, תקציבים, הוצאות, קטגוריות, פרופיל)
- **אין כרגע סנכרון ענן פעיל.** קוד הסנכרון קיים באפליקציה אבל רדום (לא מחובר ל-UI).
- לכן, כרגע, תפקיד ה-Worker הוא **לארח/להגיש את האפליקציה**. ה-API של הסנכרון כלול ומוכן,
  אבל האפליקציה עדיין לא קוראת לו. (ראו "סנכרון ענן עתידי" בהמשך.)

---

## מה יש בחבילה
- `hotzaot.html` — האפליקציה (קובץ יחיד, מקור האמת).
- `index.html` — עותק זהה, בשם שנוח ל-GitHub Pages ול-Worker (public/index.html).
- `worker.js` — Worker שמגיש את האפליקציה (+ API סנכרון מגובה-KV, לעתיד).
- `wrangler.toml` — הגדרות פריסה ל-Cloudflare.

> אחרי כל עדכון של האפליקציה: מעדכנים את hotzaot.html, ואז `cp hotzaot.html index.html`
> (וגם `cp hotzaot.html public/index.html` אם פורסים ל-Worker).

---

## אפשרות א' — GitHub (Pages)
1. צרו ריפו חדש (למשל hakesef).
2. העלו את הקבצים (מספיק index.html בשביל אתר; אפשר להוסיף גם את השאר):
   ```bash
   git init
   git add index.html hotzaot.html worker.js wrangler.toml DEPLOY.md
   git commit -m "הכסף שלי — אפליקציה"
   git branch -M main
   git remote add origin https://github.com/<user>/hakesef.git
   git push -u origin main
   ```
3. ב-GitHub: Settings → Pages → Source: Deploy from a branch → main / (root) → Save.
4. אחרי דקה תקבלו כתובת https://<user>.github.io/hakesef/ . זהו — האפליקציה עובדת (מקומית, אופליין).

---

## אפשרות ב' — Cloudflare Worker (הגשה)
### שלב 1 — התקנות חד־פעמיות
```bash
npm install -g wrangler
wrangler login
```
### שלב 2 — מבנה תיקיות
```
hakesef/
├─ worker.js
├─ wrangler.toml
└─ public/
   └─ index.html        ← זה hotzaot.html ששמו שונה
```
```bash
mkdir -p public
cp hotzaot.html public/index.html
```
### שלב 3 — פריסה
```bash
wrangler deploy
```
תקבלו כתובת כמו https://hakesef.<subdomain>.workers.dev . האפליקציה תוגש משם ותעבוד (מקומית).

> **KV לא חובה כרגע.** ה-KV דרוש רק ל-API הסנכרון (/api/*), שהאפליקציה עדיין לא משתמשת בו.
> אם wrangler deploy מתלונן על ה-binding של HAKESEF, אפשר פשוט למחוק/להעיר את הבלוק
> [[kv_namespaces]] ב-wrangler.toml עד שתרצו להפעיל סנכרון.

---

## סנכרון ענן עתידי (כשנרצה)
ה-Worker כבר כולל API מגובה-KV (GET/PUT /api/data, GET /api/health). כשנחליט לחבר
סנכרון, העיקרון שסיכמנו:
- **הנתונים** יסתנכרנו לענן **לפי User ID** (כל משתמש = מסמך נפרד).
- **המשתמש הפעיל יישאר מקומי לכל מכשיר** (hakesef_active לא מסתנכרן) — כך שהחלפת משתמש
  במכשיר אחד לא משנה את המשתמש הפעיל במכשיר אחר.
- כדי להפעיל: יוצרים KV ומעדכנים את ה-id ב-wrangler.toml:
  ```bash
  wrangler kv namespace create HAKESEF
  # מעתיקים את ה-id אל wrangler.toml במקום REPLACE_WITH_YOUR_KV_NAMESPACE_ID
  ```
- endpoints לבדיקה:
  ```
  GET  /api/health                    -> { ok: true }
  GET  /api/data   (x-sync-id: CODE)  -> { empty:true } | { schema, rev, updatedAt, data }
  PUT  /api/data   (x-sync-id: CODE)  body: { schema, rev, updatedAt, data }
  ```

## עדכון גרסה (בלי לאבד נתונים)
מעדכנים את index.html / public/index.html ומריצים שוב wrangler deploy (או דוחפים ל-GitHub).
נתוני המשתמשים ב-localStorage של כל מכשיר נשארים כמו שהם.

## גיבוי
מכיוון שהנתונים מקומיים, גיבוי = לשמור עותק של ערכי hakesef_* מ-localStorage
(DevTools → Application → Local Storage). כשנחבר סנכרון, הענן יהיה הגיבוי.
