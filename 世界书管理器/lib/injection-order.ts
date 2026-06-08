import { entryPositionLabel } from './entry-display';

/** 提示词中各插入槽位自上而下的大致顺序 */
export const INJECTION_SLOT_ORDER: WorldbookEntry['position']['type'][] = [
  'before_character_definition',
  'after_character_definition',
  'before_example_messages',
  'after_example_messages',
  'before_author_note',
  'after_author_note',
  'at_depth',
  'outlet',
];

export type InjectionSlotGroup = {
  slotKey: string;
  slotLabel: string;
  entries: WorldbookEntry[];
};

function slotKey(entry: WorldbookEntry): string {
  const p = entry.position?.type ?? 'after_character_definition';
  if (p === 'at_depth') {
    const role = entry.position?.role ?? 'system';
    const depth = entry.position?.depth ?? 0;
    return `at_depth:${depth}:${role}`;
  }
  return p;
}

function slotLabelFromKey(key: string, sample?: WorldbookEntry): string {
  if (key.startsWith('at_depth:')) {
    const [, depth, role] = key.split(':');
    return `@D 深度 ${depth} (${role})`;
  }
  if (sample) return entryPositionLabel(sample);
  return key;
}

/** 同槽位内：order 越小越靠前（越远离上下文底部） */
export function compareInjectionOrder(a: WorldbookEntry, b: WorldbookEntry): number {
  const oa = a.position?.order ?? 100;
  const ob = b.position?.order ?? 100;
  if (oa !== ob) return oa - ob;
  return a.uid - b.uid;
}

/** 按插入槽位 + order 分组排序（仅已启用条目；模拟「若全部激活」的大致顺序，不含关键字/概率筛选） */
export function buildInjectionOrderGroups(entries: WorldbookEntry[]): InjectionSlotGroup[] {
  const enabled = entries.filter(e => e.enabled);
  const bySlot = new Map<string, WorldbookEntry[]>();

  for (const e of enabled) {
    const key = slotKey(e);
    const list = bySlot.get(key) ?? [];
    list.push(e);
    bySlot.set(key, list);
  }

  const groups: InjectionSlotGroup[] = [];

  for (const slotType of INJECTION_SLOT_ORDER) {
    if (slotType === 'at_depth') {
      const depthKeys = [...bySlot.keys()].filter(k => k.startsWith('at_depth:')).sort();
      for (const key of depthKeys) {
        const list = bySlot.get(key)!;
        list.sort(compareInjectionOrder);
        groups.push({
          slotKey: key,
          slotLabel: slotLabelFromKey(key, list[0]),
          entries: list,
        });
      }
      continue;
    }
    const list = bySlot.get(slotType);
    if (!list?.length) continue;
    list.sort(compareInjectionOrder);
    groups.push({
      slotKey: slotType,
      slotLabel: slotLabelFromKey(slotType, list[0]),
      entries: list,
    });
  }

  // outlet 等未在常量列表中的槽位
  for (const [key, list] of bySlot) {
    if (groups.some(g => g.slotKey === key)) continue;
    list.sort(compareInjectionOrder);
    groups.push({
      slotKey: key,
      slotLabel: slotLabelFromKey(key, list[0]),
      entries: list,
    });
  }

  return groups;
}
