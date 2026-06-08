<template>
  <div class="wm-mobile-sheet wm-char-bind-sheet-wrapper" @click.self="emit('close')">
    <div class="wm-mobile-sheet-content wm-char-bind-sheet">
      <header class="wm-mobile-sheet-header">
        <h3>绑定角色卡 · {{ bookNames.length }} 本</h3>
        <div class="menu_button interactable wm-btn wm-btn-icon" @click="emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </div>
      </header>

      <div class="wm-mobile-sheet-body wm-char-bind-body">
        <div class="wm-char-bind-books">
          <span class="wm-char-bind-books-label">已选</span>
          <div class="wm-char-bind-book-chips">
            <span v-for="name in bookNames" :key="name" class="wm-char-bind-book-chip" :title="name">{{
              name
            }}</span>
          </div>
        </div>

        <section class="wm-char-bind-block">
          <div class="wm-char-bind-block-title">绑定到</div>
          <div class="wm-char-bind-mode-grid">
            <div
              role="button"
              tabindex="0"
              class="wm-char-bind-mode-btn"
              :class="{ active: mode === 'primary' }"
              @click="mode = 'primary'"
              @keydown.enter.prevent="mode = 'primary'"
              @keydown.space.prevent="mode = 'primary'"
            >
              <i class="fa-solid fa-book"></i>
              <span class="wm-char-bind-mode-name">角色世界书</span>
              <span class="wm-char-bind-mode-desc">主世界书</span>
            </div>
            <div
              role="button"
              tabindex="0"
              class="wm-char-bind-mode-btn"
              :class="{ active: mode === 'additional' }"
              @click="mode = 'additional'"
              @keydown.enter.prevent="mode = 'additional'"
              @keydown.space.prevent="mode = 'additional'"
            >
              <i class="fa-solid fa-layer-group"></i>
              <span class="wm-char-bind-mode-name">角色世界书</span>
              <span class="wm-char-bind-mode-desc">附加</span>
            </div>
            <div
              role="button"
              tabindex="0"
              class="wm-char-bind-mode-btn"
              :class="{ active: mode === 'chat' }"
              @click="mode = 'chat'"
              @keydown.enter.prevent="mode = 'chat'"
              @keydown.space.prevent="mode = 'chat'"
            >
              <i class="fa-solid fa-comments"></i>
              <span class="wm-char-bind-mode-name">聊天世界书</span>
              <span class="wm-char-bind-mode-desc">当前聊天</span>
            </div>
          </div>
          <p v-if="mode === 'primary' && bookNames.length > 1" class="wm-char-bind-tip">
            多本时以最后一本作为主世界书。
          </p>
          <p v-else-if="mode === 'chat'" class="wm-char-bind-tip">
            仅作用于当前打开的聊天；解绑也只影响当前聊天。
          </p>
        </section>

        <section v-if="mode !== 'chat'" class="wm-char-bind-block wm-char-bind-block--chars">
          <div class="wm-char-bind-block-head">
            <div class="wm-char-bind-block-title">
              选择角色卡
              <span v-if="selectedChars.length" class="wm-char-bind-count">已选 {{ selectedChars.length }}</span>
            </div>
            <div
              role="button"
              tabindex="0"
              class="wm-char-bind-text-btn"
              @click="toggleAllChars"
              @keydown.enter.prevent="toggleAllChars"
              @keydown.space.prevent="toggleAllChars"
            >
              {{ allCharsSelected ? '取消全选' : '全选' }}
            </div>
          </div>
          <div class="wm-char-bind-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input v-model="charSearch" type="text" class="text_pole" placeholder="搜索角色卡…" />
          </div>
          <div v-if="loadingChars" class="wm-char-bind-placeholder">加载角色卡列表…</div>
          <div v-else-if="charNames.length === 0" class="wm-char-bind-placeholder">未找到角色卡</div>
          <div v-else-if="filteredCharNames.length === 0" class="wm-char-bind-placeholder">无匹配角色卡</div>
          <div v-else class="wm-char-bind-char-grid">
            <div
              v-for="name in filteredCharNames"
              :key="name"
              role="button"
              tabindex="0"
              class="wm-char-bind-char-card"
              :class="{ selected: selectedChars.includes(name) }"
              @click="toggleChar(name)"
              @keydown.enter.prevent="toggleChar(name)"
              @keydown.space.prevent="toggleChar(name)"
            >
              <span class="wm-char-bind-char-check">
                <i v-if="selectedChars.includes(name)" class="fa-solid fa-check"></i>
              </span>
              <span class="wm-char-bind-char-name">{{ name }}</span>
              <span v-if="charBindHint(name)" class="wm-char-bind-char-badge">{{ charBindHint(name) }}</span>
            </div>
          </div>
        </section>

        <div v-if="resultLines.length" class="wm-char-bind-result">
          <p
            v-for="(line, i) in resultLines"
            :key="'r-' + i"
            :class="{
              'wm-char-bind-result--ok': line.kind === 'ok',
              'wm-char-bind-result--err': line.kind === 'err',
            }"
          >
            {{ line.text }}
          </p>
        </div>
      </div>

      <footer class="wm-mobile-sheet-footer wm-char-bind-footer">
        <div
          class="menu_button interactable wm-btn"
          :class="{ disabled: applying || !canApply }"
          @click="void runBind('unbind')"
        >
          解绑
        </div>
        <div
          class="menu_button interactable wm-btn wm-btn-primary"
          :class="{ disabled: applying || !canApply }"
          style="flex: 1"
          @click="void runBind('bind')"
        >
          {{ applying ? '处理中…' : '绑定' }}
        </div>
        <div class="menu_button interactable wm-btn" @click="emit('close')">关闭</div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { CharBindAction, CharBindMode } from './lib/book-char-bind';
