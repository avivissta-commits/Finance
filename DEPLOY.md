# הכסף שלי — פריסה + סנכרון ענן (מחובר)

## מה קורה עכשיו (סנכרון פעיל)
האפליקציה **מסנכרנת בפועל** מול ה-Worker:
```
כתובת ה-API:  https://finance.avivissta.workers.dev/api   (מוגדר קשיח באפליקציה)
בכל טעינה / החלפת משתמש:  GET  /api/data   (header x-sync-id = User ID של המשתמש הפעיל)
בכל שינוי (מושהה ~0.8ש'):  PUT  /api/data   body { schema, rev, updatedAt, data }
```
- **סנכרון לפי משתמש:** ה-`x-sync-id` הוא ה-User ID של המשתמש הפעיל, כך שכל משתמש = מסמך נפרד ב-KV.
- **המשתמש הפעיל נשאר מקומי** לכל מכשיר (`hakesef_active`), לא מסתנכרן.
- **קונפליקט:** אם בשרת יש `updatedAt` חדש יותר → מאמצים את עותק השרת (last-write-wins). עריכות אופליין נדחפות כשחוזר חיבור.
- **מקומי כגיבוי:** הנתונים תמיד נשמרים גם ב-localStorage; אם הענן לא זמין → "ממתין לחיבור", והאפליקציה ממשיכה לעבוד.

> **חשוב:** מכיוון שמזהה המשתמש נוצר מקומית בכל מכשיר, כדי ששני מכשירים יראו את *אותו* משתמש
> צריך שיהיה להם אותו User ID. סנכרון בין־מכשירי של משתמש מסוים (חשבון משותף) הוא שלב הרחבה
> נוסף (למשל "התחברות עם קוד" שמאחדת User ID). כרגע: כל מכשיר מסנכרן את המשתמשים שלו לענן.

---

## דרישות ב-Worker
ה-Worker (worker.js) כבר מטפל ב-/api/data ומגיש את האפליקציה. הוא **חייב** binding ל-KV בשם `HAKESEF`:
```bash
wrangler kv namespace create HAKESEF
# מדביקים את ה-id ב-wrangler.toml במקום REPLACE_WITH_YOUR_KV_NAMESPACE_ID
```
אם ה-KV לא מחובר → קריאות /api/* יחזירו 500 ("KV namespace HAKESEF is not bound").

## מבנה הריפו (שורש)
```
repo/
├─ index.html      ← האפליקציה (מוגשת כאתר)
├─ hotzaot.html    ← עותק זהה (מקור)
├─ worker.js       ← API /api/data + הגשת האפליקציה
├─ wrangler.toml   ← assets=".", KV=HAKESEF
├─ .assetsignore   ← לא להגיש קבצי מקור
└─ DEPLOY.md
```

## פריסה
```bash
npm install -g wrangler
wrangler login
wrangler kv namespace create HAKESEF        # אם עוד אין; להדביק id ב-wrangler.toml
wrangler deploy
```
או דרך חיבור ה-Git ב-Cloudflare (Workers & Pages → Connect to Git). ה-assets בשורש (directory=".").

## בדיקה מהירה (שהסנכרון עובד)
פותחים את האתר, ואז ב-DevTools → Network מסננים לפי `data`:
- בטעינה תראו **GET** ל-`.../api/data` (עם `x-sync-id`).
- אחרי שינוי כלשהו תראו **PUT** ל-`.../api/data`.
בדיקה ישירה של ה-API:
```
GET  https://finance.avivissta.workers.dev/api/health   -> { ok:true, kvBound:true, bindings:[...] }
#   אם kvBound:false — ה-KV לא מחובר ל-Worker. בדקו את bindings כדי לראות באיזה שם הוא כן מחובר.
GET  https://finance.avivissta.workers.dev/api/data  (x-sync-id: X) -> { empty:true } | { ...data }
```

## שינוי כתובת ה-API
הכתובת מוגדרת קשיח באפליקציה (`https://finance.avivissta.workers.dev/api`). כדי לשנות —
עורכים את הקבוע `DEFAULT_API` במקור ובונים מחדש, או שומרים `localStorage.hakesef_sync = {"apiBase":"..."}`
לעקיפה בלי בנייה מחדש.

## הערות אבטחה
- ה-`x-sync-id` (User ID) הוא המפתח לנתוני אותו משתמש; ה-Worker שומר ב-KV רק את ה-SHA-256 שלו.
- ל-KV אין הצפנה מקצה-לקצה. לפרטיות חזקה — אפשר להוסיף הצפנת client-side או auth אמיתי (הרחבה עתידית).

## סנכרון רשימת המשתמשים (users_index)
מעבר לנתונים של כל משתמש, גם **רשימת המשתמשים** מסונכרנת דרך מפתח גלובלי אחד ב-KV:
```
x-sync-id: users_index  ->  { users:[{syncId,name,avatar,createdAt,updatedAt}], deleted:[syncId...] }
```
- משתמש שנוצר במכשיר אחד מופיע בכל המכשירים (משיכה+מיזוג בטעינה, poll כל 20ש', ורענון בפוקוס).
- הזהות היא ה-syncId הנגזר מהשם (לא ה-id המקומי) — כך "שמוליק" משני מכשירים הוא אותו משתמש.
- מחיקה משתמשת ב-tombstone (deleted) כדי שתתפשט לכל המכשירים ולא תתבטל במיזוג; הדאטה של המשתמש בענן מאופסת.
- המשתמש הפעיל נשאר מקומי לכל מכשיר (hakesef_active), לא מסתנכרן.
