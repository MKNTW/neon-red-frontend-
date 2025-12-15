<template>
  <Modal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    content-class="profile-modal-content"
  >
    <div class="profile-header">
      <div class="profile-avatar-container">
        <div class="profile-avatar">
          <img
            v-if="user?.avatar_url"
            :src="user.avatar_url"
            alt="Avatar"
            class="profile-avatar-img"
          />
          <span v-else class="profile-avatar-text">
            {{ user?.username?.charAt(0).toUpperCase() || 'U' }}
          </span>
        </div>
        <label for="profile-avatar-upload" class="profile-avatar-upload-btn" title="Изменить фото">
          <span>📷</span>
        </label>
        <input
          id="profile-avatar-upload"
          type="file"
          accept="image/*"
          @change="handleAvatarUpload"
          style="display: none;"
        />
      </div>
      <h2>{{ user?.username || 'Пользователь' }}</h2>
      <p class="profile-subtitle">{{ user?.email || 'email@example.com' }}</p>
      <div v-if="user?.isAdmin" class="admin-badge">
        <span>👑</span> Администратор
      </div>
    </div>

    <div class="profile-info">
      <div class="profile-section">
        <h3 class="profile-section-title">Личная информация</h3>
        
        <ProfileField
          label="Имя пользователя"
          :value="user?.username || 'Не указано'"
          :editing="editingField === 'username'"
          @edit="startEdit('username')"
        />
        <ProfileFieldEdit
          v-if="editingField === 'username'"
          field="username"
          label="Имя пользователя"
          :current-value="user?.username || ''"
          :loading="updating"
          @save="saveField"
          @cancel="cancelEdit"
        />
        
        <ProfileField
          label="Email"
          :value="user?.email || 'Не указано'"
          :editing="editingField === 'email'"
          @edit="startEdit('email')"
        />
        <div v-if="editingField === 'email'" class="email-change-note">
          <p>Для смены email используйте специальную форму с подтверждением через код.</p>
          <button @click="cancelEdit" class="profile-cancel-btn">Отмена</button>
        </div>
        
        <ProfileField
          label="Полное имя"
          :value="user?.fullName || 'Не указано'"
          :editing="editingField === 'fullName'"
          @edit="startEdit('fullName')"
        />
        <ProfileFieldEdit
          v-if="editingField === 'fullName'"
          field="fullName"
          label="Полное имя"
          :current-value="user?.fullName || ''"
          :loading="updating"
          @save="saveField"
          @cancel="cancelEdit"
        />
        
        <ProfileField
          label="Пароль"
          value="••••••••"
          :editing="editingField === 'password'"
          @edit="startEdit('password')"
        />
        <ProfileFieldEdit
          v-if="editingField === 'password'"
          field="password"
          label="Пароль"
          :loading="updating"
          @save="saveField"
          @cancel="cancelEdit"
        />
      </div>

      <div class="profile-section">
        <h3 class="profile-section-title">Ваши заказы</h3>
        <div v-if="orders.length === 0" class="empty-orders">
          <p>Заказов пока нет</p>
        </div>
        <div v-else class="orders-list">
          <div
            v-for="order in orders"
            :key="order.id"
            class="order-item"
            @click="showOrderDetails(order)"
          >
            <p><strong>Заказ #{{ order.id.substring(0, 8) }}</strong></p>
            <p>Дата: {{ formatDate(order.created_at) }}</p>
            <p>Сумма: <strong>{{ order.total_amount }} ₽</strong></p>
            <p>Статус: <span :class="`status-${order.status}`">{{ order.status }}</span></p>
          </div>
        </div>
      </div>

      <div class="profile-actions">
        <button @click="handleLogout" class="profile-logout-btn">
          <span>🚪</span>
          <span>Выйти из аккаунта</span>
        </button>
        <button @click="openDeleteConfirm" class="profile-delete-btn">
          <span>🗑️</span>
          <span>Удалить аккаунт</span>
        </button>
      </div>
    </div>

    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Удаление аккаунта"
      message="Вы уверены, что хотите удалить аккаунт? Это действие необратимо. Все ваши данные будут удалены."
      icon="🗑️"
      confirm-text="Удалить аккаунт"
      cancel-text="Отмена"
      @confirm="confirmDeleteAccount"
    />
  </Modal>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import Modal from './Modal.vue'
import ProfileField from './ProfileField.vue'
import ProfileFieldEdit from './ProfileFieldEdit.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { useAuth } from '../composables/useAuth'
import { useApi } from '../composables/useApi'
import { useToast } from '../composables/useToast'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const { user, token, logout, saveAuth } = useAuth()
const { request } = useApi()
const { showToast } = useToast()

const orders = ref([])
const editingField = ref(null)
const updating = ref(false)

watch(() => props.modelValue, (newVal) => {
  if (newVal && user.value) {
    loadOrders()
  } else {
    editingField.value = null
  }
})

onMounted(async () => {
  if (user.value) {
    await loadOrders()
  }
})

async function loadOrders() {
  try {
    const data = await request('/orders')
    orders.value = Array.isArray(data) ? data : []
  } catch (error) {
    // Ошибка загрузки заказов обработана в showToast
  }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('ru-RU')
}

