# lineUP — совместный просмотр

Чёрный минимал, синк хоста, чат, аватары.

## Локально
```bash
npm install
npm start
# http://localhost:3000
```

## Деплой на Render
1. Залей папку на GitHub (создай репозиторий `lineup` и залей все файлы кроме `node_modules` и `data`)
2. Зайди на https://dashboard.render.com → New → Web Service → Connect GitHub → выбери `lineup`
3. Настройки:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `Node`
   - Plan: Free
4. Deploy → получишь `https://lineup-xxxx.onrender.com`

`render.yaml` уже в репозитории — можно также нажать `New → Blueprint` и выбрать репо.

> На Free плане файлы `data/*.json` сбрасываются при перезапуске. Для продакшена подключи Render Disk или замени на БД (Supabase/Mongo).
