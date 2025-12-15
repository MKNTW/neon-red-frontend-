<template>
  <main class="container" role="main">
    <div v-if="loading" class="products-loading">
      <div v-for="i in 6" :key="i" class="skeleton-product">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton-content">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-description"></div>
          <div class="skeleton skeleton-description"></div>
          <div class="skeleton-footer">
            <div class="skeleton skeleton-price"></div>
          </div>
          <div class="skeleton skeleton-button"></div>
        </div>
      </div>
    </div>

    <div v-else-if="!isAuthenticated" class="login-prompt">
      <div class="login-prompt-content">
        <h2>🔒 Доступ ограничен</h2>
        <p>Для просмотра каталога товаров необходимо войти в систему или зарегистрироваться</p>
        <div class="login-prompt-actions">
          <button @click="$emit('open-auth')" class="primary-btn">
            Войти
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="products.length === 0" class="empty-state">
      <div class="empty-state-icon">📦</div>
      <h3 class="empty-state-title">Товаров пока нет</h3>
      <p class="empty-state-description">
        Каталог товаров пуст. Скоро здесь появятся новые товары!
      </p>
    </div>

    <div v-else class="products" role="list" aria-label="Список товаров" aria-live="polite">
      <ProductCard
        v-for="(product, index) in products"
        :key="product.id"
        :product="product"
        :index="index"
        @add-to-cart="$emit('add-to-cart', $event)"
      />
    </div>

    <ProductPagination
      v-if="totalPages > 1"
      :current-page="currentPage"
      :total-pages="totalPages"
      @page-change="$emit('page-change', $event)"
    />
  </main>
</template>

<script setup>
import { useAuth } from '../composables/useAuth'
import ProductCard from './ProductCard.vue'
import ProductPagination from './ProductPagination.vue'

defineProps({
  products: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  currentPage: {
    type: Number,
    default: 1
  },
  totalPages: {
    type: Number,
    default: 1
  }
})

defineEmits(['open-auth', 'add-to-cart', 'page-change'])

const { isAuthenticated } = useAuth()
</script>

<style scoped>
.products {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  padding: 30px 0;
}

.products-loading {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  padding: 30px 0;
}

.skeleton-product {
  background: var(--card-bg);
  border: 2px solid var(--border-color);
  border-radius: 16px;
  overflow: hidden;
  padding: 20px;
}

.skeleton {
  background: linear-gradient(90deg, var(--darker-bg) 25%, var(--card-bg) 50%, var(--darker-bg) 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite;
  border-radius: 8px;
}

.skeleton-image {
  width: 100%;
  height: 200px;
  margin-bottom: 15px;
}

.skeleton-title {
  height: 24px;
  width: 70%;
  margin-bottom: 10px;
}

.skeleton-description {
  height: 16px;
  width: 100%;
  margin-bottom: 8px;
}

.skeleton-price {
  height: 28px;
  width: 100px;
}

.skeleton-button {
  height: 48px;
  width: 100%;
  margin-top: 15px;
}

@keyframes loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.login-prompt {
  text-align: center;
  padding: 60px 20px;
  grid-column: 1/-1;
}

.login-prompt-content {
  max-width: 500px;
  margin: 0 auto;
}

.login-prompt h2 {
  color: var(--neon-red);
  font-size: 2rem;
  margin-bottom: 20px;
  font-weight: 900;
}

.login-prompt p {
  color: var(--text-secondary);
  font-size: 1.1rem;
  margin-bottom: 30px;
  line-height: 1.6;
}

.login-prompt-actions {
  display: flex;
  gap: 15px;
  justify-content: center;
  flex-wrap: wrap;
}

.primary-btn,
.secondary-btn {
  padding: 14px 28px;
  font-size: 1rem;
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

.empty-state {
  text-align: center;
  padding: 80px 20px;
  grid-column: 1/-1;
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
  font-size: 1rem;
}
</style>

