import { hasEjsMarkers, renderEjsForCurrentStage, validateEjsEntry } from './entry-ejs';

/** 条目正文字段（注入提示词的主体） */
export function entryContentForTokenCount(entry: WorldbookEntry): string {
  return entry.content ?? '';
}

export type EntryTokenInfo = {
  raw: number | null;
  effective: number | null;
  ejsOk: boolean | null;
  ejsError: string;
};

export const TOKEN_COUNT_HINT =
  '按酒馆 tokenizer 统计正文 tk。含 EJS 时「→」后为当前上下文渲染结果；实际注入还受绿灯、预算等影响。EJS 异常时 tk 后标 !';

export async function countTextTokens(text: string): Promise<number | null> {
  if (!text) return 0;
  try {
    const counter = SillyTavern?.getTokenCountAsync;
    if (typeof counter !== 'function') return null;
    return await counter(text);
  } catch (e) {
    console.warn('[世界书管理器] getTokenCountAsync 失败', e);
    return null;
  }
}

export async function countEntryRawTokens(entry: WorldbookEntry): Promise<number | null> {
  return countTextTokens(entryContentForTokenCount(entry));
}

export async function countEntryEffectiveTokens(entry: WorldbookEntry): Promise<number | null> {
  const content = entryContentForTokenCount(entry);
  if (!content) return 0;
  if (!hasEjsMarkers(content)) return countTextTokens(content);
  const rendered = await renderEjsForCurrentStage(content);
  if (!rendered.ok) return null;
  return countTextTokens(rendered.output);
}

export async function countEntryTokens(entry: WorldbookEntry): Promise<EntryTokenInfo> {
  const raw = await countEntryRawTokens(entry);
  let effective: number | null = raw;
  let ejsOk: boolean | null = null;
  let ejsError = '';

  if (hasEjsMarkers(entry.content ?? '')) {
    const v = await validateEjsEntry(entry.content ?? '');
    ejsOk = v.ok;
    ejsError = v.error;
    effective = await countEntryEffectiveTokens(entry);
  }

  return { raw, effective, ejsOk, ejsError };
}

export async function sumEntryRawTokens(entries: WorldbookEntry[]): Promise<{ total: number | null; enabled: number | null }> {
  let total: number | null = 0;
  let enabled: number | null = 0;
  for (const e of entries) {
    const raw = await countEntryRawTokens(e);
    if (raw == null) return { total: null, enabled: null };
    total += raw;
    if (e.enabled) enabled += raw;
  }
  return { total, enabled };
}

export async function sumEntryTokens(entries: WorldbookEntry[]): Promise<{ total: number | null; enabled: number | null }> {
  return sumEntryRawTokens(entries);
}

export function formatTokenCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '…';
  return Math.round(n).toLocaleString('zh-CN');
}

export function formatEntryTokenLine(info: EntryTokenInfo | undefined): string {
  if (!info || (info.raw == null && info.effective == null)) return '… tk';
  const raw = info.raw != null ? formatTokenCount(info.raw) : '…';
  const errFlag = info.ejsOk === false ? ' !' : '';
  if (info.effective == null || info.effective === info.raw) return `${raw} tk${errFlag}`;
  return `${raw} → ${formatTokenCount(info.effective)} tk${errFlag}`;
}

export function entryTokenTitle(info: EntryTokenInfo | undefined): string {
  if (!info) return TOKEN_COUNT_HINT;
  const parts = [TOKEN_COUNT_HINT];
  if (info.raw != null) parts.push(`原文: ${formatTokenCount(info.raw)} tk`);
  if (info.effective != null && info.effective !== info.raw) {
    parts.push(`当前阶段: ${formatTokenCount(info.effective)} tk`);
  }
  if (info.ejsOk === false && info.ejsError) parts.push(`EJS 问题: ${info.ejsError}`);
  return parts.join('\n');
}

export function entryTokenHasError(info: EntryTokenInfo | undefined): boolean {
  return info?.ejsOk === false;
}
