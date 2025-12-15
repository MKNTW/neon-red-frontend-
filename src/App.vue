<template>
  <div id="app">
    <ConnectionStatus />
    <ToastContainer />
    <AgeVerification />

    <Header
      @open-profile="showProfileModal = true"
      @open-auth="showAuthModal = true"
      @open-cart="showCartModal = true"
      @open-admin="showAdminModal = true"
      @load-products="loadProducts"
    />

    <ProductList
      :products="products"
      :loading="loading"
      :current-page="currentPage"
      :total-pages="totalPages"
      @open-auth="showAuthModal = true"
      @add-to-cart="handleAddToCart"
      @page-change="handlePageChange"
    />

    <AuthModal
      v-model="showAuthModal"
      @open-forgot-password="showForgotPasswordModal = true"
      @success="handleAuthSuccess"
    />

    <CartModal
      v-model="showCartModal"
      @checkout="handleCheckout"
    />

    <ProfileModal
      v-if="isAuthenticated"
      v-model="showProfileModal"
    />

    <AdminModal
      v-if="isAdmin"
      v-model="showAdminModal"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuth } from './composables/useAuth'
import { useCart } from './composables/useCart'
import { useProducts } from './composables/useProducts'
import ConnectionStatus from './components/ConnectionStatus.vue'
import ToastContainer from './components/ToastContainer.vue'
import AgeVerification from './components/AgeVerification.vue'
import Header from './components/Header.vue'
import ProductList from './components/ProductList.vue'
import AuthModal from './components/AuthModal.vue'
import CartModal from './components/CartModal.vue'
import ProfileModal from './components/ProfileModal.vue'
import AdminModal from './components/AdminModal.vue'

const { isAuthenticated, isAdmin, validateToken } = useAuth()
const { addToCart, syncCart } = useCart()
const { products, loading, currentPage, totalPages, loadProducts } = useProducts()

const showAuthModal = ref(false)
const showCartModal = ref(false)
const showProfileModal = ref(false)
const showAdminModal = ref(false)
const showForgotPasswordModal = ref(false)

onMounted(async () => {
  await validateToken()
  await loadProducts(1, false)
  
  // Синхронизируем корзину с сервером при загрузке
  if (isAuthenticated.value) {
    syncCart()
  }
  
  // Периодическая синхронизация корзины (каждые 30 секунд, только если страница видима)
  let syncInterval = null
  const startSyncInterval = () => {
    if (syncInterval) clearInterval(syncInterval)
    syncInterval = setInterval(() => {
      if (isAuthenticated.value && document.visibilityState === 'visible') {
        syncCart(true) // silent mode для фоновой синхронизации
      }
    }, 30000)
  }
  
  startSyncInterval()
  
  // Останавливаем синхронизацию при скрытии страницы
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      startSyncInterval()
      if (isAuthenticated.value) {
        syncCart(true) // Синхронизируем при возврате на страницу
      }
    } else {
      if (syncInterval) {
        clearInterval(syncInterval)
        syncInterval = null
      }
    }
  })
})

function handleAddToCart(product) {
  addToCart(product)
}

function handlePageChange(page) {
  loadProducts(page, false)
}

function handleAuthSuccess() {
  loadProducts(1, false)
}

async function handleCheckout() {
  // Логика оформления заказа будет реализована в CartModal
  // Пока просто закрываем модалку
  showCartModal.value = false
}
</script>

<style>
#app {
  min-height: 100vh;
}
</style>

