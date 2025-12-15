<template>
  <div class="step-indicator">
    <div
      v-for="step in totalSteps"
      :key="step"
      class="step-item"
    >
      <div
        :class="[
          'step-number',
          {
            'active': step === currentStep,
            'completed': step < currentStep
          }
        ]"
      >
        {{ step < currentStep ? '✓' : step }}
      </div>
      <div
        v-if="step < totalSteps"
        :class="[
          'step-line',
          {
            'completed': step < currentStep
          }
        ]"
      />
    </div>
  </div>
</template>

<script setup>
defineProps({
  currentStep: {
    type: Number,
    required: true
  },
  totalSteps: {
    type: Number,
    required: true
  }
})
</script>

<style scoped>
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30px;
  gap: 8px;
  margin-top: 20px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid var(--border-color);
  color: var(--text-secondary);
  transition: all 0.3s;
}

.step-number.active {
  background: var(--neon-red);
  border-color: var(--neon-red);
  color: white;
  box-shadow: 0 0 15px rgba(255, 0, 51, 0.5);
}

.step-number.completed {
  background: var(--neon-green);
  border-color: var(--neon-green);
  color: white;
}

.step-line {
  width: 30px;
  height: 2px;
  background: var(--border-color);
  transition: all 0.3s;
}

.step-line.completed {
  background: var(--neon-green);
}
</style>

