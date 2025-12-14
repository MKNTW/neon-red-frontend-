// utils.js - Утилиты и вспомогательные функции

/**
 * Экранирование HTML для защиты от XSS
 * @param {string|null|undefined} text - Текст для экранирования
 * @returns {string} - Экранированный текст
 */
export function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Экранирование атрибутов HTML
 * @param {string|null|undefined} text - Текст для экранирования
 * @returns {string} - Экранированный текст
 */
export function escapeAttr(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Глобальный индикатор загрузки
let loadingIndicator = null;

export function showLoadingIndicator() {
    if (loadingIndicator) return;
    
    loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'global-loading';
    loadingIndicator.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
        </div>
    `;
    document.body.appendChild(loadingIndicator);
}

export function hideLoadingIndicator() {
    if (loadingIndicator) {
        loadingIndicator.remove();
        loadingIndicator = null;
    }
}

/**
 * Универсальная функция для fetch запросов с обработкой ошибок
 * @param {string} url - URL для запроса
 * @param {RequestInit & {showLoading?: boolean}} options - Опции запроса
 * @returns {Promise<Response>} - Ответ сервера
 * @throws {Error} - Ошибка при запросе
 */
export async function safeFetch(url, options = {}) {
    const FETCH_TIMEOUT_MS = 30 * 1000; // 30 секунд таймаут
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    // Показываем индикатор загрузки только для не-GET запросов или если явно указано
    const showLoading = options.method && options.method !== 'GET' || options.showLoading === true;
    if (showLoading) {
        showLoadingIndicator();
    }
    
    // Логирование для отладки
    if (options.method && options.method !== 'GET') {
        console.log(`[safeFetch] ${options.method} ${url}`);
    }
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            credentials: 'include'
        });
        
        clearTimeout(timeoutId);
        
        // Если ответ не OK, пытаемся получить сообщение об ошибке
        if (!response.ok) {
            let errorMessage = `Ошибка ${response.status}`;
            let errorData = null;
            try {
                errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                // Если не удалось распарсить JSON, используем статус
                if (response.status === 401) errorMessage = 'Требуется авторизация';
                else if (response.status === 403) errorMessage = 'Доступ запрещен';
                else if (response.status === 404) errorMessage = `Ресурс не найден: ${url}`;
                else if (response.status === 400) errorMessage = 'Неверный запрос';
                else if (response.status === 409) errorMessage = 'Конфликт данных';
                else if (response.status === 429) errorMessage = 'Слишком много запросов';
                else if (response.status === 500) errorMessage = 'Ошибка сервера';
            }
            
            // Сохраняем данные ошибки для дальнейшей обработки
            const error = new Error(errorMessage);
            error.status = response.status;
            error.data = errorData;
            error.url = url;
            
            console.error(`[safeFetch] Error ${response.status} for ${url}:`, errorMessage);
            throw error;
        }
        
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Превышено время ожидания запроса');
        }
        if (error instanceof TypeError && error.message.includes('fetch')) {
            console.error(`[safeFetch] Network error for ${url}:`, error);
            throw new Error('Ошибка сети. Проверьте подключение к интернету');
        }
        throw error;
    } finally {
        if (showLoading) {
            hideLoadingIndicator();
        }
    }
}

/**
 * Показ уведомлений (Toast)
 * @param {string} message - Сообщение для отображения
 * @param {'success'|'error'|'info'} type - Тип уведомления
 * @param {number} duration - Длительность отображения в миллисекундах
 */
export function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    const icon = document.createElement('div');
    icon.className = 'toast-icon';
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'i';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'toast-message';
    messageDiv.textContent = message;
    
    const progress = document.createElement('div');
    progress.className = 'toast-progress';
    progress.style.animationDuration = `${duration}ms`;
    
    toast.appendChild(icon);
    toast.appendChild(messageDiv);
    toast.appendChild(progress);

    container.appendChild(toast);

    // Для мобильных устройств используем requestAnimationFrame
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
    });

    const timer = setTimeout(() => {
        removeToast(toastId);
    }, duration);

    // Закрытие по тапу на мобильных
    toast.addEventListener('click', () => {
        clearTimeout(timer);
        removeToast(toastId);
    });

    // Вибрация на мобильных при ошибке
    if (type === 'error' && 'vibrate' in navigator) {
        navigator.vibrate(100);
    }
}

export function removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (!toast) return;

    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
}

export function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
    document.body.style.overflow = '';
}

export function checkIsMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768;
}

export function preventDoubleTapZoom() {
    let lastTouchEnd = 0;

    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, { passive: false });
}

export function setupSwipeGestures(closeAllModalsCallback) {
    let touchStartX = 0;
    let touchStartY = 0;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!touchStartX || !touchStartY) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;

        // Горизонтальный свайп (только если вертикальное движение минимально)
        if (Math.abs(diffX) > 50 && Math.abs(diffY) < 30) {
            // Свайп влево для закрытия модальных окон
            if (diffX > 0) {
                closeAllModalsCallback();
            }
        }

        touchStartX = 0;
        touchStartY = 0;
    }, { passive: true });
}

export function getApiBaseUrl() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001/api';
    } else if (window.location.hostname === 'shop.mkntw.xyz' || window.location.hostname.includes('mkntw.xyz')) {
        return 'https://apiforshop.mkntw.xyz/api';
    } else {
        return 'https://apiforshop.mkntw.xyz/api';
    }
}

