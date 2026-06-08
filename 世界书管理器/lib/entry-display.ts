/** 世界书条目展示（仿酒馆原生蓝绿灯、深度等） */

export function entryStrategyType(entry: WorldbookEntry): 'constant' | 'selective' | 'vectorized' {
  return entry.strategy?.type ?? 'selective';
}

export function entryLampClass(entry: WorldbookEntry): string {
  const t = entryStrategyType(entry);
  if (t === 'constant') return 'wm-lamp wm-lamp--blue';
  if (t === 'selective') return 'wm-lamp wm-lamp--green';
  return 'wm-lamp wm-lamp--gray';
}

export function entryLampTitle(entry: WorldbookEntry): string {
  const t = entryStrategyType(entry);
  const status = entry.enabled ? '已启用' : '已禁用';
  if (t === 'constant') return `蓝灯 · 常量（constant） · ${status}`;
  if (t === 'selective') return `绿灯 · 可选项（selective） · ${status}`;
  return `向量化（vectorized） · ${status}`;
}

const POSITION_LABELS: Record<string, string> = {
  before_character_definition: '角色定义前',
  after_character_definition: '角色定义后',
  before_example_messages: '示例消息前',
  after_example_messages: '示例消息后',
  before_author_note: '作者注释前',
  after_author_note: '作者注释后',
  at_depth: '指定深度',
  outlet: 'Outlet',
};

export function entryPositionLabel(entry: WorldbookEntry): string {
  const p = entry.position?.type ?? 'after_character_definition';
  return POSITION_LABELS[p] ?? p;
}

export function entryDepthLabel(entry: WorldbookEntry): string {
  const scan = entry.strategy?.scan_depth;
  const scanText =
    scan === 'same_as_global' || scan === undefined ? '扫描=全局' : `扫描深度 ${scan}`;
  if (entry.position?.type === 'at_depth') {
    const role = entry.position.role ?? 'system';
    return `${scanText} · 插入深度 ${entry.position.depth ?? 0} (${role})`;
  }
  return scanText;
}

export function entryKeysPreview(entry: WorldbookEntry): string {
  const keys = entry.strategy?.keys ?? [];
  if (!keys.length) return '';
  const text = keys
    .slice(0, 4)
    .map(k => (typeof k === 'string' ? k : String(k)))
    .join('、');
  return keys.length > 4 ? `${text}…` : text;
}
