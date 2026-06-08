<template>
  <div v-if="books.length === 0" class="wm-empty">无匹配世界书</div>
  <div
    v-else
    ref="scrollEl"
    class="wm-books-scroll wm-books-scroll--virtual"
    :style="containerStyle"
    @scroll="onContainerScroll"
  >
    <div v-bind="wrapperProps">
      <div
        v-for="{ data: book, index } in list"
        :key="book.name"
        class="wm-book-item wm-book-item--virtual"
        :class="{
          selected: selectedBook === book.name,
          'batch-selected': selectedBooks.has(book.name),
          pinned: book.meta.pinned,
          'wm-book-item--global': book.binding.globalEnabled,
          'wm-book-item--has-tags': hasBookTags(book),
        }"
        :style="{ height: `${bookRowHeight(book)}px` }"
        @dragover.prevent="showCheckboxes"
        @drop.prevent="showCheckboxes && emit('drop', book.name)"
        @touchstart.passive="touchSelect && onTouchStart(book.name, $event)"
        @touchmove.passive="touchSelect && onTouchMove($event)"
        @touchend="touchSelect && onTouchEnd(book.name)"
        @touchcancel="touchSelect && onTouchCancel()"
      >
        <div class="wm-book-head">
          <div
            v-if="showCheckboxes"
            class="wm-book-drag interactable"
            draggable="true"
            title="拖动排序"
            @dragstart.stop="onDragStart(book.name)"
            @click.stop
          >
            <i class="fa-solid fa-grip-vertical"></i>
          </div>
          <input
            v-if="showCheckboxes"
            type="checkbox"
            :checked="selectedBooks.has(book.name)"
            @click.stop
            @change="emit('toggleSelect', book.name)"
          />
          <button
            type="button"
            class="wm-book-pin interactable"
            :class="{ active: book.meta.pinned }"
            :title="book.meta.pinned ? '取消置顶' : '置顶'"
            @click.stop="emit('togglePin', book.name)"
          >
            <i class="fa-solid fa-thumbtack"></i>
          </button>
          <div class="wm-book-body" @click.stop="!touchSelect && handleRowActivate(book.name)">
            <div class="wm-book-title-row">
              <span class="wm-book-title" v-html="highlight(book.name)"></span>
              <span v-if="book.binding.globalEnabled" class="wm-book-tag wm-book-tag--global">全局</span>
              <span
                v-if="book.entryCount !== null"
                class="wm-book-inline-stat"
                :title="`${TOKEN_COUNT_HINT}\n全书: ${book.entryCount} 条 / 启用 ${book.enabledCount}${book.totalTokens != null ? ` · ${formatTokenCount(book.totalTokens)} tk` : ''}`"
              >
                · {{ book.entryCount }}条 / 启用{{ book.enabledCount ?? 0
                }}<template v-if="book.totalTokens != null"> · {{ formatTokenCount(book.totalTokens) }}tk</template>
              </span>
              <button
                type="button"
                class="wm-book-open interactable"
                title="查看条目"
                @click.stop="openEntries(book.name)"
              >
                <i class="fa-solid fa-chevron-right"></i>
              </button>
            </div>
            <div class="wm-book-meta-line">
              <span v-html="highlight(book.meta.folder)"></span>
              <template v-if="book.binding.currentChatBound">
                <span class="wm-book-meta-sep">·</span>
                <span>当前聊天</span>
              </template>
            </div>
            <div
              class="wm-book-bind-line"
              :class="{ 'wm-book-bind-line--unbound': !book.binding.charBound }"
              :title="bindingDetailTitle(book)"
              v-html="highlight(bindingCharLine(book))"
            >
            </div>
            <div
              v-if="chatLoreLine(book)"
              class="wm-book-bind-line wm-book-bind-line--chat"
              :title="bindingDetailTitle(book)"
              v-html="highlight(chatLoreLine(book)!)"
            >
            </div>
            <div v-if="book.matchedEntryNames?.length" class="wm-book-matched-entries-line">
              <i class="fa-solid fa-magnifying-glass wm-matched-icon"></i>
              <span>匹配条目：</span>
              <template v-if="book.matchedEntryNames.length === 1">
                <span class="wm-matched-entry-name" v-html="highlight(book.matchedEntryNames[0])"></span>
              </template>
              <template v-else>
                <span class="wm-matched-entry-name" v-html="highlight(book.matchedEntryNames[0])"></span>
                <span class="wm-matched-more">等还有 {{ book.matchedEntryNames.length - 1 }} 个条目</span>
              </template>
            </div>
            <div v-if="book.meta.tags?.length || (book.meta.folder && book.meta.folder !== '所有世界书')" class="wm-book-tags">
              <span
                v-for="t in visibleTags(book)"
                :key="t"
                class="wm-book-tag"
                :class="{ 'wm-book-tag--folder': t === book.meta.folder }"
                :style="tagChipStyle(t)"
              >
                <span v-html="highlight(t)"></span>
              </span>
              <span
                v-if="overflowTagCount(book) > 0"
                class="wm-book-tag wm-book-tag--more"
                :title="overflowTagsTitle(book)"
              >+{{ overflowTagCount(book) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVirtualList } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { bookTagChipStyle } from './lib/tag-chip-style';
import { formatBindingCharNames, formatBindingDetail, formatChatLoreBindingLine } from './lib/binding';
import { formatTokenCount, TOKEN_COUNT_HINT } from './lib/token-count';
import { estimateBookRowHeight } from './lib/virtual-row-height';
import type { BookListItem } from './store';

const props = defineProps<{
  books: BookListItem[];
  selectedBook: string | null;
  selectedBooks: Set<string>;
  tagColors: Record<string, { color: string } | undefined>;
  /** 窄屏布局（点按勾选、双击进入条目） */
  touchSelect: boolean;
  /** 宽屏：显示勾选框与拖动手柄 */
  showCheckboxes: boolean;
  searchQuery?: string;
}>();

const emit = defineEmits<{
  select: [name: string];
  toggleSelect: [name: string];
  togglePin: [name: string];
  drop: [targetName: string];
  dragStart: [name: string];
  ensureStats: [names: string[]];
}>();

/** 双击间隔：第二次点按进入条目 */
const DOUBLE_TAP_MS = 360;
/** 手指移动超过该像素视为滑动，不触发点选 */
const TOUCH_SCROLL_CANCEL_PX = 14;
let touchActiveName: string | null = null;
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;
let lastTapAt = 0;
let lastTapName = '';
let pendingToggleTimer: ReturnType<typeof setTimeout> | null = null;
/** 点在图钉/勾选/拖柄/箭头上时不触发卡片点选 */
let touchSkipRowAction = false;

/** 卡片内最多展示的标签数，其余折叠为 +N */
const MAX_VISIBLE_TAGS = 4;

const booksRef = computed(() => props.books);

const { list, containerProps, wrapperProps } = useVirtualList(booksRef, {
  itemHeight: i => estimateBookRowHeight(props.books[i]!, props.touchSelect),
  overscan: 10,
});

const scrollEl = ref<HTMLElement | null>(null);
const containerStyle = computed(() => containerProps.style);

watch(
  list,
  rows => {
    emit(
      'ensureStats',
      rows.map(r => r.data.name),
    );
  },
  { flush: 'post' },
);

watch(
  () => props.books.map(b => b.name).join('\x1e'),
  () => {
    scrollEl.value?.scrollTo({ top: 0 });
    containerProps.onScroll?.();
  },
);

watch(
  scrollEl,
  el => {
    containerProps.ref.value = el;
  },
  { flush: 'post' },
);

function onContainerScroll() {
  containerProps.onScroll();
}

function bookRowHeight(book: BookListItem) {
  return estimateBookRowHeight(book, props.touchSelect);
}

function hasBookTags(book: BookListItem): boolean {
  return !!(book.meta.tags?.length || (book.meta.folder && book.meta.folder !== '所有世界书'));
}

function bindingCharLine(book: BookListItem) {
  return formatBindingCharNames(book.binding);
}

function chatLoreLine(book: BookListItem) {
  return formatChatLoreBindingLine(book.binding) || null;
}

function bindingDetailTitle(book: BookListItem) {
  return formatBindingDetail(book.binding);
}

function tagChipStyle(tag: string) {
  return bookTagChipStyle(props.tagColors[tag]?.color);
}

function visibleTags(book: BookListItem): string[] {
  const tags = [];
  if (book.meta.folder && book.meta.folder !== '所有世界书') {
    tags.push(book.meta.folder);
  }
  tags.push(...(book.meta.tags ?? []));
  return tags.slice(0, MAX_VISIBLE_TAGS);
}

function overflowTagCount(book: BookListItem): number {
  const totalTagsCount = (book.meta.tags?.length ?? 0) + (book.meta.folder && book.meta.folder !== '所有世界书' ? 1 : 0);
  return Math.max(0, totalTagsCount - MAX_VISIBLE_TAGS);
}

function overflowTagsTitle(book: BookListItem): string {
  const tags = [];
  if (book.meta.folder && book.meta.folder !== '所有世界书') {
    tags.push(book.meta.folder);
  }
  tags.push(...(book.meta.tags ?? []));
  const rest = tags.slice(MAX_VISIBLE_TAGS);
  return rest.length ? rest.join('、') : '';
}

function onDragStart(name: string) {
  emit('dragStart', name);
}

function openEntries(name: string) {
  clearPendingToggle();
  emit('select', name);
}

function isBookRowChromeTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('.wm-book-pin, .wm-book-drag, .wm-book-open, input[type="checkbox"]');
}

