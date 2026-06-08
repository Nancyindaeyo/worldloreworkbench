export type BindingScanReport = {
  scannedAt: number;
  charCount: number;
  charWithBinding: number;
  boundBookCount: number;
  chatLoreBookCount?: number;
  chatLoreCharLinks?: number;
  apiHits: number;
  legacyHits: number;
  characterFallbackHits: number;
  emptyChars: number;
  warnings: string[];
};

export function summarizeBindingScan(report: BindingScanReport): string {
  const parts = [
    `扫描 ${report.charCount} 张角色卡`,
    `${report.boundBookCount} 本有角色世界书绑定`,
  ];
  if (report.chatLoreBookCount != null && report.chatLoreBookCount > 0) {
    parts.push(`${report.chatLoreBookCount} 本有聊天世界书`);
  }
  if (report.characterFallbackHits > 0 || report.legacyHits > 0) {
    parts.push(`其中 ${report.legacyHits + report.characterFallbackHits} 张经回退读取`);
  }
  return parts.join('，');
}

export function bindingScanWarnings(report: BindingScanReport): string[] {
  const warnings = [...report.warnings];
  if (report.charCount === 0) {
    warnings.push('未读取到任何角色卡，绑定信息可能不完整；请确认酒馆助手已加载完成后再刷新');
  } else if (report.boundBookCount === 0 && report.charWithBinding === 0) {
    warnings.push('所有世界书均显示未绑定；若实际有绑定，请尝试刷新绑定或更新酒馆助手');
  }
  return warnings;
}

export function formatBindingStatusMessage(report: BindingScanReport): {
  kind: 'ok' | 'warn';
  lines: string[];
} {
  const lines = [summarizeBindingScan(report)];
  const warnings = bindingScanWarnings(report);
  if (warnings.length) {
    lines.push(...warnings);
  }
  return { kind: warnings.length ? 'warn' : 'ok', lines };
}
