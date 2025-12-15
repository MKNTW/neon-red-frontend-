import { ref, computed, watch } from 'vue'
import { useToast } from './useToast'
import { useApi } from './useApi'
import { useAuth } from './useAuth'

// Singleton для корзины
let cartInstance = null

export function useCart() {
  const { showToast } = useToast()
  const { request } = useApi()
  const { isAuthenticated } = useAuth()

  // Используем singleton pattern для избежания множественных экземпляров
  if (!cartInstance) {
    try {
      const savedCart = localStorage.getItem('cart')
      cartInstance = ref(savedCart ? JSON.parse(savedCart) : [])
    } catch (e) {
      cartInstance = ref([])
    }
  }
  
  const cart = cartInstance

  const cartTotal = computed(() => {
    return cart.value.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  })

  const cartItemsCount = computed(() => {
    return cart.value.reduce((sum, item) => sum + item.quantity, 0)
  })

  function saveCart() {
    try {
      localStorage.setItem('cart', JSON.stringify(cart.value))
    } catch (e) {
      // Ошибка сохранения корзины в localStorage (не критично)
      showToast('Ошибка сохранения корзины', 'error')
    }
  }

  // Синхронизация количества товаров с сервером
  async function syncProductQuantity(productId) {
    try {
      const data = await request(`/products/${productId}`)
      return data.quantity || 0
    } catch (error) {
      // Технические ошибки не показываем пользователю
      return null
    }
  }

  async function addToCart(product) {
    // Синхронизируем актуальное количество с сервером
    const actualQuantity = await syncProductQuantity(product.id)
    const maxQuantity = actualQuantity !== null ? actualQuantity : product.quantity
    
    const existing = cart.value.find(i => i.id === product.id)

    if (existing) {
      // Обновляем максимальное количество из актуальных данных
      existing.maxQuantity = maxQuantity
      
      if (existing.quantity >= maxQuantity) {
        showToast(`Нельзя добавить больше, чем есть в наличии (${maxQuantity})`, 'error')
        return
      }
      existing.quantity += 1
      showToast(`+1 × ${product.title}`, 'success', 2000)
    } else {
      cart.value.push({ 
        ...product, 
        quantity: 1,
        maxQuantity: maxQuantity // Сохраняем актуальное количество
      })
      showToast(`${product.title} добавлен в корзину!`, 'success', 2500)
    }

    saveCart()

    // Вибрация на мобильных
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 30, 50])
    }
  }

  async function changeQuantity(id, delta) {
    const item = cart.value.find(i => i.id === id)
    if (!item) return

    // Синхронизируем количество с сервером при увеличении
    if (delta > 0) {
      const actualQuantity = await syncProductQuantity(id)
      if (actualQuantity !== null) {
        item.maxQuantity = actualQuantity
      }
      
      const maxQuantity = item.maxQuantity !== undefined ? item.maxQuantity : Infinity

      if (item.quantity >= maxQuantity) {
        showToast(`Нельзя добавить больше, чем есть в наличии (${maxQuantity})`, 'error')
        return
      }
    }

    item.quantity += delta

    if (item.quantity <= 0) {
      removeFromCart(id)
    } else {
      saveCart()
    }
  }
  
  // Периодическая синхронизация корзины с сервером
  async function syncCart(silent = false) {
    if (!cart.value.length) return
    
    try {
      // Батчинг запросов для оптимизации
      const productIds = [...new Set(cart.value.map(item => item.id))]
      const quantities = await Promise.all(
        productIds.map(id => syncProductQuantity(id))
      )
      
      const quantityMap = new Map(
        productIds.map((id, index) => [id, quantities[index]])
      )
      
      const itemsToRemove = []
      let hasChanges = false
      
      cart.value.forEach(item => {
        const actualQuantity = quantityMap.get(item.id)
        if (actualQuantity !== null) {
          item.maxQuantity = actualQuantity
          
          // Если товар закончился, помечаем для удаления
          if (actualQuantity === 0) {
            itemsToRemove.push(item.id)
            hasChanges = true
          }
          // Если в корзине больше, чем есть в наличии, уменьшаем
          else if (item.quantity > actualQuantity) {
            item.quantity = actualQuantity
            hasChanges = true
            if (!silent) {
              showToast(`Количество товара "${item.title}" уменьшено до ${actualQuantity}`, 'info')
            }
          }
        }
      })
      
      if (itemsToRemove.length > 0) {
        cart.value = cart.value.filter(item => !itemsToRemove.includes(item.id))
        hasChanges = true
        if (!silent) {
          showToast('Некоторые товары удалены из корзины (закончились)', 'info')
        }
      }
      
      if (hasChanges) {
        saveCart()
      }
    } catch (error) {
      // Технические ошибки синхронизации не показываем пользователю
    }
  }

  function removeFromCart(id) {
    cart.value = cart.value.filter(i => i.id !== id)
    saveCart()
    showToast('Товар удалён из корзины', 'info', 2000)
  }

  function clearCart() {
    cart.value = []
    saveCart()
    showToast('Корзина очищена', 'info')
  }

  async function checkout(shippingAddress) {
    if (!cart.value.length) {
      showToast('Корзина пуста!', 'error', 2500)
      return false
    }

    if (!isAuthenticated.value) {
      showToast('Для оформления заказа войдите в систему', 'error', 3000)
      return false
    }

    if (!shippingAddress || shippingAddress.trim() === '') {
      showToast('Введите адрес доставки', 'error')
      return false
    }

    try {
      const orderData = {
        items: cart.value.map(item => ({
          id: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        shippingAddress: shippingAddress.trim(),
        paymentMethod: 'card'
      }

      const order = await request('/orders', {
        method: 'POST',
        body: JSON.stringify(orderData)
      })

      showToast(`Заказ #${order.id.substring(0, 8)} оформлен!`, 'success', 5000)
      clearCart()
      return true
    } catch (error) {
      return false
    }
  }

  return {
    cart,
    cartTotal,
    cartItemsCount,
    addToCart,
    changeQuantity,
    removeFromCart,
    clearCart,
    checkout,
    syncCart
  }
}

