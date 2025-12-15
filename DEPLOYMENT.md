# 🚀 Инструкции по деплою

## Проблема с ES модулями

Проект использует `"type": "module"` в `package.json` для Vue 3, но backend (`server.cjs`) использует CommonJS.

## Решение

Backend файл переименован в `server.cjs` для использования CommonJS синтаксиса независимо от `"type": "module"`.

## Запуск на Render.com / Vercel / других платформах

### Для Backend сервиса:

1. **Build Command**: (оставьте пустым или `echo "No build needed"`)
2. **Start Command**: `npm start` или `node server.cjs`
3. **Environment Variables**: 
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `JWT_SECRET`
   - `RESEND_API_KEY`
   - `PORT` (опционально, по умолчанию 3001)

### Для Frontend сервиса:

1. **Build Command**: `npm run build`
2. **Start Command**: `npm run preview` (или настройте статический хостинг)
3. **Environment Variables**:
   - `VITE_API_URL` - URL вашего backend API (например: `https://your-backend.onrender.com/api/v1`)

## Локальный запуск

```bash
# Terminal 1 - Backend
npm run server
# или для разработки:
npm run server:dev

# Terminal 2 - Frontend
npm run dev
```

## Важно

- Backend должен быть запущен **до** запуска frontend
- Убедитесь, что `VITE_API_URL` в frontend указывает на правильный URL backend
- CORS настроен в `server.cjs` для разрешения запросов с frontend домена

