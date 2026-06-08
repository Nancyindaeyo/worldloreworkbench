/** 根据背景色选择可读的文字颜色 */
export function tagTextOnColor(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.58 ? '#1e293b' : '#ffffff';
}

/** 世界书卡片上的标签胶囊（实心，高对比） */
export function bookTagChipStyle(colorHex: string | undefined): Record<string, string> {
  const color = colorHex && /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : '#6366f1';
  return {
    backgroundColor: color,
    borderColor: color,
    color: tagTextOnColor(color),
  };
}

/** 筛选/批量面板中的标签芯片（可选中态） */
export function tagChipStyleForList(
  colorHex: string | undefined,
  active: boolean,
): Record<string, string> {
  const color = colorHex && /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : '#6366f1';
  if (active) {
    return {
      backgroundColor: color,
      borderColor: color,
      color: tagTextOnColor(color),
      fontWeight: '600',
    };
  }
  return {
    backgroundColor: `${color}40`,
    borderColor: color,
    color,
    fontWeight: '500',
  };
}
