<template>
  <header>
    <div class="container">
      <div class="header-top-new">
        <h1 class="logo-animated">NEON RED</h1>
        <div class="header-controls">
          <button
            v-if="isAuthenticated"
            @click="$emit('open-profile')"
            class="header-btn profile-header-btn"
            aria-label="Открыть профиль"
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">👤</span>
            <span class="btn-text">Профиль</span>
          </button>
          <button
            v-else
            @click="$emit('open-auth')"
            class="header-btn auth-header-btn"
            aria-label="Войти в аккаунт"
            aria-haspopup="dialog"
          >
            Войти
          </button>
          <button
            v-if="isAuthenticated"
            @click="$emit('open-cart')"
            class="header-btn cart-header-btn"
            aria-label="Открыть корзину"
            aria-haspopup="dialog"
          >
            <span class="cart-icon" aria-hidden="true">🛒</span>
            <span
              v-if="cartItemsCount > 0"
              class="cart-badge"
              :class="{ animate: badgeAnimate }"
              aria-live="polite"
              aria-atomic="true"
            >
              {{ cartItemsCount }}
            </span>
          </button>
        </div>
      </div>
      <div class="header-admin">
        <button
          v-if="isAdmin"
          @click="$emit('open-admin')"
          class="header-btn admin-header-btn"
          aria-label="Открыть админ-панель"
          aria-haspopup="dialog"
        >
          <span aria-hidden="true">⚙️</span>
          <span class="btn-text">Админ-панель</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useCart } from '../composables/useCart'

defineEmits(['open-profile', 'open-auth', 'open-cart', 'open-admin'])

const { isAuthenticated, isAdmin } = useAuth()
const { cartItemsCount } = useCart()
const badgeAnimate = ref(false)

watch(cartItemsCount, () => {
  badgeAnimate.value = true
  setTimeout(() => {
    badgeAnimate.value = false
  }, 500)
})
</script>

<style scoped>
header {
  background: rgba(10, 10, 10, 0.95);
  border-bottom: 2px solid var(--neon-red);
  padding: 20px 0;
  position: sticky;
  top: 0;
  z-index: 1000;
  backdrop-filter: blur(10px);
}

.header-top-new {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.logo-animated {
  font-size: 2rem;
  font-weight: 900;
  color: var(--neon-red);
  text-shadow: 0 0 20px rgba(255, 0, 51, 0.8);
  animation: neon-pulse 2s ease-in-out infinite;
  margin: 0;
}

@keyframes neon-pulse {
  0%, 100% { opacity: 1; text-shadow: 0 0 20px rgba(255, 0, 51, 0.8); }
  50% { opacity: 0.8; text-shadow: 0 0 30px rgba(255, 0, 51, 1); }
}

.header-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.header-btn:hover {
  background: rgba(255, 0, 51, 0.1);
  border-color: var(--neon-red);
  box-shadow: 0 0 15px rgba(255, 0, 51, 0.3);
}

.cart-header-btn {
  position: relative;
}

.cart-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: var(--neon-red);
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 900;
  box-shadow: 0 0 10px rgba(255, 0, 51, 0.5);
}

.cart-badge.animate {
  animation: badge-bounce 0.5s ease;
}

@keyframes badge-bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.3); }
}

.header-admin {
  margin-bottom: 0;
}
</style>

