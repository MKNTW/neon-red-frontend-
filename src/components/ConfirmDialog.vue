<template>
  <Modal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    content-class="confirm-dialog-content"
  >
    <div class="confirm-dialog">
      <div class="confirm-icon">{{ icon }}</div>
      <h3 class="confirm-title">{{ title }}</h3>
      <p class="confirm-message">{{ message }}</p>
      <div class="confirm-actions">
        <button @click="handleCancel" class="confirm-btn cancel-btn">
          {{ cancelText }}
        </button>
        <button @click="handleConfirm" class="confirm-btn confirm-btn-primary" :disabled="loading">
          {{ loading ? loadingText : confirmText }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Подтверждение'
  },
  message: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: '⚠️'
  },
  confirmText: {
    type: String,
    default: 'Подтвердить'
  },
  cancelText: {
    type: String,
    default: 'Отмена'
  },
  loading: {
    type: Boolean,
    default: false
  },
  loadingText: {
    type: String,
    default: 'Обработка...'
  }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.confirm-dialog-content {
  max-width: 400px;
}

.confirm-dialog {
  text-align: center;
  padding: 20px;
}

.confirm-icon {
  font-size: 3rem;
  margin-bottom: 20px;
}

.confirm-title {
  color: var(--neon-red);
  font-size: 1.5rem;
  font-weight: 900;
  margin-bottom: 15px;
  text-shadow: 0 0 10px rgba(255, 0, 51, 0.5);
}

.confirm-message {
  color: var(--text-primary);
  font-size: 1rem;
  margin-bottom: 30px;
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  gap: 12px;
}

.confirm-btn {
  flex: 1;
  padding: 14px 24px;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
  font-family: inherit;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  border: 2px solid var(--border-color);
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--neon-red);
}

.confirm-btn-primary {
  background: var(--neon-red);
  color: white;
}

.confirm-btn-primary:hover:not(:disabled) {
  background: var(--neon-pink);
  box-shadow: 0 0 20px rgba(255, 0, 51, 0.5);
}

.confirm-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

