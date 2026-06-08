<template>
  <div class="wm-mobile-sheet" @click.self="emit('close')">
    <div class="wm-mobile-sheet-content wm-theme-custom-sheet">
      <header class="wm-mobile-sheet-header">
        <h3>🎨 自定义主题配色</h3>
        <div class="menu_button interactable wm-btn wm-btn-icon" @click="emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </div>
      </header>

      <div class="wm-mobile-sheet-body">
        <div class="wm-theme-mode-toggle">
          <div
            class="menu_button interactable wm-btn wm-theme-mode-btn"
            :class="{ 'wm-theme-mode-btn--active': !isLight }"
            @click="emit('update:isLight', false)"
          >
            <i class="fa-solid fa-moon"></i> 夜间
          </div>
          <div
            class="menu_button interactable wm-btn wm-theme-mode-btn"
            :class="{ 'wm-theme-mode-btn--active': isLight }"
            @click="emit('update:isLight', true)"
          >
            <i class="fa-solid fa-sun"></i> 日间
          </div>
        </div>

        <p class="wm-theme-hint">
          正在配置 <strong>{{ isLight ? '日间模式 ☀️' : '夜间模式 🌙' }}</strong> 配色，调节时界面实时预览。
        </p>

        <div class="wm-theme-pickers">
          <div v-for="field in THEME_BASIC_FIELDS" :key="field.key" class="wm-color-picker-item">
            <div class="wm-color-label-wrap">
              <span class="wm-color-label">{{ field.label }}</span>
              <span class="wm-color-hint">{{ field.hint }}</span>
            </div>
            <ThemeColorInput
              :model-value="colorValue(field.key)"
              :placeholder="fieldPlaceholder(field)"
              :picker-fallback="field.pickerFallback ?? fieldPlaceholder(field)"
              @update:model-value="updateColor(field.key, $event)"
            />
          </div>
        </div>

        <details class="wm-theme-advanced">
          <summary>更多配色（条目名、次要文字、卡片底色…）</summary>
          <div class="wm-theme-pickers wm-theme-pickers--advanced">
            <div v-for="field in THEME_ADVANCED_FIELDS" :key="field.key" class="wm-color-picker-item">
              <div class="wm-color-label-wrap">
                <span class="wm-color-label">{{ field.label }}</span>
                <span class="wm-color-hint">{{ field.hint }}</span>
              </div>
              <ThemeColorInput
                :model-value="colorValue(field.key)"
                :placeholder="fieldPlaceholder(field)"
                :picker-fallback="field.pickerFallback ?? fieldPlaceholder(field)"
                @update:model-value="updateColor(field.key, $event)"
              />
            </div>
          </div>
        </details>

        <div class="wm-theme-presets-section">
          <div class="wm-theme-presets-head">
            <h4>已有预设</h4>
            <div
              class="menu_button interactable wm-btn wm-btn-sm wm-preset-save-btn"
              title="将当前配色保存为新预设"
              @click="saveCurrentAsPreset"
            >
              <i class="fa-solid fa-plus"></i> 保存当前
            </div>
          </div>
          <div class="wm-presets-list">
            <div v-for="p in visiblePresets" :key="p.id" class="wm-preset-swatch-wrap">
              <div
                role="button"
                tabindex="0"
                class="wm-preset-swatch"
                :style="presetSwatchStyle(p)"
                :aria-label="`配色预设`"
                @click="applyPreset(p)"
                @keydown.enter.space.prevent="applyPreset(p)"
              >
                <span class="wm-preset-swatch-ring">
                  <span class="wm-preset-swatch-dot"></span>
                </span>
              </div>
              <div
                v-if="!p.builtin"
                class="menu_button interactable wm-preset-delete"
                title="删除此预设"
                @click.stop="deletePreset(p.id)"
              >
                <i class="fa-solid fa-xmark"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer class="wm-mobile-sheet-footer">
        <div class="menu_button interactable wm-btn" style="flex: 1" @click="resetToDefault">恢复默认</div>
        <div class="menu_button interactable wm-btn wm-btn-primary" style="flex: 1" @click="emit('close')">完成</div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import toastr from 'toastr';
import { listPresetsForMode, presetSwatchStyle, type PresetListItem } from './lib/theme-presets';
import {
  mergeThemeColors,
  THEME_ADVANCED_FIELDS,
  THEME_BASIC_FIELDS,
  type ThemeColorField,
} from './lib/theme-vars';
import ThemeColorInput from './ThemeColorInput.vue';
import type { CustomThemeColors, ThemePreset } from './schema';

