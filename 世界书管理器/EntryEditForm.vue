<template>
  <div
    class="wm-entry-edit-native"
    :class="{ 'wm-entry-edit-native--mobile': mobile, 'wm-entry-edit-native--body-only': hideActions }"
    @click.stop
  >
    <div class="wm-edit-compact-grid">
      <section class="wm-edit-section wm-edit-section--basic">
        <div class="wm-edit-section-title">基础</div>
        <div class="wm-edit-row wm-edit-row--basic">
          <label class="wm-edit-field wm-edit-field--title">
            <span class="wm-edit-label">标题 / Memo</span>
            <input v-model="draft.name" type="text" class="text_pole" />
          </label>
          <label class="wm-edit-field wm-edit-field--check">
            <input v-model="draft.enabled" type="checkbox" />
            <span>启用</span>
          </label>
        </div>
      </section>

      <section class="wm-edit-section wm-edit-section--activation">
        <div class="wm-edit-section-title">激活</div>
        <div class="wm-edit-row">
          <label class="wm-edit-field wm-edit-field--strategy">
            <span class="wm-edit-label">策略</span>
            <select v-model="draft.strategyType" class="text_pole">
              <option value="constant">🔵 蓝灯 · 常量</option>
              <option value="selective">🟢 绿灯 · 可选</option>
              <option value="vectorized">🔗 向量化</option>
            </select>
          </label>
          <label class="wm-edit-field wm-edit-field--narrow">
            <span class="wm-edit-label">触发%</span>
            <input v-model.number="draft.probability" type="number" min="0" max="100" class="text_pole" />
          </label>
        </div>
      </section>

      <section class="wm-edit-section wm-edit-section--position">
        <div class="wm-edit-section-title">插入位置</div>
        <div class="wm-edit-row wm-edit-row--position">
          <label class="wm-edit-field">
            <span class="wm-edit-label">位置</span>
            <select v-model="draft.positionType" class="text_pole">
              <option v-for="opt in POSITION_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
          <label v-if="draft.positionType === 'at_depth'" class="wm-edit-field">
            <span class="wm-edit-label">身份</span>
            <select v-model="draft.positionRole" class="text_pole">
              <option value="system">system</option>
              <option value="assistant">assistant</option>
              <option value="user">user</option>
            </select>
          </label>
          <label class="wm-edit-field">
            <span class="wm-edit-label">{{ draft.positionType === 'at_depth' ? '深度' : '扫描深度' }}</span>
            <input
              v-if="draft.positionType === 'at_depth'"
              v-model.number="draft.positionDepth"
              type="number"
              min="0"
              class="text_pole"
            />
            <select v-else v-model="draft.scanDepth" class="text_pole">
              <option value="same_as_global">同全局</option>
              <option v-for="n in scanDepthOptions" :key="n" :value="String(n)">{{ n }} 楼</option>
            </select>
          </label>
          <label class="wm-edit-field wm-edit-field--narrow">
            <span class="wm-edit-label">顺序</span>
            <input v-model.number="draft.positionOrder" type="number" class="text_pole" />
          </label>
        </div>
      </section>

      <section class="wm-edit-section wm-edit-section--keys">
        <div class="wm-edit-section-title">关键字</div>
        <label class="wm-edit-field wm-edit-field--content">
          <span class="wm-edit-label">Primary（逗号分隔）</span>
          <textarea v-model="draft.keysText" class="text_pole" rows="1" placeholder="keyword1, keyword2"></textarea>
        </label>
        <template v-if="draft.strategyType === 'selective'">
          <div class="wm-edit-row wm-edit-row--keys-secondary">
            <label class="wm-edit-field wm-edit-field--logic">
              <span class="wm-edit-label">次要逻辑</span>
              <select v-model="draft.keysSecondaryLogic" class="text_pole">
                <option v-for="opt in SECONDARY_LOGIC_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </label>
            <label class="wm-edit-field wm-edit-field--grow">
              <span class="wm-edit-label">可选过滤器</span>
              <input
                v-model="draft.keysSecondaryText"
                type="text"
                class="text_pole"
                placeholder="逗号分隔，留空忽略"
              />
            </label>
          </div>
        </template>
      </section>

      <section class="wm-edit-section wm-edit-section--recursion">
        <div class="wm-edit-section-title">递归</div>
        <div class="wm-edit-row wm-edit-row--checks">
          <label class="wm-check-label wm-check-label--compact">
            <input v-model="draft.preventIncoming" type="checkbox" />
            <span>不可递归</span>
          </label>
          <label class="wm-check-label wm-check-label--compact">
            <input v-model="draft.preventOutgoing" type="checkbox" />
            <span>防止进一步递归</span>
          </label>
        </div>
      </section>

      <section class="wm-edit-section wm-edit-section--content" :class="{ 'wm-expanded-fullscreen': isExpanded }">
        <div class="wm-edit-section-title" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span>内容</span>
          <button
            type="button"
            class="menu_button interactable wm-btn"
            style="font-size: 0.72rem; padding: 2px 8px; min-height: 22px; height: 22px; margin: 0; line-height: 1; display: inline-flex; align-items: center; gap: 4px;"
            @click="isExpanded = !isExpanded"
          >
            <i class="fa-solid" :class="isExpanded ? 'fa-compress' : 'fa-expand'"></i>
            <span>{{ isExpanded ? '退出全屏' : '全屏编辑' }}</span>
          </button>
        </div>
        <label class="wm-edit-field wm-edit-field--content">
          <textarea v-model="draft.content" class="text_pole wm-entry-content-area" rows="6"></textarea>
        </label>
      </section>

      <!-- EJS / 提示词模板检测 -->
      <section v-if="showEjsPanel" class="wm-edit-section wm-edit-section--ejs">
        <div class="wm-edit-section-title">
          <i class="fa-solid fa-code"></i> 提示词模板 (EJS)
        </div>
        <p class="wm-ejs-hint">
          含 EJS 的条目按变量分阶段发送；可选阶段 mock 预览。tk 为 tokenizer 计数，不等于实际注入。
        </p>
        <div class="wm-ejs-token-row">
          <span class="wm-token-stat" :class="{ 'wm-token-stat--err': draftEjsOk === false }">
            原文 {{ formatTokenCount(draftTokenRaw) }} tk<span v-if="draftEjsOk === false"> !</span>
          </span>
          <template v-if="hasEjsInDraft && draftTokenEffective != null">
            <span class="wm-entry-meta-sep">→</span>
            <span class="wm-token-stat" :class="{ 'wm-token-stat--err': draftEjsOk === false }">
              {{ previewModeLabel }} {{ formatTokenCount(draftTokenEffective) }} tk<span v-if="draftEjsOk === false"> !</span>
            </span>
          </template>
        </div>
        <div v-if="draftStages.length > 1" class="wm-ejs-stage-chips">
          <span class="wm-ejs-stage-label">模拟阶段：</span>
          <label class="wm-stage-chip" :class="{ active: previewMode === 'chat' }">
            <input v-model="previewMode" type="radio" value="chat" />
            当前聊天
          </label>
          <label
            v-for="s in draftStages"
            :key="s.id"
            class="wm-stage-chip"
            :class="{ active: previewMode === s.id }"
          >
            <input v-model="previewMode" type="radio" :value="s.id" />
            {{ s.label }}
          </label>
        </div>
        <p v-if="activeStage" class="wm-ejs-stage-cond" :title="formatStageMockHint(activeStage)">
          条件：{{ activeStage.condition }}
        </p>
        <div class="wm-edit-row wm-edit-row--ejs-actions">
          <div class="menu_button interactable wm-btn" :class="{ disabled: ejsChecking }" @click="runEjsSyntaxCheck">
            {{ ejsChecking ? '检查中…' : '检查语法' }}
          </div>
          <div class="menu_button interactable wm-btn wm-btn-primary" :class="{ disabled: ejsPreviewing }" @click="runEjsStagePreview">
            {{ ejsPreviewing ? '预览中…' : '预览发送内容' }}
          </div>
        </div>
        <div v-if="ejsSyntaxMessage" class="wm-ejs-result" :class="ejsSyntaxOk ? 'wm-ejs-result--ok' : 'wm-ejs-result--err'">
          {{ ejsSyntaxMessage }}
        </div>
        <div v-if="ejsPreviewOutput != null" class="wm-ejs-preview-box">
          <div class="wm-ejs-preview-head">{{ previewModeLabel }}将发送的正文（{{ formatTokenCount(draftTokenEffective) }} tk）</div>
          <pre class="wm-ejs-preview-body">{{ ejsPreviewOutput || '（空 — 此阶段不发送正文）' }}</pre>
        </div>
        <div v-if="ejsPreviewError" class="wm-ejs-result wm-ejs-result--err">{{ ejsPreviewError }}</div>
      </section>

      <!-- 单个条目查找与替换/批量删除工具 -->
      <section class="wm-edit-section wm-edit-section--find-replace">
        <div class="wm-edit-section-title">
          <i class="fa-solid fa-magnifying-glass"></i> 第一步：文本查找与高亮
        </div>
        <div class="wm-replace-box" style="background: var(--wm-surface-dim); padding: 12px; border-radius: 4px; border: 1px solid var(--wm-border); margin-bottom: 12px;">
          <div class="wm-edit-row" style="display: flex; gap: 10px; align-items: flex-end;">
            <label class="wm-edit-field" style="flex: 1; min-width: 150px;">
              <span class="wm-edit-label">要查找的词 (支持实时高亮)</span>
              <input v-model="findText" type="text" class="text_pole" placeholder="输入要搜索的字词..." />
            </label>
          </div>

          <!-- 仅查找时的内容高亮预览 -->
          <div v-if="findText" class="wm-find-preview-container" style="margin-top: 10px; border-top: 1px dashed var(--wm-border); padding-top: 8px;">
            <div class="wm-find-preview-header" style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--wm-muted); margin-bottom: 4px;">
              <span>🔍 实时查找高亮预览 (匹配到 <strong style="color: var(--wm-primary);">{{ matchCount }}</strong> 处)</span>
            </div>
            <div 
              class="wm-find-preview-body" 
              style="max-height: 150px; overflow-y: auto; padding: 8px; background: var(--wm-bg); border: 1px solid var(--wm-border); border-radius: 4px; font-size: 0.8rem; line-height: 1.4; white-space: pre-wrap; word-break: break-all;"
              v-html="highlightedContent"
            ></div>
          </div>
        </div>

        <div v-if="findText" class="wm-replace-section-step2">
          <div class="wm-edit-section-title">
            <i class="fa-solid fa-wand-magic-sparkles"></i> 第二步：执行替换或删除
          </div>
          <div class="wm-replace-box" style="background: var(--wm-surface-dim); padding: 12px; border-radius: 4px; border: 1px solid var(--wm-border);">
            <p style="font-size: 0.76rem; color: var(--wm-muted); margin: 0 0 8px;">
              将上面高亮的 <strong style="color: var(--wm-primary);">{{ matchCount }}</strong> 处「{{ findText }}」进行批量操作：
            </p>
            <div class="wm-edit-row" style="display: flex; gap: 10px; flex-wrap: wrap;">
              <label class="wm-edit-field" style="flex: 1; min-width: 150px;">
                <span class="wm-edit-label">替换为新文本</span>
                <input v-model="replaceText" type="text" class="text_pole" placeholder="输入替换后的词，留空代表删除" />
              </label>
            </div>
            <div class="wm-edit-row wm-find-replace-actions" style="margin-top: 10px; gap: 8px; display: flex;">
              <button
                type="button"
                class="menu_button interactable wm-btn wm-btn-primary"
                style="flex: 1; min-height: 28px; height: 28px; font-size: 0.78rem;"
                @click="doReplace"
              >
                替换高亮内容
              </button>
              <button
                type="button"
                class="menu_button interactable wm-btn wm-btn-danger"
                style="flex: 1; min-height: 28px; height: 28px; font-size: 0.78rem;"
                @click="doDeleteAll"
              >
                直接删除高亮内容
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="!hideActions" class="wm-entry-edit-actions">
      <div class="menu_button interactable wm-btn" @click="emit('cancel')">取消</div>
      <div class="menu_button interactable wm-btn wm-btn-primary" @click="emit('save')">保存</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  POSITION_OPTIONS,
  SECONDARY_LOGIC_OPTIONS,
  type EntryEditDraft,
} from './lib/entry-edit';
import {
  checkEjsSyntax,
  extractEjsStages,
  formatStageMockHint,
  hasEjsMarkers,
  renderEjsContent,
  renderEjsForStage,
  validateEjsEntry,
} from './lib/entry-ejs';
import { countTextTokens, formatTokenCount } from './lib/token-count';
import toastr from 'toastr';

