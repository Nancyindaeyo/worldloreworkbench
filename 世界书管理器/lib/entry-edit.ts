/** 条目编辑草稿 ↔ WorldbookEntry（对齐 @types/function/worldbook.d.ts） */

export type EntryEditDraft = {
  name: string;
  enabled: boolean;
  content: string;
  strategyType: 'constant' | 'selective' | 'vectorized';
  keysText: string;
  keysSecondaryText: string;
  keysSecondaryLogic: 'and_any' | 'and_all' | 'not_all' | 'not_any';
  scanDepth: string;
  positionType: WorldbookEntry['position']['type'];
  positionRole: 'system' | 'assistant' | 'user';
  positionDepth: number;
  positionOrder: number;
  probability: number;
  preventIncoming: boolean;
  preventOutgoing: boolean;
};

export const POSITION_OPTIONS: { value: EntryEditDraft['positionType']; label: string }[] = [
  { value: 'before_character_definition', label: '角色定义前' },
  { value: 'after_character_definition', label: '角色定义后' },
  { value: 'before_example_messages', label: '示例消息前' },
  { value: 'after_example_messages', label: '示例消息后' },
  { value: 'before_author_note', label: '作者注释前' },
  { value: 'after_author_note', label: '作者注释后' },
  { value: 'at_depth', label: '@D 指定深度' },
  { value: 'outlet', label: 'Outlet' },
];

export const SECONDARY_LOGIC_OPTIONS: { value: EntryEditDraft['keysSecondaryLogic']; label: string }[] = [
  { value: 'and_any', label: 'AND ANY' },
  { value: 'and_all', label: 'AND ALL' },
  { value: 'not_all', label: 'NOT ALL' },
  { value: 'not_any', label: 'NOT ANY' },
];

export function keysArrayToText(keys: (string | RegExp)[] | undefined): string {
  return (keys ?? [])
    .map(k => (typeof k === 'string' ? k : k.source))
    .filter(Boolean)
    .join(', ');
}

export function keysTextToArray(text: string): string[] {
  return text
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function entryToEditDraft(entry: WorldbookEntry): EntryEditDraft {
  const scan = entry.strategy?.scan_depth;
  return {
    name: entry.name ?? '',
    enabled: entry.enabled ?? true,
    content: entry.content ?? '',
    strategyType: entry.strategy?.type ?? 'selective',
    keysText: keysArrayToText(entry.strategy?.keys),
    keysSecondaryText: keysArrayToText(entry.strategy?.keys_secondary?.keys),
    keysSecondaryLogic: entry.strategy?.keys_secondary?.logic ?? 'and_any',
    scanDepth: scan === 'same_as_global' || scan === undefined ? 'same_as_global' : String(scan),
    positionType: entry.position?.type ?? 'after_character_definition',
    positionRole: entry.position?.role ?? 'system',
    positionDepth: entry.position?.depth ?? 0,
    positionOrder: entry.position?.order ?? 100,
    probability: entry.probability ?? 100,
    preventIncoming: entry.recursion?.prevent_incoming ?? false,
    preventOutgoing: entry.recursion?.prevent_outgoing ?? false,
  };
}

export function applyEditDraftToEntry(entry: WorldbookEntry, draft: EntryEditDraft): void {
  entry.name = draft.name.trim();
  entry.enabled = draft.enabled;
  entry.content = draft.content;
  entry.probability = Math.min(100, Math.max(0, Number(draft.probability) || 0));

  if (!entry.strategy) {
    entry.strategy = {
      type: 'selective',
      keys: [],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    };
  }
  entry.strategy.type = draft.strategyType;
  entry.strategy.keys = keysTextToArray(draft.keysText);
  if (!entry.strategy.keys_secondary) {
    entry.strategy.keys_secondary = { logic: 'and_any', keys: [] };
  }
  entry.strategy.keys_secondary.logic = draft.keysSecondaryLogic;
  entry.strategy.keys_secondary.keys = keysTextToArray(draft.keysSecondaryText);
  const sd = draft.scanDepth.trim();
  entry.strategy.scan_depth = sd === 'same_as_global' || sd === '' ? 'same_as_global' : Number(sd) || 1;

  if (!entry.position) {
    entry.position = { type: 'after_character_definition', role: 'system', depth: 0, order: 100 };
  }
  entry.position.type = draft.positionType;
  entry.position.role = draft.positionRole;
  entry.position.depth = Number(draft.positionDepth) || 0;
  entry.position.order = Number(draft.positionOrder) || 0;

  if (!entry.recursion) {
    entry.recursion = { prevent_incoming: false, prevent_outgoing: false, delay_until: null };
  }
  entry.recursion.prevent_incoming = draft.preventIncoming;
  entry.recursion.prevent_outgoing = draft.preventOutgoing;
}
