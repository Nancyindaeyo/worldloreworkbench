import { entryKeysPreview } from './entry-display';
import type { WorldbookBindingInfo } from './binding';
import type { BookListItem } from '../store';
import { DEFAULT_FOLDER } from '../schema';

const PAD_Y = 8;
const TITLE_ROW = 28;
const META_LINE = 14;
const BIND_MARGIN = 1;
const BIND_TEXT_LINE = 14;
const TAGS_MARGIN_TOP = 5;
const TAG_CHIP = 26;
const TAG_GAP = 5;
const TAG_BOTTOM = 6;

function collectBookTags(book: BookListItem): string[] {
  const tags: string[] = [];
  if (book.meta.folder && book.meta.folder !== DEFAULT_FOLDER) {
    tags.push(book.meta.folder);
  }
  tags.push(...(book.meta.tags ?? []));
  return tags;
}

function estimateTagSectionHeight(tagCount: number, isMobile: boolean): number {
  if (tagCount <= 0) return 0;
  const perRow = isMobile ? 3 : 4;
  const visible = Math.min(tagCount, 4);
  const chips = visible + (tagCount > 4 ? 1 : 0);
  const rows = Math.ceil(chips / perRow);
  return TAGS_MARGIN_TOP + rows * TAG_CHIP + Math.max(0, rows - 1) * TAG_GAP + TAG_BOTTOM;
}

function showsChatBindLine(info: WorldbookBindingInfo): boolean {
  return info.chatLore.length > 0 || info.currentChatBound;
}

function estimateCharBindLines(info: WorldbookBindingInfo): number {
  if (!info.charBound || info.characters.length === 0) return 1;
  const text = info.characters.map(c => c.name).join('、');
  return info.characters.length >= 3 || text.length > 24 ? 2 : 1;
}

function estimateChatBindLines(info: WorldbookBindingInfo): number {
  if (info.chatLore.length === 0) return info.currentChatBound ? 1 : 0;
  const text = info.chatLore.map(c => c.name).join('、');
  return info.chatLore.length >= 3 || text.length > 24 ? 2 : 1;
}

function estimateBindBlockHeight(lines: number): number {
  if (lines <= 0) return 0;
  return BIND_MARGIN + BIND_TEXT_LINE * lines;
}

/** 估算世界书卡片高度（与虚拟列表 itemHeight 一致） */
export function estimateBookRowHeight(book: BookListItem, isMobile: boolean): number {
  const tags = collectBookTags(book);
  let h = (tags.length > 0 ? 10 : PAD_Y) + TITLE_ROW + META_LINE;
  h += estimateBindBlockHeight(estimateCharBindLines(book.binding));
  if (showsChatBindLine(book.binding)) {
    h += estimateBindBlockHeight(estimateChatBindLines(book.binding));
  }

  if (tags.length > 0) {
    h += estimateTagSectionHeight(tags.length, isMobile);
  }

  if (book.matchedEntryNames?.length) {
    h += isMobile ? 22 : 0;
  }

  return Math.max(isMobile ? 60 : 56, Math.ceil(h));
}

const TITLE_LINE = 22;
const META_LINE_ENTRY = 16;
const KEYS_LINE = 14;
const PREVIEW_LINE = 18;

/** 估算条目卡片高度（标题固定单行，避免虚拟列表裁切预览） */
export function estimateEntryRowHeight(
  entry: WorldbookEntry,
  touchSelect: boolean,
  searchQuery?: string,
): number {
  const q = searchQuery?.trim().toLowerCase();
  const contentMatch = !!q && (entry.content || '').toLowerCase().includes(q);
  const nameMatch = !!q && (entry.name || '').toLowerCase().includes(q);
  const compactMeta = contentMatch && !nameMatch;

  const keys = (entryKeysPreview(entry) || '').length;
  const keysLines = compactMeta ? 0 : keys > 36 ? 2 : keys > 0 ? 1 : 0;
  const metaLines = compactMeta ? 0 : 1;

  const content = entry.content || '';
  const previewLen = content.length;
  const maxLen = touchSelect ? Math.min(previewLen, 50) : Math.min(previewLen, 120);
  let previewLines = touchSelect ? (maxLen > 30 ? 2 : maxLen > 0 ? 1 : 0) : maxLen > 70 ? 2 : maxLen > 0 ? 1 : 0;
  if (compactMeta) previewLines = Math.max(previewLines, touchSelect ? 2 : 2);

  const pad = touchSelect ? 16 : 18;
  const h =
    pad +
    TITLE_LINE +
    metaLines * META_LINE_ENTRY +
    keysLines * KEYS_LINE +
    previewLines * PREVIEW_LINE;

  return Math.max(touchSelect ? 76 : 80, Math.ceil(h));
}
