import { ref } from 'vue'
import { useToast } from './useToast'

// Определяем API URL в зависимости от окружения
function getApiBaseUrl() {
  // Приоритет 1: Переменная окружения (для production на Vercel)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // Приоритет 2: Автоматическое определение для production
  if (import.meta.env.PROD) {
    // В production без переменной окружения возвращаем пустую строку
    // Технические ошибки не показываем пользователю
    return ''
  }
  
  // Для разработки используем localhost
  return 'http://localhost:3001/api'
}

const API_BASE_URL = getApiBaseUrl()
const FETCH_TIMEOUT_MS = 60 * 1000
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

export function useApi() {
  const { showToast } = useToast()
  const loading = ref(false)

  async function safeFetch(url, options = {}) {
    let lastError = null
    const showLoading = options.method && options.method !== 'GET' || options.showLoading === true

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

      if (showLoading && attempt === 0) {
        loading.value = true
      }

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          credentials: 'include',
          keepalive: true
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          let errorMessage = `Ошибка ${response.status}`
          let errorData = null
          try {
            errorData = await response.json()
            errorMessage = errorData.error || errorData.message || errorMessage
          } catch (e) {
            if (response.status === 401) errorMessage = 'Требуется авторизация'
            else if (response.status === 403) errorMessage = 'Доступ запрещен'
            else if (response.status === 404) errorMessage = 'Ресурс не найден'
            else if (response.status === 400) errorMessage = 'Неверный запрос'
            else if (response.status === 409) errorMessage = 'Конфликт данных'
            else if (response.status === 429) errorMessage = 'Слишком много запросов'
            else if (response.status === 500) errorMessage = 'Ошибка сервера'
          }

          if (response.status >= 500 || response.status === 0) {
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
              continue
            }
          }

          const error = new Error(errorMessage)
          error.status = response.status
          error.data = errorData
          error.url = url
          throw error
        }

        if (showLoading) {
          loading.value = false
        }

        return response
      } catch (error) {
        clearTimeout(timeoutId)

        if ((error.name === 'AbortError' || 
             (error instanceof TypeError && error.message.includes('fetch'))) &&
            attempt < MAX_RETRIES - 1) {
          lastError = error
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
          continue
        }

        if (showLoading) {
          loading.value = false
        }

        throw error
      }
    }

    if (showLoading) {
      loading.value = false
    }

    throw lastError || new Error('Неизвестная ошибка')
  }

  async function request(endpoint, options = {}, retryCount = 0) {
    const url = `${API_BASE_URL}${endpoint}`
    const token = localStorage.getItem('token')
    const maxRetries = options.maxRetries !== undefined ? options.maxRetries : 1
    
    // Для FormData не устанавливаем Content-Type, браузер сделает это сам
    const isFormData = options.body instanceof FormData
    const headers = isFormData 
      ? { ...options.headers }
      : {
          'Content-Type': 'application/json',
          ...options.headers
        }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await safeFetch(url, {
        ...options,
        headers
      })
      return await response.json()
    } catch (error) {
      // Проверяем на ошибку подключения к серверу
      const isConnectionError = 
        error.message?.includes('ERR_CONNECTION_REFUSED') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('NetworkError') ||
        error.name === 'TypeError' ||
        error.status === 0
      
      if (isConnectionError) {
        // Показываем toast только один раз для ошибок подключения
        const connectionErrorShown = sessionStorage.getItem('connection_error_shown')
        if (!connectionErrorShown) {
          let errorMessage = 'Не удалось подключиться к серверу'
          if (import.meta.env.PROD) {
            errorMessage = 'Не удалось подключиться к backend серверу. Проверьте настройку VITE_API_URL в Vercel'
          } else {
            errorMessage = 'Не удалось подключиться к серверу. Убедитесь, что backend запущен на порту 3001'
          }
          showToast(errorMessage, 'error', 8000)
          sessionStorage.setItem('connection_error_shown', 'true')
          // Сбрасываем флаг через 10 секунд
          setTimeout(() => {
            sessionStorage.removeItem('connection_error_shown')
          }, 10000)
        }
        const connectionError = new Error('Не удалось подключиться к серверу')
        connectionError.isConnectionError = true
        error.retryable = true
        throw error
      }
      
      // Для других ошибок показываем понятное сообщение
      const errorMessage = error.data?.error || error.data?.message || error.message || 'Ошибка запроса'
      
      // Определяем, можно ли повторить запрос
      const isRetryable = error.status >= 500 || error.status === 0 || isConnectionError
      
      if (isRetryable && retryCount < maxRetries) {
        // Автоматический retry для серверных ошибок
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
        return request(endpoint, options, retryCount + 1)
      }
      
      // Показываем ошибку пользователю
      showToast(errorMessage, 'error')
      error.retryable = isRetryable && retryCount >= maxRetries
      throw error
    }
  }

  return {
    loading,
    request,
    API_BASE_URL
  }
}

