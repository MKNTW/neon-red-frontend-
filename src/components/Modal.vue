<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="modal-overlay"
        @click.self="handleOverlayClick"
        role="dialog"
        :aria-hidden="!modelValue"
        :aria-labelledby="titleId"
      >
        <div ref="modalContent" class="modal-content" :class="contentClass">
          <button
            v-if="showClose"
            @click="close"
            class="close"
            aria-label="Закрыть"
          >
            ×
          </button>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  showClose: {
    type: Boolean,
    default: true
  },
  closeOnOverlay: {
    type: Boolean,
    default: true
  },
  contentClass: {
    type: String,
    default: ''
  },
  titleId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'close'])

const modalContent = ref(null)

function close() {
  emit('update:modelValue', false)
  emit('close')
}

function handleOverlayClick() {
  if (props.closeOnOverlay) {
    close()
  }
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden'
    nextTick(() => {
      // Используем template ref вместо document.querySelector
      const firstInput = modalContent.value?.querySelector('input, textarea, button')
      if (firstInput && typeof firstInput.focus === 'function') {
        firstInput.focus()
      }
    })
  } else {
    document.body.style.overflow = ''
  }
})

// Очистка при размонтировании
onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  overflow-y: auto;
}

.modal-content {
  background: var(--card-bg);
  border: 3px solid var(--neon-red);
  border-radius: 16px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 0 40px rgba(255, 0, 51, 0.5);
}

@media (max-width: 768px) {
  .modal-content {
    border-radius: 12px;
  }
}

.close {
  position: absolute;
  top: 15px;
  right: 15px;
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  border-radius: 50%;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
}

.close:hover {
  background: var(--neon-red);
  transform: rotate(90deg);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9) translateY(-20px);
  opacity: 0;
}
</style>

