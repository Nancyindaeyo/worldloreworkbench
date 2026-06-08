import type { WorldbookBindingInfo } from './binding';
import type { BookMeta } from '../schema';

export type BookSortMode =
  | 'import-asc'
  | 'import-desc'
  | 'modified-asc'
  | 'modified-desc'
  | 'name-asc'
  | 'name-desc'
  | 'binding-bound-first'
  | 'binding-unbound-first'
  | 'tags-group';

export const BOOK_SORT_OPTIONS: { value: BookSortMode; label: string; group: string }[] = [
  { value: 'import-desc', label: '新加入（最新在上）', group: '导入' },
  { value: 'modified-desc', label: '最近修改（新→旧）', group: '修改' },
  { value: 'name-asc', label: '名称 A→Z', group: '名称' },
  { value: 'name-desc', label: '名称 Z→A', group: '名称' },
  { value: 'tags-group', label: '按标签归类（同标签相邻）', group: '标签' },
];

export type BookSortContext = {
  /** 酒馆 getWorldbookNames 顺序（装插件前无时间戳的书保持此相对顺序） */
  importOrder: string[];
  getMeta: (name: string) => BookMeta;
  getBinding: (name: string) => WorldbookBindingInfo;
};

function hasImportTime(name: string, ctx: BookSortContext): boolean {
  const at = ctx.getMeta(name).firstImportAt;
  return at !== undefined && at > 0;
}

function importTimestamp(name: string, ctx: BookSortContext): number {
  return ctx.getMeta(name).firstImportAt ?? 0;
}

function tavernNativeIndex(name: string, ctx: BookSortContext): number {
  const i = ctx.importOrder.indexOf(name);
  return i < 0 ? 999999 : i;
}

function compareName(a: string, b: string): number {
  return a.localeCompare(b, 'zh-CN');
}

/**
 * 首次导入排序：
 * - 无 wm_first_import_at：按酒馆原生列表顺序（装插件前的书）
 * - 有记录：按时间戳；新→旧时记录段在前，旧→新时记录段在后
 */
function compareImport(a: string, b: string, ctx: BookSortContext, desc: boolean): number {
  const ha = hasImportTime(a, ctx);
  const hb = hasImportTime(b, ctx);

  if (ha && hb) {
    const ta = importTimestamp(a, ctx);
    const tb = importTimestamp(b, ctx);
    if (ta !== tb) return desc ? tb - ta : ta - tb;
    return compareName(a, b);
  }
  if (ha && !hb) return desc ? -1 : 1;
  if (!ha && hb) return desc ? 1 : -1;
  return tavernNativeIndex(a, ctx) - tavernNativeIndex(b, ctx);
}

function tagGroupKey(meta: BookMeta): string {
  const tags = [...(meta.tags ?? [])].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return tags.length ? tags.join('\0') : '\uffff';
}

/** 对名称列表排序（不含置顶；置顶由列表层单独处理） */
export function sortBookNames(names: string[], mode: BookSortMode, ctx: BookSortContext): string[] {
  const arr = [...names];
  const cmpModified = (a: string, b: string) => {
    const ta = ctx.getMeta(a).lastTouchedAt ?? 0;
    const tb = ctx.getMeta(b).lastTouchedAt ?? 0;
    if (ta !== tb) return ta - tb;
    return compareName(a, b);
  };

  switch (mode) {
    case 'import-asc':
      return arr.sort((a, b) => compareImport(a, b, ctx, false));
    case 'import-desc':
      return arr.sort((a, b) => compareImport(a, b, ctx, true));
    case 'modified-asc':
      return arr.sort(cmpModified);
    case 'modified-desc':
      return arr.sort((a, b) => -cmpModified(a, b));
    case 'name-asc':
      return arr.sort(compareName);
    case 'name-desc':
      return arr.sort((a, b) => -compareName(a, b));
    case 'binding-bound-first':
      return arr.sort((a, b) => {
        const ab = ctx.getBinding(a).charBound ? 0 : 1;
        const bb = ctx.getBinding(b).charBound ? 0 : 1;
        if (ab !== bb) return ab - bb;
        return compareName(a, b);
      });
    case 'binding-unbound-first':
      return arr.sort((a, b) => {
        const ab = ctx.getBinding(a).charBound ? 1 : 0;
        const bb = ctx.getBinding(b).charBound ? 1 : 0;
        if (ab !== bb) return ab - bb;
        return compareName(a, b);
      });
    case 'tags-group':
      return arr.sort((a, b) => {
        const ka = tagGroupKey(ctx.getMeta(a));
        const kb = tagGroupKey(ctx.getMeta(b));
        if (ka !== kb) return ka.localeCompare(kb, 'zh-CN');
        return compareName(a, b);
      });
    default:
      return arr;
  }
}

/** 将 newVisibleOrder 写回全局 bookOrder（仅重排当前筛选可见项） */
export function mergeVisibleIntoBookOrder(
  bookOrder: string[],
  visibleNames: string[],
  newVisibleOrder: string[],
): string[] {
  const visibleSet = new Set(visibleNames);
  let vi = 0;
  return bookOrder.map(n => {
    if (!visibleSet.has(n)) return n;
    return newVisibleOrder[vi++] ?? n;
  });
}
