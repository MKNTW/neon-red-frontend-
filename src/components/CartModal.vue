<template>
  <Modal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    content-class="cart-modal-content"
  >
    <div class="profile-header">
      <h2>Ваша корзина</h2>
    </div>

    <div v-if="cart.length === 0" class="empty-state">
      <div class="empty-state-icon">🛒</div>
      <h3 class="empty-state-title">Корзина пуста</h3>
      <p class="empty-state-description">
        Добавьте товары в корзину, чтобы оформить заказ
      </p>
      <button @click="$emit('close')" class="browse-products-btn">
        Посмотреть товары
      </button>
    </div>

    <div v-else>
      <div class="cart-items">
        <div
          v-for="item in cart"
          :key="item.id"
          class="cart-item"
        >
          <div class="cart-item-content">
            <div
              v-if="item.image_url && isValidImageUrl(item.image_url)"
              class="cart-item-image"
            >
              <img :src="item.image_url" :alt="item.title" @error="handleImageError" />
            </div>
            <div
              v-else
              class="cart-item-image-fallback"
            >
              {{ item.title.charAt(0).toUpperCase() }}
            </div>
            <div class="cart-item-info">
              <h4 class="cart-item-title">{{ item.title }}</h4>
              <p class="cart-item-price">
                {{ formatPrice(item.price) }} ₽ × {{ item.quantity }} = {{ formatPrice(item.price * item.quantity) }} ₽
              </p>
              <div class="cart-item-controls">
                <button
                  @click="changeQuantity(item.id, -1)"
                  class="quantity-btn"
                  aria-label="Уменьшить количество"
                >
                  −
                </button>
                <span class="quantity-display">{{ item.quantity }}</span>
                <button
                  @click="changeQuantity(item.id, 1)"
                  class="quantity-btn"
                  aria-label="Увеличить количество"
                >
                  +
                </button>
                <button
                  @click="removeFromCart(item.id)"
                  class="remove-btn"
                  aria-label="Удалить из корзины"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="cart-total">
        <p class="total-text">
          Итого: <strong class="total-amount">{{ formatPrice(cartTotal) }} ₽</strong>
        </p>
        <div class="cart-actions">
          <button @click="clearCart" class="secondary-btn">
            Очистить
          </button>
          <button @click="openCheckoutDialog" class="primary-btn">
            Оформить заказ
          </button>
        </div>
      </div>
    </div>

    <InputDialog
      v-model="showAddressDialog"
      title="Адрес доставки"
      message="Введите адрес для доставки заказа"
      label="Адрес доставки"
      placeholder="Город, улица, дом, квартира"
      confirm-text="Оформить заказ"
      @confirm="handleAddressConfirm"
    />
  </Modal>
</template>

<script setup>
import { ref } from 'vue'
import Modal from './Modal.vue'
import InputDialog from './InputDialog.vue'
import { useCart } from '../composables/useCart'
import { useToast } from '../composables/useToast'

defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'close', 'checkout'])

const { cart, cartTotal, changeQuantity, removeFromCart, clearCart, checkout } = useCart()
const { showToast } = useToast()
const imageErrors = ref(new Set())

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (url.includes('via.placeholder.com')) return false
  return url.startsWith('http') || url.startsWith('//')
}

function handleImageError(event) {
  imageErrors.value.add(event.target.src)
}

function formatPrice(price) {
  return parseFloat(price).toFixed(2)
}

const showAddressDialog = ref(false)

function openCheckoutDialog() {
  showAddressDialog.value = true
}

function handleAddressConfirm(address) {
  if (!address || address.trim() === '') {
    showToast('Введите адрес доставки', 'error')
    return
  }
  processCheckout(address.trim())
}

async function processCheckout(address) {
  const success = await checkout(address)
  if (success) {
    showAddressDialog.value = false
    emit('update:modelValue', false)
  }
}
</script>

<style scoped>
.cart-modal-content {
  max-width: 600px;
}

.profile-header {
  text-align: center;
  margin-bottom: 30px;
}

.profile-header h2 {
  color: var(--neon-red);
  font-size: 1.8rem;
  font-weight: 900;
  text-shadow: 0 0 10px rgba(255, 0, 51, 0.5);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
}

.empty-state-icon {
  font-size: 4rem;
  margin-bottom: 20px;
}

.empty-state-title {
  font-size: 1.5rem;
  color: var(--text-primary);
  margin-bottom: 10px;
  font-weight: 700;
}

.empty-state-description {
  color: var(--text-secondary);
  margin-bottom: 30px;
}

.browse-products-btn {
  padding: 12px 24px;
  background: var(--neon-red);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.browse-products-btn:hover {
  background: var(--neon-pink);
  box-shadow: 0 0 20px rgba(255, 0, 51, 0.5);
}

.cart-items {
  max-height: 400px;
  overflow-y: auto;
  margin-bottom: 20px;
}

.cart-item {
  padding: 15px;
  margin-bottom: 15px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--border-color);
  border-radius: 10px;
}

.cart-item-content {
  display: flex;
  gap: 15px;
  align-items: flex-start;
}

.cart-item-image,
.cart-item-image-fallback {
  width: 90px;
  height: 90px;
  border-radius: 14px;
  border: 3px solid var(--neon-red);
  flex-shrink: 0;
  overflow: hidden;
}

.cart-item-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cart-item-image-fallback {
  background: linear-gradient(135deg, var(--neon-red), var(--neon-pink));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 900;
  color: white;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.cart-item-info {
  flex: 1;
  min-width: 0;
}

.cart-item-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.cart-item-price {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 8px;
}

.cart-item-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.quantity-btn {
  width: 32px;
  height: 32px;
  border: 2px solid var(--border-color);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  border-radius: 8px;
  font-size: 1.2rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.quantity-btn:hover {
  border-color: var(--neon-red);
  background: rgba(255, 0, 51, 0.1);
}

.quantity-display {
  min-width: 35px;
  text-align: center;
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--neon-red);
  padding: 0 8px;
}

.remove-btn {
  width: 32px;
  height: 32px;
  border: 2px solid var(--neon-red);
  background: rgba(255, 0, 51, 0.1);
  color: var(--neon-red);
  border-radius: 8px;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
  margin-left: auto;
}

.remove-btn:hover {
  background: var(--neon-red);
  color: white;
}

.cart-total {
  background: rgba(255, 0, 51, 0.1);
  border: 2px solid var(--neon-red);
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}

.total-text {
  font-size: 1.2rem;
  color: var(--text-primary);
  margin-bottom: 15px;
}

.total-amount {
  color: var(--neon-red);
  font-size: 1.5rem;
  text-shadow: 0 0 10px rgba(255, 0, 51, 0.5);
}

.cart-actions {
  display: flex;
  gap: 12px;
}

.primary-btn,
.secondary-btn {
  flex: 1;
  padding: 14px;
  min-height: 50px;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.primary-btn {
  background: var(--neon-red);
  color: white;
}

.primary-btn:hover {
  background: var(--neon-pink);
  box-shadow: 0 0 20px rgba(255, 0, 51, 0.5);
}

.secondary-btn {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  border: 2px solid var(--border-color);
}

.secondary-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--neon-red);
}
</style>

