import type { BindingScanReport } from './binding-scan';
import type { ChatLoreBindingEntry } from './chat-lore-scan';
import { buildChatLoreIndex } from './chat-lore-scan';
import { isValidCharacterNameForBinding, resolveCharWorldbooks, yieldToUi } from './char-worldbook';
import {
  hasOpenChat,
  safeCharacterNamesAsync,
  safeChatWorldbookName,
  safeCurrentCharWorldbookNames,
  safeGlobalWorldbookNames,
  safeWorldbookNames,
} from './tavern-safe';

export type CharBindingRole = 'primary' | 'additional';

export type WorldbookBindingInfo = {
  charBound: boolean;
  characters: { name: string; roles: CharBindingRole[] }[];
  chatLore: ChatLoreBindingEntry[];
  chatLoreBound: boolean;
  globalEnabled: boolean;
  currentChatBound: boolean;
  currentCharPrimary: boolean;
  currentCharAdditional: boolean;
};

export type BindingIndex = Map<string, WorldbookBindingInfo>;

function cloneBindingIndex(source: BindingIndex): BindingIndex {
  const next = new Map<string, WorldbookBindingInfo>();
  for (const [k, v] of source) {
    next.set(k, {
      ...v,
      characters: v.characters.map(c => ({ name: c.name, roles: [...c.roles] })),
      chatLore: v.chatLore.map(e => ({ ...e })),
    });
  }
  return next;
}

function resetBookBindingForRescan(info: WorldbookBindingInfo, deepScan: boolean) {
  info.characters = [];
  info.charBound = false;
  if (deepScan) {
    info.chatLore = [];
    info.chatLoreBound = false;
  }
}

function refreshTavernFlagsOnInfo(
  info: WorldbookBindingInfo,
  name: string,
  globalSet: Set<string>,
  chatName: string | null,
  currentCharWb: Awaited<ReturnType<typeof safeCurrentCharWorldbookNames>>,
) {
  info.globalEnabled = globalSet.has(name);
  info.currentChatBound = hasOpenChat() && chatName === name;
  info.currentCharPrimary = currentCharWb?.primary === name;
  info.currentCharAdditional = currentCharWb?.additional.includes(name) ?? false;
}

function emptyReport(): BindingScanReport {
  return {
    scannedAt: Date.now(),
    charCount: 0,
    charWithBinding: 0,
    boundBookCount: 0,
    apiHits: 0,
    legacyHits: 0,
    characterFallbackHits: 0,
    emptyChars: 0,
    warnings: [],
  };
}

/** 基于全部世界书 + 角色卡绑定构建索引（不依赖聊天） */
export async function buildBindingIndex(options?: {
  deepScan?: boolean;
  onProgress?: (done: number, total: number, label: string) => void;
  /** 增量刷新：在已有索引上合并，仅重扫 onlyBooks 中的书 */
  baseIndex?: BindingIndex;
  onlyBooks?: Set<string>;
}): Promise<{ index: BindingIndex; report: BindingScanReport }> {
  const index: BindingIndex = options?.baseIndex ? cloneBindingIndex(options.baseIndex) : new Map();
  const onlyBooks = options?.onlyBooks;
  const report = emptyReport();
  const globalSet = new Set(safeGlobalWorldbookNames());
  const chatName = await safeChatWorldbookName();
  const currentCharWb = await safeCurrentCharWorldbookNames();
  const deepScan = options?.deepScan ?? false;

  const ensure = (name: string): WorldbookBindingInfo => {
    let info = index.get(name);
    if (!info) {
      info = {
        charBound: false,
        characters: [],
        chatLore: [],
        chatLoreBound: false,
        globalEnabled: globalSet.has(name),
        currentChatBound: hasOpenChat() && chatName === name,
        currentCharPrimary: currentCharWb?.primary === name,
        currentCharAdditional: currentCharWb?.additional.includes(name) ?? false,
      };
      index.set(name, info);
    }
    return info;
  };

  for (const name of safeWorldbookNames()) {
    ensure(name);
  }

  if (onlyBooks) {
    for (const name of onlyBooks) {
      const info = index.get(name);
      if (info) resetBookBindingForRescan(info, deepScan);
    }
    for (const name of onlyBooks) {
      const info = index.get(name);
      if (info) refreshTavernFlagsOnInfo(info, name, globalSet, chatName, currentCharWb);
    }
  }

  const charNames = (await safeCharacterNamesAsync()).filter(isValidCharacterNameForBinding);
  report.charCount = charNames.length;
  const total = Math.max(charNames.length, 1);
  let scanned = 0;

  options?.onProgress?.(0, total, onlyBooks ? `准备刷新 ${onlyBooks.size} 本…` : '已读取世界书列表');
  await yieldToUi();

  if (charNames.length === 0) {
    options?.onProgress?.(1, 1, '无角色卡可扫描');
  }

  const BATCH = deepScan ? 6 : 12;
  for (let i = 0; i < charNames.length; i += BATCH) {
    const chunk = charNames.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async charName => {
        const { wb, via } = await resolveCharWorldbooks(charName, { deepScan });
        if (via === 'api') report.apiHits += 1;
        else if (via === 'legacy') report.legacyHits += 1;
        else if (via === 'charData' || via === 'character') report.characterFallbackHits += 1;
        else report.emptyChars += 1;

        const names: { name: string; role: CharBindingRole }[] = [];
        if (wb.primary) names.push({ name: wb.primary, role: 'primary' });
        wb.additional.forEach(n => names.push({ name: n, role: 'additional' }));
        if (names.length > 0) report.charWithBinding += 1;

        for (const { name, role } of names) {
          if (onlyBooks && !onlyBooks.has(name)) continue;
          const info = ensure(name);
          info.charBound = true;
          refreshTavernFlagsOnInfo(info, name, globalSet, chatName, currentCharWb);
          const existing = info.characters.find(c => c.name === charName);
          if (existing) {
            if (!existing.roles.includes(role)) existing.roles.push(role);
          } else {
            info.characters.push({ name: charName, roles: [role] });
          }
        }
      }),
    );
    scanned += chunk.length;
    options?.onProgress?.(
      Math.min(scanned, total),
      total,
      charNames.length > 0 ? `扫描角色卡 ${Math.min(scanned, charNames.length)}/${charNames.length}` : '完成',
    );
    await yieldToUi();
  }

  options?.onProgress?.(total, total, '完成');

  if (deepScan) {
    const chatIndex = await buildChatLoreIndex({
      charNames,
      onProgress: (done, chatTotal, label) => {
        options?.onProgress?.(total + done, total + chatTotal, label);
      },
    });
    for (const [bookName, entries] of chatIndex) {
      if (onlyBooks && !onlyBooks.has(bookName)) continue;
      const info = ensure(bookName);
      info.chatLore = entries;
      info.chatLoreBound = entries.length > 0;
    }
    report.chatLoreBookCount = [...index.values()].filter(i => i.chatLoreBound).length;
    report.chatLoreCharLinks = [...chatIndex.values()].reduce((n, list) => n + list.length, 0);
  }

  report.boundBookCount = [...index.values()].filter(i => i.charBound).length;
  report.scannedAt = Date.now();
  return { index, report };
}