function startEdit(field) {
  editingField.value = field
}

function cancelEdit() {
  editingField.value = null
}

async function saveField(value, confirmValue) {
  if (!editingField.value) return
  
  updating.value = true
  try {
    const field = editingField.value
    const fieldMap = {
      'username': 'username',
      'fullName': 'fullName',
      'password': 'password'
    }
    
    const serverField = fieldMap[field]
    if (!serverField) {
      showToast('Неизвестное поле для обновления', 'error')
      return
    }
    
    // Проверка на изменение значения
    if (field !== 'password') {
      const currentValue = user.value?.[field] || ''
      if (value === currentValue) {
        showToast('Значение не изменилось', 'info')
        cancelEdit()
        return
      }
    }
    
    const requestBody = { [serverField]: value }
    
    const data = await request('/profile', {
      method: 'PUT',
      body: JSON.stringify(requestBody)
    })
    
    if (data.user) {
      saveAuth(data.user, token.value || '')
      showToast('Профиль обновлен', 'success')
      cancelEdit()
    }
  } catch (error) {
    showToast(error.message || 'Ошибка обновления профиля', 'error')
  } finally {
    updating.value = false
  }
}

async function handleAvatarUpload(event) {
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
  
  try {
    updating.value = true
    const formData = new FormData()
    formData.append('avatar', file)
    
    const data = await request('/profile/avatar', {
      method: 'POST',
      headers: {},
      body: formData
    })
    
    if (data.user) {
      saveAuth(data.user, token.value || '')
      showToast('Аватар обновлен', 'success')
    }
  } catch (error) {
    showToast(error.message || 'Ошибка загрузки аватара', 'error')
  } finally {
    updating.value = false
    event.target.value = ''
  }
}

function showOrderDetails(order) {
  showToast(`Заказ #${order.id.substring(0, 8)}`, 'info')
}

function handleLogout() {
  logout()
  emit('update:modelValue', false)
}

const showDeleteConfirm = ref(false)

function openDeleteConfirm() {
  showDeleteConfirm.value = true
}

async function confirmDeleteAccount() {
  try {
    await request('/profile', { method: 'DELETE' })
    showToast('Аккаунт удалён', 'success')
    showDeleteConfirm.value = false
    logout()
    emit('update:modelValue', false)
  } catch (error) {
    showToast(error.message || 'Ошибка удаления аккаунта', 'error')
  }
}
</script>

<style scoped>
.profile-modal-content {
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.profile-header {
  text-align: center;
  margin-bottom: 30px;
}

.profile-avatar-container {
  position: relative;
  display: inline-block;
  margin-bottom: 15px;
}

.profile-avatar {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 3px solid var(--neon-red);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--neon-red), var(--neon-pink));
  margin: 0 auto;
  overflow: hidden;
}

.profile-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-avatar-text {
  font-size: 2.5rem;
  font-weight: 900;
  color: white;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.profile-avatar-upload-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 36px;
  height: 36px;
  background: var(--neon-red);
  border: 2px solid white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
}

.profile-avatar-upload-btn:hover {
  transform: scale(1.1);
}

.profile-header h2 {
  color: var(--text-primary);
  font-size: 1.5rem;
  margin-bottom: 5px;
  font-weight: 700;
}

.profile-subtitle {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 10px;
}

.admin-badge {
  display: inline-block;
  padding: 6px 12px;
  background: rgba(255, 0, 51, 0.2);
  border: 2px solid var(--neon-red);
  border-radius: 20px;
  color: var(--neon-red);
  font-size: 0.85rem;
  font-weight: 700;
  margin-top: 10px;
}

.profile-info {
  padding-top: 0;
}

.profile-section {
  margin-bottom: 30px;
}

.profile-section-title {
  color: var(--neon-red);
  font-size: 1.2rem;
  margin-bottom: 20px;
  font-weight: 700;
}

.orders-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.order-item {
  padding: 15px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
}

.order-item:hover {
  border-color: var(--neon-red);
  background: rgba(255, 0, 51, 0.1);
}

.order-item p {
  margin-bottom: 8px;
  color: var(--text-primary);
}

.order-item strong {
  color: var(--neon-red);
}

.empty-orders {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.profile-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 30px;
}

.profile-logout-btn,
.profile-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.profile-logout-btn {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  border: 2px solid var(--border-color);
}

.profile-logout-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--neon-red);
}

.profile-delete-btn {
  background: rgba(255, 0, 51, 0.1);
  color: var(--neon-red);
  border: 2px solid var(--neon-red);
}

.profile-delete-btn:hover {
  background: rgba(255, 0, 51, 0.2);
  box-shadow: 0 0 15px rgba(255, 0, 51, 0.3);
}

.email-change-note {
  padding: 15px;
  background: rgba(0, 153, 255, 0.1);
  border: 2px solid var(--neon-blue);
  border-radius: 10px;
  margin-top: 10px;
  margin-bottom: 15px;
}

.email-change-note p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 10px;
}

.profile-cancel-btn {
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.profile-cancel-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--neon-red);
}
</style>