const draft = defineModel<EntryEditDraft>('draft', { required: true });
const props = defineProps<{ mobile?: boolean; hideActions?: boolean; autosave?: () => void | Promise<void> }>();
const emit = defineEmits<{ save: []; cancel: [] }>();

const scanDepthOptions = [1, 2, 4, 8, 16, 32, 64, 128];
const isExpanded = ref(false);

const findText = ref('');
const replaceText = ref('');

const showEjsPanel = computed(() => hasEjsMarkers(draft.value.content ?? ''));
const hasEjsInDraft = computed(() => hasEjsMarkers(draft.value.content ?? ''));

const draftTokenRaw = ref<number | null>(null);
const draftTokenEffective = ref<number | null>(null);
const draftEjsOk = ref<boolean | null>(null);
const previewMode = ref<string>('chat');
const ejsChecking = ref(false);
const ejsPreviewing = ref(false);
const ejsSyntaxOk = ref(true);
const ejsSyntaxMessage = ref('');
const ejsPreviewOutput = ref<string | null>(null);
const ejsPreviewError = ref('');

let draftTokenTimer: ReturnType<typeof setTimeout> | null = null;

const draftStages = computed(() => extractEjsStages(draft.value.content ?? ''));
const activeStage = computed(() =>
  previewMode.value === 'chat' ? null : draftStages.value.find(s => s.id === previewMode.value) ?? draftStages.value[0],
);
const previewModeLabel = computed(() =>
  previewMode.value === 'chat' ? '当前聊天' : activeStage.value?.label ?? '阶段',
);

