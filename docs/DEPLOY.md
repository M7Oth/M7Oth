# النشر — Deployment

البيئة التي بُني فيها المشروع لا تملك حسابات استضافة، لذلك لم يُنشر بعد. كل ما يلزم جاهز:

## الخيار 1 (موصى به): خدمة واحدة على Render
1. ارفع المستودع إلى GitHub (تم).
2. في Render: **New → Blueprint** واختر المستودع. سيقرأ `render.yaml` وينشئ:
   - خدمة ويب Docker تبني الواجهة وتشغّل الخادم (`/api`, `/ws`, والملفات الثابتة).
   - قاعدة PostgreSQL مُدارة وتمرير `DATABASE_URL` تلقائيًا.
3. عند انتهاء البناء افتح الرابط العام، وتحقق من `https://<app>/api/health`.
4. **لا تفعّل** `ALLOW_DEV_CHEATS` في الإنتاج.

## الخيار 2: Fly.io / Railway
- استخدم `Dockerfile` نفسه، واربط PostgreSQL، واضبط `DATABASE_URL` و`PORT`.

## الخيار 3: واجهة على Vercel أو Netlify + خادم منفصل
1. انشر الخادم بالخيار 1 أو 2 واحصل على رابطه، مثل `https://fls-api.onrender.com`.
2. على Vercel/Netlify: اربط المستودع (الإعدادات في `vercel.json` / `netlify.toml`) وأضف متغير البناء:
   `VITE_SERVER_URL=https://fls-api.onrender.com`
3. في الخادم اضبط `CORS_ORIGIN=https://<your-site>`.

## Supabase
يمكن استخدام PostgreSQL الخاص بـ Supabase كقاعدة بيانات فقط: ضع سلسلة الاتصال (Connection string, port 5432) في `DATABASE_URL`.
المخطط في `server/db/schema.sql` ويُطبّق تلقائيًا عند تشغيل الخادم. لا يحتاج المتصفح أي مفتاح Supabase.

## متغيرات البيئة
انظر `.env.example`.
