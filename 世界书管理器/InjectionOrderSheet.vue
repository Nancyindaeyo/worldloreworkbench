<template>
  <div class="wm-mobile-sheet" @click.self="emit('close')">
    <div class="wm-mobile-sheet-content wm-injection-order-sheet">
      <header class="wm-mobile-sheet-header">
        <h3>📑 注入顺序模拟</h3>
        <div class="menu_button interactable wm-btn wm-btn-icon" @click="emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </div>
      </header>

      <div ref="sheetBodyRef" class="wm-mobile-sheet-body">
        <p class="wm-injection-hint">
          <strong>模拟预览</strong>：按<strong>插入位置 + 顺序 (order)</strong>排列本书<strong>已启用</strong>条目（不算关键字/概率是否命中）。
          槽位先后与酒馆常见结构一致，但<strong>不等于</strong>每轮对话的真实注入结果。
          含 EJS 的条目会按<strong>当前聊天变量</strong>试渲染（需已进入角色卡聊天）。
        </p>

        <section class="wm-injection-vars-panel">
          <div class="wm-injection-vars-head">
            <span class="wm-injection-vars-title">当前聊天变量（EJS 相关）</span>
            <div class="wm-injection-vars-actions">
              <button type="button" class="menu_button interactable wm-btn wm-btn-sm" @click="expandAllVars">展开</button>
              <button type="button" class="menu_button interactable wm-btn wm-btn-sm" @click="collapseAllVars">折叠</button>
              <button type="button" class="menu_button interactable wm-btn wm-btn-sm" @click="void reloadContext()">刷新</button>
            </div>
          </div>
          <p v-if="contextLoading" class="wm-injection-vars-note">读取变量中…</p>
          <p v-else-if="!contextState.hasChat" class="wm-injection-vars-warn">{{ contextState.error }}</p>
          <p v-else-if="contextState.error" class="wm-injection-vars-warn">{{ contextState.error }}</p>
          <p v-else-if="varTreeRoots.length === 0" class="wm-injection-vars-note">
            当前书内无 getvar 引用；纯 EJS 输出仍会按聊天上下文渲染。
          </p>
          <div v-else class="wm-var-tree">
            <div
              v-for="node in visibleVarNodes"
              :key="node.id"
              class="wm-var-tree-row"
              :class="[
                `wm-var-tree-row--depth-${Math.min(node.depth, 4)}`,
                { 'wm-var-tree-row--missing': node.valueKind === 'missing' },
              ]"
              :style="{ paddingLeft: `${6 + node.depth * 20}px` }"
            >
              <button
                v-if="node.isBranch"
                type="button"
                class="wm-var-tree-toggle"
                @click="toggleVarNode(node.id)"
              >
                <i class="fa-solid fa-chevron-right" :class="{ 'wm-var-tree-toggle--open': expandedVarNodes.has(node.id) }"></i>
              </button>
              <span v-else class="wm-var-tree-toggle wm-var-tree-toggle--leaf"></span>
              <span class="wm-var-tree-key">{{ node.label }}</span>
              <span v-if="node.value != null" class="wm-var-tree-sep">:</span>
              <span v-if="node.value != null" class="wm-var-tree-value" :class="`wm-var-tree-value--${node.valueKind}`">
                {{ node.value }}
              </span>
            </div>
          </div>
        </section>

        <div class="wm-injection-filters">
          <label class="wm-check-label wm-check-label--compact">
            <input v-model="onlyEjs" type="checkbox" />
            <span>仅含 EJS 模板</span>
          </label>
        </div>

        <div v-if="!loading && groups.length > 0" class="wm-injection-toolbar">
          <span class="wm-injection-summary">{{ summaryText }}</span>
          <div class="wm-injection-toolbar-actions">
            <button type="button" class="menu_button interactable wm-btn wm-btn-sm" @click="expandAll">全部展开</button>
            <button type="button" class="menu_button interactable wm-btn wm-btn-sm" @click="collapseAll">全部折叠</button>
          </div>
        </div>

        <div v-if="loading && !hasLoadedOnce" class="wm-empty">计算注入预览…</div>
        <div v-else-if="groups.length === 0" class="wm-empty">
          {{ onlyEjs ? '无已启用的 EJS 条目' : '无已启用条目' }}
        </div>
        <div v-else class="wm-injection-list">
          <template v-for="(g, gi) in groups" :key="g.slotKey">
            <button type="button" class="wm-inj-row wm-inj-row--slot" @click="toggleSlot(g.slotKey)">
              <i
                class="fa-solid fa-chevron-right wm-inj-chevron"
                :class="{ 'is-open': isSlotExpanded(g.slotKey) }"
              ></i>
              <span class="wm-inj-slot-badge">{{ gi + 1 }}</span>
              <span class="wm-inj-slot-label">{{ g.slotLabel }}</span>
              <span class="wm-inj-slot-count">{{ g.items.length }} 条</span>
            </button>
            <template v-if="isSlotExpanded(g.slotKey)">
              <div
                v-for="item in g.items"
                :key="item.itemKey"
                class="wm-inj-entry-block"
                :class="{ 'wm-inj-entry-block--err': item.ejsOk === false }"
              >
                <button type="button" class="wm-inj-row wm-inj-row--entry" @click="toggleItem(item.itemKey)">
                  <i
                    class="fa-solid fa-chevron-right wm-inj-chevron wm-inj-chevron--sm"
                    :class="{ 'is-open': isItemExpanded(item.itemKey) }"
                  ></i>
                  <span class="wm-inj-order">#{{ item.order }}</span>
                  <span class="wm-inj-name">{{ item.entry.name || '（无标题）' }}</span>
                  <span v-if="item.hasEjs" class="wm-inj-ejs-tag">EJS</span>
                  <span
                    class="wm-token-stat"
                    :class="{ 'wm-token-stat--err': item.ejsOk === false }"
                    :title="item.tokenTitle"
                  >{{ item.tokenLine }}</span>
                </button>
                <div v-show="isItemExpanded(item.itemKey)" class="wm-inj-preview-wrap">
                  <pre v-if="item.preview" class="wm-inj-preview">{{ item.preview }}</pre>
                  <div v-else-if="item.ejsOk !== false" class="wm-inj-preview-empty">（此阶段无正文输出）</div>
                  <div v-if="item.ejsError" class="wm-inj-preview-err">{{ item.ejsError }}</div>
                </div>
              </div>
            </template>
          </template>
        </div>
      </div>

      <footer class="wm-mobile-sheet-footer">
        <div class="menu_button interactable wm-btn wm-btn-primary" style="flex: 1" @click="emit('close')">关闭</div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  buildEjsVarTree,
  defaultExpandedVarNodes,
  flattenVarTree,
  loadChatEjsContext,
  type EjsVarTreeNode,
} from './lib/ejs-context-vars';
import { hasEjsMarkers, renderEjsContent } from './lib/entry-ejs';
import { buildInjectionOrderGroups } from './lib/injection-order';
import { countTextTokens, formatTokenCount, TOKEN_COUNT_HINT } from './lib/token-count';

