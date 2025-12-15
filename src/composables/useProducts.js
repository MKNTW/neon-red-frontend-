import { ref } from 'vue'
import { useApi } from './useApi'
import { useToast } from './useToast'

export function useProducts() {
  const { request, loading } = useApi()
  const { showToast } = useToast()

  const products = ref([])
  const currentPage = ref(1)
  const totalPages = ref(1)
  const totalProducts = ref(0)

  async function loadProducts(page = 1, useCache = false) {
    try {
      loading.value = true
      const data = await request(`/products?page=${page}&limit=20`)

      if (data.products) {
        products.value = data.products
        currentPage.value = data.page || page
        totalPages.value = data.totalPages || 1
        totalProducts.value = data.total || data.products.length
      } else {
        products.value = Array.isArray(data) ? data : []
        currentPage.value = 1
        totalPages.value = 1
        totalProducts.value = Array.isArray(data) ? data.length : 0
      }

      return true
    } catch (error) {
      // Не показываем toast для ошибок подключения (уже показан в useApi)
      if (!error.isConnectionError) {
        showToast(error.message || 'Ошибка загрузки товаров', 'error')
      }
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    products,
    currentPage,
    totalPages,
    totalProducts,
    loading,
    loadProducts
  }
}

