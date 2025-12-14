// api.js - Утилиты для работы с API (устранение дублирования паттернов запросов)

import { safeFetch, showLoadingIndicator, hideLoadingIndicator } from './utils.js';

/**
 * Базовый класс для работы с API
 */
export class ApiClient {
    constructor(baseUrl, token = null) {
        this.baseUrl = baseUrl;
        this.token = token;
    }

    /**
     * Установка токена авторизации
     * @param {string|null} token - JWT токен
     */
    setToken(token) {
        this.token = token;
    }

    /**
     * Получение заголовков для запроса
     * @param {Object} additionalHeaders - Дополнительные заголовки
     * @returns {Object} - Объект с заголовками
     */
    getHeaders(additionalHeaders = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...additionalHeaders
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    /**
     * GET запрос
     * @param {string} endpoint - Конечная точка API
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Response>}
     */
    async get(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        return safeFetch(url, {
            method: 'GET',
            headers: this.getHeaders(options.headers),
            ...options
        });
    }

    /**
     * POST запрос
     * @param {string} endpoint - Конечная точка API
     * @param {Object} data - Данные для отправки
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Response>}
     */
    async post(endpoint, data, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        return safeFetch(url, {
            method: 'POST',
            headers: this.getHeaders(options.headers),
            body: JSON.stringify(data),
            ...options
        });
    }

    /**
     * PUT запрос
     * @param {string} endpoint - Конечная точка API
     * @param {Object} data - Данные для отправки
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Response>}
     */
    async put(endpoint, data, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        return safeFetch(url, {
            method: 'PUT',
            headers: this.getHeaders(options.headers),
            body: JSON.stringify(data),
            ...options
        });
    }

    /**
     * DELETE запрос
     * @param {string} endpoint - Конечная точка API
     * @param {Object} options - Дополнительные опции
     * @returns {Promise<Response>}
     */
    async delete(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        return safeFetch(url, {
            method: 'DELETE',
            headers: this.getHeaders(options.headers),
            ...options
        });
    }

    /**
     * Обработка ответа с автоматическим парсингом JSON
     * @param {Response} response - Ответ сервера
     * @returns {Promise<Object>} - Распарсенные данные
     */
    async handleResponse(response) {
        const data = await response.json();
        
        if (!response.ok) {
            const error = new Error(data.error || data.message || `Ошибка ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        
        return data;
    }

    /**
     * Универсальный метод для запросов с автоматической обработкой
     * @param {string} endpoint - Конечная точка API
     * @param {Object} options - Опции запроса
     * @returns {Promise<Object>} - Данные ответа
     */
    async request(endpoint, options = {}) {
        const response = await this.get(endpoint, options);
        return this.handleResponse(response);
    }
}

/**
 * Создание экземпляра API клиента
 * @param {string} baseUrl - Базовый URL API
 * @param {string|null} token - JWT токен
 * @returns {ApiClient} - Экземпляр API клиента
 */
export function createApiClient(baseUrl, token = null) {
    return new ApiClient(baseUrl, token);
}