const props = defineProps<{
  isLight: boolean;
  customTheme: Record<string, unknown>;
  themePresets: ThemePreset[];
}>();

const emit = defineEmits<{
  close: [];
  'update:customTheme': [data: Record<string, unknown>];
  'update:themePresets': [presets: ThemePreset[]];
  'update:isLight': [light: boolean];
}>();

const modeKey = computed(() => (props.isLight ? 'light' : 'dark'));

const colors = computed(() =>
  mergeThemeColors(props.isLight, (props.customTheme[modeKey.value] ?? {}) as CustomThemeColors),
);

const visiblePresets = computed(() => listPresetsForMode(modeKey.value, props.themePresets ?? []));

function colorValue(key: keyof CustomThemeColors): string {
  return colors.value[key] ?? '';
}

function fieldPlaceholder(field: ThemeColorField): string {
  const ph = field.placeholder;
  if (!ph) return '';
  return props.isLight ? ph.light : ph.dark;
}

function updateColor(key: keyof CustomThemeColors, value: string) {
  const stored = { ...((props.customTheme[modeKey.value] ?? {}) as CustomThemeColors) };
  const defaults = mergeThemeColors(props.isLight, {});
  if (value.trim() === defaults[key]) {
    delete stored[key];
  } else {
    stored[key] = value;
  }
  emit('update:customTheme', {
    ...props.customTheme,
    [modeKey.value]: stored,
  });
}

function applyPreset(p: PresetListItem) {
  emit('update:customTheme', {
    ...props.customTheme,
    [modeKey.value]: {
      primary: p.primary,
      bg: p.bg,
      text: p.text,
      border: p.border,
      highlight: p.highlight,
      title: p.title,
      muted: p.muted,
      itemBg: p.itemBg,
      danger: p.danger,
      globalAccent: p.globalAccent,
      globalAccentText: p.globalAccentText,
    },
  });
}

function saveCurrentAsPreset() {
  const c = colors.value;
  const preset: ThemePreset = {
    id: `user-${Date.now()}`,
    mode: modeKey.value,
    primary: c.primary!,
    bg: c.bg!,
    text: c.text!,
    border: c.border!,
    highlight: c.highlight,
    title: c.title,
    muted: c.muted,
    itemBg: c.itemBg,
    danger: c.danger,
    globalAccent: c.globalAccent,
    globalAccentText: c.globalAccentText,
  };
  emit('update:themePresets', [...(props.themePresets ?? []), preset]);
  toastr.success('已保存为预设');
}

function deletePreset(id: string) {
  emit('update:themePresets', (props.themePresets ?? []).filter(p => p.id !== id));
}

function resetToDefault() {
  emit('update:customTheme', {
    ...props.customTheme,
    [modeKey.value]: {},
  });
}
</script>

<style scoped>
.wm-theme-mode-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.wm-theme-mode-btn {
  flex: 1;
  justify-content: center;
  min-height: 36px;
  opacity: 0.75;
}
.wm-theme-mode-btn--active {
  opacity: 1;
  border-color: var(--wm-primary) !important;
  box-shadow: 0 0 0 1px var(--wm-primary);
}
.wm-theme-hint {
  color: var(--wm-muted);
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 16px;
  background: var(--wm-surface-dim);
  padding: 10px 14px;
  border-radius: 6px;
  border-left: 3px solid var(--wm-primary);
}
.wm-theme-pickers {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.wm-theme-pickers--advanced {
  margin-top: 12px;
}
.wm-color-picker-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.wm-color-label-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.wm-color-label {
  font-weight: bold;
  font-size: 14px;
  color: var(--wm-text);
}
.wm-color-hint {
  font-size: 0.72rem;
  color: var(--wm-muted);
  line-height: 1.35;
}
.wm-theme-advanced {
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px dashed var(--wm-border);
  border-radius: 8px;
  background: var(--wm-surface-dim);
}
.wm-theme-advanced summary {
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--wm-text);
  user-select: none;
}
.wm-theme-presets-section {
  margin-top: 20px;
  border-top: 1px dashed var(--wm-border);
  padding-top: 16px;
}
.wm-theme-presets-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.wm-theme-presets-head h4 {
  font-size: 14px;
  font-weight: bold;
  margin: 0;
  color: var(--wm-text);
}
.wm-preset-save-btn {
  font-size: 0.78rem;
  min-height: 30px;
  padding: 0 10px;
  white-space: nowrap;
}
</style>