const props = defineProps<{
  entries: WorldbookEntry[];
}>();

const emit = defineEmits<{ close: [] }>();

const sheetBodyRef = ref<HTMLElement | null>(null);
const onlyEjs = ref(false);
const loading = ref(false);
const contextLoading = ref(false);
const hasLoadedOnce = ref(false);
const expandedSlots = ref<Set<string>>(new Set());
const expandedItems = ref<Set<string>>(new Set());
const chatContext = ref<Record<string, unknown>>({});
const contextState = ref({ ok: false, hasChat: false, error: '' });
const varTreeRoots = ref<EjsVarTreeNode[]>([]);
const expandedVarNodes = ref<Set<string>>(new Set());

const visibleVarNodes = computed(() => flattenVarTree(varTreeRoots.value, expandedVarNodes.value));

type PreviewRow = {
  itemKey: string;
  entry: WorldbookEntry;
  order: number;
  hasEjs: boolean;
  preview: string;
  tokenLine: string;
  tokenTitle: string;
  ejsOk: boolean | null;
  ejsError: string;
};

type PreviewGroup = {
  slotKey: string;
  slotLabel: string;
  items: PreviewRow[];
};

const groups = ref<PreviewGroup[]>([]);

const entriesFingerprint = computed(() =>
  props.entries
    .filter(e => e.enabled)
    .map(e => `${e.uid}|${e.position?.type}|${e.position?.order}|${(e.content ?? '').length}`)
    .join('\n'),
);

const summaryText = computed(() => {
  const slotCount = groups.value.length;
  const itemCount = groups.value.reduce((n, g) => n + g.items.length, 0);
  return `${slotCount} 个注入槽 · ${itemCount} 条`;
});

watch(
  () => [entriesFingerprint.value, onlyEjs.value],
  () => void rebuildPreview(),
  { immediate: true },
);

watch(
  () => entriesFingerprint.value,
  () => void reloadContext(),
  { immediate: true },
);