function clearPendingToggle() {
  if (pendingToggleTimer) {
    clearTimeout(pendingToggleTimer);
    pendingToggleTimer = null;
  }
}

/** 点按勾选 / 双击同一本进入条目（与条目列表「点按勾选」一致） */
function handleRowActivate(name: string) {
  const now = Date.now();
  const isDouble = lastTapName === name && now - lastTapAt <= DOUBLE_TAP_MS;
  lastTapAt = now;
  lastTapName = name;
  if (isDouble) {
    clearPendingToggle();
    openEntries(name);
    return;
  }
  clearPendingToggle();
  pendingToggleTimer = setTimeout(() => {
    pendingToggleTimer = null;
    emit('toggleSelect', name);
  }, DOUBLE_TAP_MS);
}

function onTouchStart(name: string, e: TouchEvent) {
  if (isBookRowChromeTarget(e.target)) {
    touchSkipRowAction = true;
    touchActiveName = null;
    return;
  }
  touchSkipRowAction = false;
  touchActiveName = name;
  touchMoved = false;
  const t = e.touches[0];
  if (t) {
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }
}

function onTouchMove(e: TouchEvent) {
  if (!touchActiveName) return;
  const t = e.touches[0];
  if (!t) return;
  if (
    Math.abs(t.clientX - touchStartX) > TOUCH_SCROLL_CANCEL_PX ||
    Math.abs(t.clientY - touchStartY) > TOUCH_SCROLL_CANCEL_PX
  ) {
    touchMoved = true;
  }
}

function onTouchCancel() {
  clearPendingToggle();
  touchActiveName = null;
  touchMoved = false;
  touchSkipRowAction = false;
}

function onTouchEnd(name: string) {
  if (touchSkipRowAction) {
    touchSkipRowAction = false;
    touchActiveName = null;
    touchMoved = false;
    return;
  }
  const canAct = !touchMoved && touchActiveName === name;
  if (canAct) handleRowActivate(name);
  touchActiveName = null;
  touchMoved = false;
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
</script>