/** 卡片上显示的角色卡绑定文案（多张用顿号列出名字） */
export function isBookCharOrChatBound(info: WorldbookBindingInfo): boolean {
  return info.charBound || info.chatLoreBound || info.currentChatBound;
}

export function formatBindingCharNames(info: WorldbookBindingInfo): string {
  if (!info.charBound || info.characters.length === 0) return '角色世界书：未绑定';
  const names = info.characters.map(c => {
    const hasPrimary = c.roles.includes('primary');
    const hasAdd = c.roles.includes('additional');
    if (hasPrimary && hasAdd) return `${c.name}(主+附)`;
    if (hasPrimary) return `${c.name}(主)`;
    if (hasAdd) return `${c.name}(附)`;
    return c.name;
  });
  return `角色世界书：${names.join('、')}`;
}

export function formatChatLoreBindingLine(info: WorldbookBindingInfo): string {
  if (info.chatLore.length === 0) {
    if (info.currentChatBound) return '聊天世界书：当前聊天';
    return '';
  }
  const parts = info.chatLore.map(e => (e.chatCount > 1 ? `${e.name}(${e.chatCount}聊)` : e.name));
  let line = `聊天世界书：${parts.join('、')}`;
  try {
    const currentChar = getCurrentCharacterName();
    if (info.currentChatBound && currentChar && !info.chatLore.some(e => e.name === currentChar)) {
      line += ' · 当前聊天';
    }
  } catch {
    /* 无当前角色卡时忽略 */
  }
  return line;
}

/** 绑定行数估算（虚拟列表行高） */
export function estimateBindingDisplayLines(info: WorldbookBindingInfo): number {
  let lines = 0;
  if (!info.charBound || info.characters.length === 0) lines += 1;
  else {
    const text = info.characters.map(c => c.name).join('、');
    lines += info.characters.length >= 3 || text.length > 24 ? 2 : 1;
  }
  if (info.chatLore.length > 0 || info.currentChatBound) {
    const chatText = info.chatLore.map(c => c.name).join('、');
    lines += info.chatLore.length >= 3 || chatText.length > 24 ? 2 : 1;
  }
  return Math.max(lines, 1);
}

export function formatBindingDetail(info: WorldbookBindingInfo): string {
  const lines: string[] = [];
  if (info.characters.length === 0) {
    lines.push('（未绑定角色世界书）');
  } else {
    info.characters.forEach(c => {
      lines.push(`• ${c.name}（角色世界书 · ${c.roles.join('、')}）`);
    });
  }
  if (info.chatLore.length === 0 && !info.currentChatBound) {
    lines.push('（无聊天世界书绑定）');
  } else {
    info.chatLore.forEach(c => {
      lines.push(`• ${c.name}（聊天世界书 · ${c.chatCount} 个聊天）`);
    });
    if (info.currentChatBound) lines.push('• 当前打开的聊天文件');
  }
  if (info.globalEnabled) lines.push('• 全局开启');
  return lines.join('\n');
}