async function reloadContext() {
  contextLoading.value = true;
  try {
    const result = await loadChatEjsContext();
    contextState.value = {
      ok: result.ok,
      hasChat: result.hasChat,
      error: result.error,
    };
    chatContext.value = result.context;
    varTreeRoots.value = await buildEjsVarTree(props.entries, result.context);
    expandedVarNodes.value = defaultExpandedVarNodes(varTreeRoots.value);
  } finally {
    contextLoading.value = false;
  }
}

function toggleVarNode(id: string) {
  const next = new Set(expandedVarNodes.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedVarNodes.value = next;
}

function expandAllVars() {
  const ids = new Set<string>();
  const walk = (nodes: EjsVarTreeNode[]) => {
    for (const n of nodes) {
      if (n.isBranch) ids.add(n.id);
      walk(n.children);
    }
  };
  walk(varTreeRoots.value);
  expandedVarNodes.value = ids;
}

function collapseAllVars() {
  expandedVarNodes.value = new Set();
}

function isSlotExpanded(slotKey: string): boolean {
  return expandedSlots.value.has(slotKey);
}

function isItemExpanded(itemKey: string): boolean {
  return expandedItems.value.has(itemKey);
}

function toggleSlot(slotKey: string) {
  const next = new Set(expandedSlots.value);
  if (next.has(slotKey)) next.delete(slotKey);
  else next.add(slotKey);
  expandedSlots.value = next;
}

function toggleItem(itemKey: string) {
  const next = new Set(expandedItems.value);
  if (next.has(itemKey)) next.delete(itemKey);
  else next.add(itemKey);
  expandedItems.value = next;
}

function expandAll() {
  expandedSlots.value = new Set(groups.value.map(g => g.slotKey));
  expandedItems.value = new Set(groups.value.flatMap(g => g.items.map(i => i.itemKey)));
}

function collapseAll() {
  expandedSlots.value = new Set();
  expandedItems.value = new Set();
}

function preserveExpandState(out: PreviewGroup[]) {
  const validSlots = new Set(out.map(g => g.slotKey));
  const validItems = new Set(out.flatMap(g => g.items.map(i => i.itemKey)));

  if (!hasLoadedOnce.value) {
    expandedSlots.value = new Set(out.map(g => g.slotKey));
    expandedItems.value = new Set();
    return;
  }

  expandedSlots.value = new Set([...expandedSlots.value].filter(k => validSlots.has(k)));
  expandedItems.value = new Set([...expandedItems.value].filter(k => validItems.has(k)));
}

async function rebuildPreview() {
  const scrollTop = sheetBodyRef.value?.scrollTop ?? 0;
  if (!hasLoadedOnce.value) loading.value = true;

  try {
    let source = props.entries;
    if (onlyEjs.value) {
      source = source.filter(e => hasEjsMarkers(e.content ?? ''));
    }

    const slotGroups = buildInjectionOrderGroups(source);
    const out: PreviewGroup[] = [];

    for (const g of slotGroups) {
      const items: PreviewRow[] = [];
      for (const entry of g.entries) {
        const content = entry.content ?? '';
        const entryHasEjs = hasEjsMarkers(content);
        const rendered = entryHasEjs
          ? await renderEjsContent(content)
          : { ok: true, output: content, error: '' };

        const raw = await countTextTokens(content);
        const eff = rendered.ok ? await countTextTokens(rendered.output) : null;
        const ejsOk = entryHasEjs ? rendered.ok : null;
        const preview = rendered.ok ? rendered.output : '';

        items.push({
          itemKey: `${entry.uid}:${entry.position?.order ?? 100}`,
          entry,
          order: entry.position?.order ?? 100,
          hasEjs: entryHasEjs,
          preview,
          tokenLine:
            eff != null && eff !== raw
              ? `${formatTokenCount(raw)} → ${formatTokenCount(eff)} tk${ejsOk === false ? ' !' : ''}`
              : `${formatTokenCount(raw ?? eff)} tk${ejsOk === false ? ' !' : ''}`,
          tokenTitle: TOKEN_COUNT_HINT,
          ejsOk,
          ejsError: rendered.error,
        });
      }
      if (items.length > 0) {
        out.push({ slotKey: g.slotKey, slotLabel: g.slotLabel, items });
      }
    }

    preserveExpandState(out);
    groups.value = out;
    hasLoadedOnce.value = true;
  } catch (e) {
    console.error('[世界书管理器] 注入顺序预览失败', e);
    groups.value = [];
  } finally {
    loading.value = false;
    await nextTick();
    if (sheetBodyRef.value) sheetBodyRef.value.scrollTop = scrollTop;
  }
}
</script>
