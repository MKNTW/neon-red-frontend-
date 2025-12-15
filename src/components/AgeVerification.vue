<template>
  <div
    v-if="!ageVerified"
    id="age-verification-modal"
    class="modal age-verification"
    role="dialog"
    aria-hidden="false"
  >
    <div class="modal-content age-verification-content">
      <div class="age-verification-header">
        <h2>🔞 Проверка возраста</h2>
      </div>
      <div class="age-verification-body">
        <p>Вам есть 18 лет?</p>
        <p class="age-subtitle">Для доступа к сайту необходимо подтвердить возраст</p>
      </div>
      <div class="age-verification-actions">
        <button @click="handleYes" class="age-btn age-yes-btn">
          Да, мне есть 18
        </button>
        <button @click="handleNo" class="age-btn age-no-btn">
          Нет, мне нет 18
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const ageVerified = ref(false)

onMounted(() => {
  const verified = localStorage.getItem('ageVerified')
  ageVerified.value = verified === 'true'
})

function handleYes() {
  localStorage.setItem('ageVerified', 'true')
  ageVerified.value = true
}

function handleNo() {
  // Показываем сообщение и перенаправляем
  setTimeout(() => {
    window.location.href = 'https://www.google.com'
  }, 1000)
}
</script>

<style scoped>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.age-verification-content {
  background: var(--card-bg);
  border: 3px solid var(--neon-red);
  border-radius: 20px;
  padding: 40px 30px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 0 40px rgba(255, 0, 51, 0.5);
}

.age-verification-header h2 {
  color: var(--neon-red);
  font-size: 1.8rem;
  margin-bottom: 20px;
  font-weight: 900;
  text-shadow: 0 0 10px rgba(255, 0, 51, 0.5);
}

.age-verification-body p {
  color: var(--text-primary);
  font-size: 1.1rem;
  margin-bottom: 10px;
}

.age-subtitle {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.age-verification-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 30px;
}

.age-btn {
  padding: 14px 24px;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.age-yes-btn {
  background: var(--neon-red);
  color: white;
  box-shadow: 0 0 20px rgba(255, 0, 51, 0.4);
}

.age-yes-btn:hover {
  background: var(--neon-pink);
  box-shadow: 0 0 30px rgba(255, 0, 51, 0.6);
  transform: translateY(-2px);
}

.age-no-btn {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  border: 2px solid var(--border-color);
}

.age-no-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--neon-red);
}
</style>