import { applyCharBookBinding, previewCharBindState } from './lib/book-char-bind';
import { safeCharacterNamesAsync } from './lib/tavern-safe';

const props = defineProps<{
  bookNames: string[];
}>();

const emit = defineEmits<{
  close: [];
  applied: [];
}>();

const mode = ref<CharBindMode>('additional');
const charNames = ref<string[]>([]);
const selectedChars = ref<string[]>([]);
const charSearch = ref('');
const loadingChars = ref(true);
const applying = ref(false);
const resultLines = ref<{ kind: 'ok' | 'err'; text: string }[]>([]);
const bindPreview = ref<{ charName: string; primary: string | null; additional: string[] }[]>([]);

const filteredCharNames = computed(() => {
  const q = charSearch.value.trim().toLowerCase();
  if (!q) return charNames.value;
  return charNames.value.filter(n => n.toLowerCase().includes(q));
});

const allCharsSelected = computed(
  () => charNames.value.length > 0 && selectedChars.value.length === charNames.value.length,
);

const canApply = computed(() => {
  if (props.bookNames.length === 0) return false;
  if (mode.value === 'chat') return true;
  return selectedChars.value.length > 0;
});

function charBindHint(name: string): string {
  const row = bindPreview.value.find(r => r.charName === name);
  if (!row) return '';
  const parts: string[] = [];
  if (row.primary && props.bookNames.includes(row.primary)) parts.push('主');
  const addHits = row.additional.filter(b => props.bookNames.includes(b));
  if (addHits.length) parts.push(`附×${addHits.length}`);
  return parts.length ? parts.join('+') : '';
}

function toggleChar(name: string) {
  if (selectedChars.value.includes(name)) {
    selectedChars.value = selectedChars.value.filter(n => n !== name);
  } else {
    selectedChars.value = [...selectedChars.value, name];
  }
}

async function loadChars() {
  loadingChars.value = true;
  try {
    charNames.value = await safeCharacterNamesAsync();
    selectedChars.value = [];
    bindPreview.value = await previewCharBindState(props.bookNames, charNames.value);
  } finally {
    loadingChars.value = false;
  }
}

function toggleAllChars() {
  selectedChars.value = allCharsSelected.value ? [] : [...charNames.value];
}

