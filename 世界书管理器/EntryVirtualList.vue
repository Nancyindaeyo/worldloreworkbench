<template>
  <div v-if="entries.length === 0" class="wm-empty">该世界书暂无条目</div>
  <div
    v-else
    class="wm-entries-scroll wm-entries-scroll--virtual"
    v-bind="containerProps"
    @dragover.prevent="emit('scrollDragOver', $event)"
    @dragleave="emit('scrollDragLeave')"
    @drop="emit('scrollDrop')"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="{ data: entry, index: entryIdx } in list"
        :key="entry.uid + '-' + entryIdx"
        class="wm-entry-item wm-entry-item--virtual"
        :class="[entryRowClass(entry), { 'wm-entry-item--touch': touchSelect }]"
        :style="{ height: `${entryRowHeight(entry)}px` }"
        @dragover.prevent="emit('entryDragOver', entry.uid, $event)"
        @dragleave="emit('entryDragLeave')"
        @drop.prevent="emit('entryDrop', entry.uid)"
      >
        <div class="wm-entry-head">
          <!-- 左侧操控与状态侧栏 -->
          <div class="wm-entry-side" @click.stop>
            <div
              v-if="!touchSelect"
              role="checkbox"
              :aria-checked="isSelected(entry.uid)"
              class="wm-entry-check-wrap"
              :class="{ checked: isSelected(entry.uid) }"
              tabindex="0"
              @keydown.enter.space.prevent="emit('toggleUid', entry.uid)"
              @click.stop="emit('toggleUid', entry.uid)"
            >
              <i v-if="isSelected(entry.uid)" class="fa-solid fa-check"></i>
            </div>
            <div
              class="wm-entry-grip"
              title="拖拽排序"
              draggable="true"
              @dragstart="emit('entryDragStart', entry.uid, $event)"
              @dragend="emit('entryDragEnd')"
            >
              <i class="fa-solid fa-grip-vertical"></i>
            </div>
            <span
              :class="[lampClass(entry), { 'wm-lamp--off': !entry.enabled }]"
              :title="lampTitle(entry)"
            ></span>
            <span class="wm-entry-side-uid" title="UID">#{{ entry.uid }}</span>
          </div>

          <div
            class="wm-entry-main"
            :class="{
              'wm-entry-main--tap': touchSelect,
              'wm-entry-main--content-hit': isContentSearchHit(entry),
            }"
            @click="touchSelect && emit('toggleUid', entry.uid)"
          >
            <div class="wm-entry-title-row">
              <span
                class="wm-entry-name"
                :title="entry.name || '（无标题）'"
                v-html="highlight(entry.name || '（无标题）')"
              ></span>
              <span
                v-if="isContentSearchHit(entry) && entryTokenInfo(entry)"
                class="wm-token-stat wm-token-stat--inline"
                :class="{ 'wm-token-stat--err': entryTokenHasError(entryTokenInfo(entry)) }"
                :title="entryTokenTitle(entryTokenInfo(entry))"
              >{{ formatEntryTokenLine(entryTokenInfo(entry)) }}</span>
              <div
                v-if="hasEntryDiff?.(entry.uid)"
                class="menu_button interactable wm-btn wm-entry-diff-btn"
                title="查看上次保存的改前/改后"
                @click.stop="emit('showDiff', entry.uid)"
              >
                diff
              </div>
              <div class="menu_button interactable wm-btn wm-entry-edit-btn" @click.stop="emit('edit', entry.uid)">
                编辑
              </div>
            </div>
            <div v-if="!isContentSearchHit(entry)" class="wm-entry-native-meta">
              <span>{{ positionLabel(entry) }}</span>
              <template v-if="entry.position?.type === 'at_depth'">
                <span class="wm-entry-meta-sep">·</span>
                <span>深度 {{ entry.position.depth ?? 0 }} ({{ entry.position.role ?? 'system' }})</span>
              </template>
              <span v-if="entryTokenInfo(entry)" class="wm-entry-meta-sep">·</span>
              <span
                v-if="entryTokenInfo(entry)"
                class="wm-token-stat wm-token-stat--entry"
                :class="{ 'wm-token-stat--err': entryTokenHasError(entryTokenInfo(entry)) }"
                :title="entryTokenTitle(entryTokenInfo(entry))"
              >{{ formatEntryTokenLine(entryTokenInfo(entry)) }}</span>
            </div>
            <div v-if="!isContentSearchHit(entry)" class="wm-entry-keys wm-entry-keys--primary">
              <span class="wm-keys-label">Keywords</span>
              <span class="wm-keys-value" v-html="highlight(keysPreview(entry) || '（无）')"></span>
            </div>
            <p class="wm-entry-preview" v-html="highlight(contentPreview(entry))"></p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVirtualList } from '@vueuse/core';
