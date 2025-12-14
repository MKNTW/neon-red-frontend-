// constants.js - Константы для всего приложения

// === ТАЙМАУТЫ И ИНТЕРВАЛЫ ===
export const RESEND_COOLDOWN_MS = 60 * 1000; // 60 секунд между повторными отправками кода
export const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 минут срок действия кода
export const FETCH_TIMEOUT_MS = 30 * 1000; // 30 секунд таймаут для запросов
export const TOKEN_EXPIRY_DAYS = 7; // 7 дней срок действия токена

// === КЭШИРОВАНИЕ ===
export const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут кэш товаров
export const USER_CACHE_TTL_MS = 2 * 60 * 1000; // 2 минуты кэш пользователя

// === ПАГИНАЦИЯ ===
export const PRODUCTS_PER_PAGE = 20; // Товаров на странице
export const ORDERS_PER_PAGE = 10; // Заказов на странице

// === ВАЛИДАЦИЯ ===
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 50;
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 100;
export const MAX_FULLNAME_LENGTH = 100;

// === ФАЙЛЫ ===
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB максимальный размер файла
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// === БЕЗОПАСНОСТЬ ===
export const BCRYPT_SALT_ROUNDS = 10;
export const CODE_LENGTH = 6; // Длина кода подтверждения

// === UI ===
export const TOAST_DURATION_MS = 3000; // 3 секунды показ уведомления
export const DEBOUNCE_DELAY_MS = 300; // 300ms для debounce

// === API ===
export const API_VERSION = 'v1';