watch(
  () => draft.value.content,
  () => {
    ejsPreviewOutput.value = null;
    ejsPreviewError.value = '';
    previewMode.value = 'chat';
    if (draftTokenTimer) clearTimeout(draftTokenTimer);
    draftTokenTimer = setTimeout(() => void refreshDraftTokens(), 400);
  },
  { immediate: true },
);

watch(previewMode, () => {
  ejsPreviewOutput.value = null;
  void refreshDraftTokens();
});

async function refreshDraftTokens() {
  const content = draft.value.content ?? '';
  draftTokenRaw.value = await countTextTokens(content);
  if (!hasEjsMarkers(content)) {
    draftTokenEffective.value = draftTokenRaw.value;
    draftEjsOk.value = null;
    return;
  }
  const v = await validateEjsEntry(content);
  draftEjsOk.value = v.ok;

  let rendered;
  if (previewMode.value === 'chat') {
    rendered = await renderEjsContent(content);
  } else {
    const stage = activeStage.value ?? draftStages.value[0];
    rendered = stage ? await renderEjsForStage(content, stage) : await renderEjsContent(content);
  }
  if (rendered.ok) {
    draftTokenEffective.value = await countTextTokens(rendered.output);
    if (!v.ok) draftEjsOk.value = false;
  } else {
    draftTokenEffective.value = null;
    draftEjsOk.value = false;
    ejsPreviewError.value = rendered.error;
  }
}