import { computed } from 'vue';
import {
  entryDepthLabel,
  entryKeysPreview,
  entryLampClass,
  entryLampTitle,
  entryPositionLabel,
} from './lib/entry-display';
import { estimateEntryRowHeight } from './lib/virtual-row-height';
import {
  entryTokenTitle,
  entryTokenHasError,
  formatEntryTokenLine,
  type EntryTokenInfo,
} from './lib/token-count';

const props = defineProps<{
  entries: WorldbookEntry[];
  rowHeight?: number;
  isSelected: (uid: number) => boolean;
  entryRowClass: (entry: WorldbookEntry) => Record<string, boolean>;
  /** 触屏：点条目主体切换勾选，仅「编辑」进编辑页 */
  touchSelect?: boolean;
  searchQuery?: string;
  entryTokens?: Record<number, EntryTokenInfo>;
  hasEntryDiff?: (uid: number) => boolean;
}>();

const emit = defineEmits<{
  toggleUid: [uid: number];
  edit: [uid: number];
  showDiff: [uid: number];
  entryDragStart: [uid: number, e: DragEvent];
  entryDragEnd: [];
  entryDragOver: [uid: number, e: DragEvent];
  entryDragLeave: [];
  entryDrop: [uid: number];
  scrollDragOver: [e: DragEvent];
  scrollDragLeave: [];
  scrollDrop: [];
}>();

const touchSelect = computed(() => props.touchSelect === true);
const entryTokens = computed(() => props.entryTokens ?? {});

function entryTokenInfo(entry: WorldbookEntry): EntryTokenInfo | undefined {
  return entryTokens.value[entry.uid];
}

const entriesRef = computed(() => props.entries);

const { list, containerProps, wrapperProps } = useVirtualList(entriesRef, {
  itemHeight: i => {
    const e = props.entries[i];
    if (!e) return touchSelect.value ? 100 : 118;
    if (props.rowHeight != null) return props.rowHeight;
    return estimateEntryRowHeight(e, touchSelect.value, props.searchQuery);
  },
  overscan: 8,
});

function entryRowHeight(entry: WorldbookEntry) {
  if (props.rowHeight != null) return props.rowHeight;
  return estimateEntryRowHeight(entry, touchSelect.value, props.searchQuery);
}

/** 搜索命中正文时压缩元信息行，把空间留给预览高亮 */
function isContentSearchHit(entry: WorldbookEntry): boolean {
  const q = props.searchQuery?.trim().toLowerCase();
  if (!q) return false;
  const inContent = (entry.content || '').toLowerCase().includes(q);
  const inName = (entry.name || '').toLowerCase().includes(q);
  return inContent && !inName;
}

function contentPreview(entry: WorldbookEntry): string {
  const content = entry.content || '';
  const q = props.searchQuery?.trim().toLowerCase();
  
  // 移动端/触屏时预览范围更小，使高亮更容易在有限高度内可见
  const charsBefore = touchSelect.value ? 15 : 40;
  const charsAfter = touchSelect.value ? 35 : 80;
  const maxFallbackLength = touchSelect.value ? 50 : 120;

  if (q && content.toLowerCase().includes(q)) {
    const idx = content.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - charsBefore);
    const end = Math.min(content.length, idx + charsAfter);
    let snippet = content.slice(start, end);
    if (start > 0) snippet = '…' + snippet;
    if (end < content.length) snippet = snippet + '…';
    return snippet;
  }
  return content.slice(0, maxFallbackLength) + (content.length > maxFallbackLength ? '…' : '');
}

function highlight(text: string): string {
  const q = props.searchQuery?.trim();
  if (!text) return '';
  if (!q) return escapeHtml(text);
  const escapedQuery = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark class="wm-highlight">$1</mark>');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const lampClass = entryLampClass;
const lampTitle = entryLampTitle;
const positionLabel = entryPositionLabel;
const depthLabel = entryDepthLabel;
const keysPreview = entryKeysPreview;
</script>
