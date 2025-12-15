<template>
  <Modal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    content-class="input-dialog-content"
  >
    <div class="input-dialog">
      <h3 class="input-dialog-title">{{ title }}</h3>
      <p v-if="message" class="input-dialog-message">{{ message }}</p>
      <div class="input-group">
        <label v-if="label" :for="inputId">{{ label }}</label>
        <input
          :id="inputId"
          v-model="inputValue"
          :type="type"
          :placeholder="placeholder"
          :required="required"
          class="input-dialog-input"
          @keyup.enter="handleConfirm"
        />
        <div v-if="error" class="input-error">{{ error }}</div>
      </div>
      <div class="input-dialog-actions">
        <button @click="handleCancel" class="input-dialog-btn cancel-btn">
          {{ cancelText }}
        </button>
        <button @click="handleConfirm" class="input-dialog-btn confirm-btn" :disabled="loading || !inputValue.trim()">
          {{ loading ? loadingText : confirmText }}
        </button>
      </div>
    </div>
  </Modal>
</template>

<script setup>
import { ref, watch } from 'vue'
import Modal from './Modal.vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Введите данные'
  },
  message: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: 'text'
  },
  required: {
    type: Boolean,
    default: true
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

const inputValue = ref('')
const error = ref('')
const inputId = `input-dialog-${Math.random().toString(36).substr(2, 9)}`

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    inputValue.value = ''
    error.value = ''
  }
})

function handleConfirm() {
  if (props.required && !inputValue.value.trim()) {
    error.value = 'Поле обязательно для заполнения'
    return
  }
  emit('confirm', inputValue.value.trim())
}

function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.input-dialog-content {
  max-width: 450px;
}

.input-dialog {
  padding: 20px;
}

.input-dialog-title {
  color: var(--neon-red);
  font-size: 1.5rem;
  font-weight: 900;
  margin-bottom: 15px;
  text-align: center;
  text-shadow: 0 0 10px rgba(255, 0, 51, 0.5);
}

.input-dialog-message {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 20px;
  text-align: center;
}

.input-group {
  margin-bottom: 25px;
}

.input-group label {
  display: block;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.input-dialog-input {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 1rem;
  font-family: inherit;
  transition: all 0.3s;
}

.input-dialog-input:focus {
  outline: none;
  border-color: var(--neon-red);
  box-shadow: 0 0 15px rgba(255, 0, 51, 0.3);
}

.input-error {
  color: var(--neon-red);
  font-size: 0.85rem;
  margin-top: 8px;
}

.input-dialog-actions {
  display: flex;
  gap: 12px;
}

.input-dialog-btn {
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

.confirm-btn {
  background: var(--neon-red);
  color: white;
}

.confirm-btn:hover:not(:disabled) {
  background: var(--neon-pink);
  box-shadow: 0 0 20px rgba(255, 0, 51, 0.5);
}

.confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

