<template>
  <div class="wm-color-input-wrap">
    <input
      type="color"
      :value="pickerValue"
      class="wm-color-input"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <input
      type="text"
      :value="modelValue"
      class="text_pole wm-hex-input"
      :placeholder="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { colorPickerValue } from './lib/theme-vars';

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  pickerFallback?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const pickerValue = computed(() => colorPickerValue(props.modelValue, props.pickerFallback ?? '#888888'));
</script>

<style scoped>
.wm-color-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.wm-color-input {
  width: 40px;
  height: 32px;
  border: 1px solid var(--wm-border);
  border-radius: 4px;
  background: none;
  cursor: pointer;
  padding: 0;
}
.wm-hex-input {
  width: 108px;
  text-align: center;
  font-family: monospace;
  font-size: 0.78rem;
}
</style>