async function runBind(action: CharBindAction) {
  if (!canApply.value || applying.value) return;
  applying.value = true;
  resultLines.value = [];
  try {
    const result = await applyCharBookBinding({
      bookNames: props.bookNames,
      charNames: selectedChars.value,
      mode: mode.value,
      action,
    });
    result.ok.forEach(text => resultLines.value.push({ kind: 'ok', text }));
    result.errors.forEach(text => resultLines.value.push({ kind: 'err', text }));
    if (result.ok.length) {
      bindPreview.value = await previewCharBindState(
        props.bookNames,
        mode.value === 'chat' ? charNames.value : selectedChars.value,
      );
      emit('applied');
    }
  } catch (e) {
    resultLines.value.push({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
  } finally {
    applying.value = false;
  }
}

watch(
  () => props.bookNames.slice().sort().join('\0'),
  () => void loadChars(),
);

watch(selectedChars, async (names, prev) => {
  if (names.length === 0) return;
  if (prev && names.length === prev.length && names.every((n, i) => n === prev[i])) return;
  bindPreview.value = await previewCharBindState(props.bookNames, names);
});

onMounted(() => void loadChars());
</script>

<style scoped lang="scss">
.wm-char-bind-body {
  padding-top: 12px !important;
}

.wm-char-bind-books {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--wm-surface-dim);
  border: 1px solid var(--wm-border);
}

.wm-char-bind-books-label {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--wm-muted);
  padding-top: 2px;
}

.wm-char-bind-book-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.wm-char-bind-book-chip {
  max-width: 100%;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  background: var(--wm-primary-soft);
  color: var(--wm-text);
  border: 1px solid color-mix(in srgb, var(--wm-primary) 35%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wm-char-bind-block {
  margin-bottom: 16px;
}

.wm-char-bind-block--chars {
  margin-bottom: 8px;
}

.wm-char-bind-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.wm-char-bind-block-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--wm-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.wm-char-bind-count {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--wm-primary-soft);
  color: var(--wm-primary);
}

.wm-char-bind-text-btn {
  flex-shrink: 0;
  user-select: none;
}

.wm-char-bind-mode-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.wm-char-bind-mode-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;

  i {
    font-size: 14px;
    opacity: 0.9;
  }
}

.wm-char-bind-mode-name {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.wm-char-bind-mode-desc {
  font-size: 10px;
  opacity: 0.75;
  line-height: 1.2;
}

.wm-char-bind-tip {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--wm-muted);
}

.wm-char-bind-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--wm-border);
  background: var(--wm-item-bg);

  i {
    font-size: 12px;
    color: var(--wm-muted);
    flex-shrink: 0;
  }

  input {
    flex: 1;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 8px 0 !important;
    min-width: 0;
  }
}

.wm-char-bind-char-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  max-height: min(42vh, 320px);
  overflow-y: auto;
  padding: 2px;
}

.wm-char-bind-char-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 10px 10px 8px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  min-height: 52px;
  position: relative;
  user-select: none;
  transition:
    border-color 0.15s,
    background 0.15s;

  &:focus-visible {
    outline: 2px solid var(--wm-primary);
    outline-offset: 1px;
  }
}

.wm-char-bind-char-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--wm-char-card-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.wm-char-bind-char-name {
  font-size: 12px;
  line-height: 1.35;
  padding-right: 22px;
  word-break: break-all;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.wm-char-bind-char-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
}

.wm-char-bind-placeholder {
  font-size: 13px;
  color: var(--wm-muted);
  padding: 24px 8px;
  text-align: center;
}

.wm-char-bind-result {
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--wm-surface-dim);
  border: 1px solid var(--wm-border);
  font-size: 12px;
  line-height: 1.5;
}

.wm-char-bind-result--ok {
  color: var(--wm-primary);
}

.wm-char-bind-result--err {
  color: var(--wm-danger, #e57373);
}

.wm-char-bind-footer {
  gap: 8px !important;
}

@media (max-width: 420px) {
  .wm-char-bind-mode-grid {
    grid-template-columns: 1fr;
  }

  .wm-char-bind-char-grid {
    grid-template-columns: 1fr;
  }
}
</style>
