# 🚀 Деплой на Vercel + Render.com

## Структура деплоя

- **Frontend (Vue 3)**: Vercel
- **Backend (Node.js)**: Render.com

## Настройка Vercel (Frontend)

### 1. Переменные окружения

В настройках проекта Vercel добавьте переменную окружения:

```
VITE_API_URL=https://your-backend-service.onrender.com/api
```

**Важно**: Замените `your-backend-service.onrender.com` на реальный URL вашего backend сервиса на Render.com

### 2. Build Settings

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 3. Environment Variables в Vercel

Перейдите в **Settings → Environment Variables** и добавьте:

| Key | Value | Environment |
|-----|-------|-------------|
| `VITE_API_URL` | `https://your-backend.onrender.com/api` | Production, Preview, Development |

## Настройка Render.com (Backend)

### 1. Создание Web Service

1. Создайте новый **Web Service** на Render.com
2. Подключите ваш репозиторий
3. Настройки:
   - **Name**: `neon-red-backend` (или любое другое)
   - **Environment**: `Node`
   - **Build Command**: (оставьте пустым)
   - **Start Command**: `npm start` или `node server.cjs`
   - **Plan**: Free или Paid

### 2. Environment Variables на Render.com

Добавьте следующие переменные окружения:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | Ваш Supabase URL |
| `SUPABASE_SERVICE_KEY` | Ваш Supabase Service Key |
| `JWT_SECRET` | Секретный ключ для JWT |
| `RESEND_API_KEY` | API ключ Resend (для email) |
| `PORT` | `3001` (или оставьте по умолчанию) |

### 3. CORS настройки

В `server.cjs` уже настроен CORS для разрешения запросов с Vercel. Убедитесь, что в массиве `origin` добавлен ваш Vercel домен:

```javascript
origin: [
    'https://your-app.vercel.app',  // Добавьте ваш Vercel домен
    'http://localhost:3000',
    // ...
]
```

## Проверка работы

1. **Backend должен быть доступен**: `https://your-backend.onrender.com/api`
2. **Frontend должен использовать правильный URL**: Проверьте в Network tab браузера, что запросы идут на Render.com, а не на localhost

## Troubleshooting

### Ошибка: ERR_CONNECTION_REFUSED на localhost:3001

**Причина**: `VITE_API_URL` не установлена в Vercel

**Решение**: 
1. Перейдите в Vercel Dashboard → Settings → Environment Variables
2. Добавьте `VITE_API_URL` со значением `https://your-backend.onrender.com/api`
3. Пересоберите проект

### Ошибка: CORS policy

**Причина**: Домен Vercel не добавлен в CORS настройки backend

**Решение**: 
1. Откройте `server.cjs`
2. Найдите массив `origin` в настройках CORS
3. Добавьте ваш Vercel домен: `'https://your-app.vercel.app'`
4. Перезапустите backend на Render.com

### Проверка переменных окружения

В браузере откройте консоль и проверьте:
```javascript
console.log(import.meta.env.VITE_API_URL)
```

Должен показать URL вашего backend на Render.com, а не localhost.

