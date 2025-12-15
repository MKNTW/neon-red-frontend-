<template>
  <Transition name="slide-down">
    <div v-if="showWarning" class="connection-warning">
      <div class="connection-warning-content">
        <span class="warning-icon">⚠️</span>
        <div class="warning-text">
          <strong>Не удалось подключиться к серверу</strong>
          <p>Убедитесь, что backend сервер запущен на порту 3001</p>
        </div>
        <button @click="dismissWarning" class="dismiss-btn" aria-label="Закрыть">
          ×
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const showWarning = ref(false)
let storageListener = null
let checkInterval = null

onMounted(() => {
  // Проверяем наличие ошибок подключения
  const checkConnection = () => {
    const hasConnectionError = sessionStorage.getItem('connection_error_shown')
    showWarning.value = !!hasConnectionError
  }
  
  checkConnection()
  
  // Слушаем изменения в sessionStorage
  storageListener = (e) => {
    if (e.key === 'connection_error_shown' && e.newValue) {
      showWarning.value = true
    } else if (e.key === 'connection_error_shown' && !e.newValue) {
      showWarning.value = false
    }
  }
  
  window.addEventListener('storage', storageListener)
  
  // Также проверяем через интервал (на случай, если storage event не сработал)
  checkInterval = setInterval(() => {
    const hasError = sessionStorage.getItem('connection_error_shown')
    showWarning.value = !!hasError
  }, 1000)
})

onUnmounted(() => {
  if (storageListener) {
    window.removeEventListener('storage', storageListener)
  }
  if (checkInterval) {
    clearInterval(checkInterval)
  }
})

function dismissWarning() {
  showWarning.value = false
  sessionStorage.removeItem('connection_error_shown')
}
</script>

<style scoped>
.connection-warning {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(135deg, rgba(255, 0, 51, 0.95), rgba(255, 51, 102, 0.95));
  color: white;
  padding: 15px 20px;
  z-index: 10001;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  border-bottom: 3px solid rgba(255, 255, 255, 0.3);
}

.connection-warning-content {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 15px;
}

.warning-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.warning-text {
  flex: 1;
}

.warning-text strong {
  display: block;
  font-size: 1rem;
  margin-bottom: 5px;
}

.warning-text p {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.9;
}

.dismiss-btn {
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  transition: all 0.3s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
}

.dismiss-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>