async function runEjsSyntaxCheck() {
  ejsChecking.value = true;
  ejsSyntaxMessage.value = '';
  try {
    const result = await checkEjsSyntax(draft.value.content ?? '');
    ejsSyntaxOk.value = result.ok;
    ejsSyntaxMessage.value = result.ok ? '语法检查通过' : result.error;
  } finally {
    ejsChecking.value = false;
  }
}

async function runEjsStagePreview() {
  ejsPreviewing.value = true;
  ejsPreviewError.value = '';
  ejsPreviewOutput.value = null;
  try {
    const content = draft.value.content ?? '';
    let result;
    if (previewMode.value === 'chat') {
      result = await renderEjsContent(content);
    } else {
      const stage = activeStage.value ?? draftStages.value[0];
      result = stage ? await renderEjsForStage(content, stage) : await renderEjsContent(content);
    }
    if (!result.ok) {
      ejsPreviewError.value = result.error;
      draftEjsOk.value = false;
      return;
    }
    ejsPreviewOutput.value = result.output;
    draftTokenEffective.value = await countTextTokens(result.output);
    draftEjsOk.value = true;
    if (!result.output.trim()) {
      toastr.info('此阶段渲染为空，不会发送正文');
    }
  } finally {
    ejsPreviewing.value = false;
  }
}

