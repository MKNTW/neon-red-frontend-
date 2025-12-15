<template>
  <Modal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    content-class="edit-product-modal-content"
  >
    <h2>{{ product ? 'Редактировать товар' : 'Добавить товар' }}</h2>
    <form @submit.prevent="handleSubmit" class="admin-form">
      <input
        v-model="formData.title"
        type="text"
        placeholder="Название товара"
        required
      />
      <textarea
        v-model="formData.description"
        placeholder="Описание товара"
        rows="4"
      ></textarea>
      <input
        v-model.number="formData.price"
        type="number"
        step="0.01"
        placeholder="Цена"
        required
        min="0"
      />
      <input
        v-model.number="formData.quantity"
        type="number"
        placeholder="Количество"
        required
        min="0"
      />
      <label for="product-image-upload" class="file-upload-label">
        <span>📷 Загрузить фото</span>
        <input
          id="product-image-upload"
          type="file"
          accept="image/*"
          @change="handleImageUpload"
          style="display: none;"
        />
      </label>
      <div v-if="imagePreview || formData.image_url" class="image-preview">
        <img
          v-if="imagePreview"
          :src="imagePreview"
          alt="Preview"
        />
        <img
          v-else-if="formData.image_url"
          :src="formData.image_url"
          alt="Product"
        />
        <button
          type="button"
          @click="removeImage"
          class="remove-image-btn"
        >
          🗑️ Удалить изображение
        </button>
      </div>
      <input
        v-model="formData.image_url"
        type="text"
        placeholder="Или введите URL изображения"
      />
      <div v-if="error" class="input-error">{{ error }}</div>
      <div class="admin-form-actions">
        <button type="button" @click="$emit('update:modelValue', false)" class="secondary-btn">
          Отмена
        </button>
        <button type="submit" class="admin-btn" :disabled="loading">
          {{ loading ? 'Сохранение...' : (product ? 'Сохранить' : 'Создать товар') }}
        </button>
      </div>
    </form>
  </Modal>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import Modal from './Modal.vue'
import { useApi } from '../composables/useApi'
import { useToast } from '../composables/useToast'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  product: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'saved'])

const { request } = useApi()
const { showToast } = useToast()

const formData = ref({
  title: '',
  description: '',
  price: 0,
  quantity: 0,
  image_url: ''
})

const imagePreview = ref(null)
const imageFile = ref(null)
const loading = ref(false)
const error = ref('')

watch(() => props.product, (newProduct) => {
  if (newProduct) {
    formData.value = {
      title: newProduct.title || '',
      description: newProduct.description || '',
      price: newProduct.price || 0,
      quantity: newProduct.quantity || 0,
      image_url: newProduct.image_url || ''
    }
    imagePreview.value = null
    imageFile.value = null
  } else {
    resetForm()
  }
}, { immediate: true })

watch(() => props.modelValue, (newVal) => {
  if (!newVal) {
    resetForm()
  }
})

function resetForm() {
  formData.value = {
    title: '',
    description: '',
    price: 0,
    quantity: 0,
    image_url: ''
  }
  imagePreview.value = null
  imageFile.value = null
  error.value = ''
}

function handleImageUpload(event) {
  const file = event.target.files[0]
  if (!file) return
  
  if (file.size > 5 * 1024 * 1024) {
    showToast('Размер файла не должен превышать 5MB', 'error')
    return
  }
  
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    showToast('Неподдерживаемый формат изображения', 'error')
    return
  }
  
  imageFile.value = file
  const reader = new FileReader()
  reader.onload = (e) => {
    imagePreview.value = e.target.result
  }
  reader.readAsDataURL(file)
}

function removeImage() {
  imagePreview.value = null
  imageFile.value = null
  formData.value.image_url = ''
}

async function handleSubmit() {
  error.value = ''
  
  if (!formData.value.title.trim()) {
    error.value = 'Введите название товара'
    return
  }
  
  if (formData.value.price <= 0) {
    error.value = 'Цена должна быть больше 0'
    return
  }
  
  if (formData.value.quantity < 0) {
    error.value = 'Количество не может быть отрицательным'
    return
  }
  
  loading.value = true
  
  try {
    let imageUrl = formData.value.image_url
    
    // Загружаем изображение, если есть файл
    if (imageFile.value) {
      const formDataUpload = new FormData()
      formDataUpload.append('image', imageFile.value)
      
      const uploadResponse = await request('/products/upload-image', {
        method: 'POST',
        headers: {},
        body: formDataUpload
      })
      
      if (uploadResponse.image_url) {
        imageUrl = uploadResponse.image_url
      }
    }
    
    const productData = {
      title: formData.value.title.trim(),
      description: formData.value.description.trim(),
      price: parseFloat(formData.value.price),
      quantity: parseInt(formData.value.quantity),
      image_url: imageUrl || null
    }
    
    if (props.product) {
      // Обновление существующего товара
      await request(`/admin/products/${props.product.id}`, {
        method: 'PUT',
        body: JSON.stringify(productData)
      })
      showToast('Товар обновлен', 'success')
    } else {
      // Создание нового товара
      await request('/admin/products', {
        method: 'POST',
        body: JSON.stringify(productData)
      })
      showToast('Товар создан', 'success')
    }
    
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    error.value = err.message || 'Ошибка сохранения товара'
    showToast(err.message || 'Ошибка сохранения товара', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.edit-product-modal-content {
  max-width: 600px;
}

.admin-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.admin-form input,
.admin-form textarea {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 1rem;
  font-family: inherit;
  transition: all 0.3s;
}

.admin-form input:focus,
.admin-form textarea:focus {
  outline: none;
  border-color: var(--neon-red);
  box-shadow: 0 0 15px rgba(255, 0, 51, 0.3);
}

.admin-form textarea {
  resize: vertical;
  min-height: 100px;
}

.file-upload-label {
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  text-align: center;
  transition: all 0.3s;
}

.file-upload-label:hover {
  border-color: var(--neon-red);
  background: rgba(255, 0, 51, 0.1);
}

.image-preview {
  position: relative;
  width: 100%;
  max-height: 300px;
  overflow: hidden;
  border-radius: 10px;
  border: 2px solid var(--border-color);
}

.image-preview img {
  width: 100%;
  height: auto;
  object-fit: cover;
  display: block;
}

.remove-image-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 8px 12px;
  background: rgba(255, 0, 51, 0.9);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  transition: all 0.3s;
  font-family: inherit;
}

.remove-image-btn:hover {
  background: var(--neon-red);
  box-shadow: 0 0 15px rgba(255, 0, 51, 0.5);
}

.input-error {
  color: var(--neon-red);
  font-size: 0.9rem;
  margin-top: -10px;
}

.admin-form-actions {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}

.secondary-btn {
  flex: 1;
  padding: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  border: 2px solid var(--border-color);
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.secondary-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--neon-red);
}

.admin-btn {
  flex: 1;
  padding: 14px;
  background: var(--neon-red);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.admin-btn:hover:not(:disabled) {
  background: var(--neon-pink);
  box-shadow: 0 0 20px rgba(255, 0, 51, 0.5);
}

.admin-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.email-change-note p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 10px;
}
</style>