const matchCount = computed(() => {
  const text = draft.value.content || '';
  const q = findText.value;
  if (!text || !q) return 0;
  const escapedQuery = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(escapedQuery, 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
});

const highlightedContent = computed(() => {
  const text = draft.value.content || '';
  const q = findText.value;
  if (!text) return '（内容为空）';
  if (!q) return escapeHtml(text);
  const escapedQuery = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark class="wm-highlight">$1</mark>');
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function doReplace() {
  if (!findText.value) return;
  const content = draft.value.content || '';
  const find = findText.value;
  const count = content.split(find).length - 1;
  if (count <= 0) {
    toastr.warning('未找到匹配内容');
    return;
  }
  draft.value.content = content.replaceAll(find, replaceText.value);
  if (props.autosave) {
    await props.autosave();
    toastr.success(`已替换 ${count} 处并已同步到酒馆`);
  } else {
    toastr.success(`已替换 ${count} 处，请点击保存同步到酒馆`);
  }
}

async function doDeleteAll() {
  if (!findText.value) return;
  const content = draft.value.content || '';
  const find = findText.value;
  const count = content.split(find).length - 1;
  if (count <= 0) {
    toastr.warning('未找到匹配内容');
    return;
  }
  draft.value.content = content.replaceAll(find, '');
  if (props.autosave) {
    await props.autosave();
    toastr.success(`已删除 ${count} 处并已同步到酒馆`);
  } else {
    toastr.success(`已删除 ${count} 处，请点击保存同步到酒馆`);
  }
}
</script>

<style scoped>
.wm-ejs-hint {
  font-size: 0.76rem;
  color: var(--wm-muted);
  line-height: 1.45;
  margin: 0 0 10px;
}
.wm-ejs-hint code {
  font-size: 0.72rem;
}
.wm-ejs-token-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 0.78rem;
}
.wm-ejs-stage-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.wm-ejs-stage-label {
  font-size: 0.74rem;
  color: var(--wm-muted);
}
.wm-stage-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--wm-border);
  font-size: 0.72rem;
  cursor: pointer;
}
.wm-stage-chip.active {
  border-color: var(--wm-primary);
  background: var(--wm-primary-soft);
}
.wm-ejs-stage-cond {
  font-size: 0.72rem;
  color: var(--wm-muted);
  margin: 0 0 8px;
  word-break: break-all;
}
.wm-edit-row--ejs-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.wm-ejs-result {
  font-size: 0.76rem;
  padding: 8px 10px;
  border-radius: 4px;
  margin-bottom: 8px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
.wm-ejs-result--ok {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: var(--wm-text);
}
.wm-ejs-result--err {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: var(--wm-text);
}
.wm-ejs-preview-box {
  border: 1px solid var(--wm-border);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}
.wm-ejs-preview-head {
  font-size: 0.72rem;
  padding: 6px 10px;
  background: var(--wm-surface-dim);
  color: var(--wm-muted);
  border-bottom: 1px solid var(--wm-border);
}
.wm-ejs-preview-body {
  margin: 0;
  padding: 10px;
  max-height: 180px;
  overflow: auto;
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--wm-bg);
  color: var(--wm-text);
}
</style>
