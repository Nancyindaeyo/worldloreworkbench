import { normalizeCharWorldbooks, resolveCharWorldbooks, resolveMaybeAsync } from './char-worldbook';

export { normalizeCharWorldbooks, resolveCharWorldbooks, resolveMaybeAsync } from './char-worldbook';

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof value === 'object' && typeof (value as PromiseLike<unknown>).then === 'function');
}

/** 是否已打开聊天（全局模式 / 角色列表页为 false） */
export function hasOpenChat(): boolean {
  try {
    return Boolean(SillyTavern.getCurrentChatId());
  } catch {
    return false;
  }
}

export function hasCurrentCharacter(): boolean {
  try {
    return Boolean(getCurrentCharacterName());
  } catch {
    return false;
  }
}

/** 酒馆中全部世界书名称（整理器核心数据源） */
export function safeWorldbookNames(): string[] {
  try {
    const names = getWorldbookNames();
    return Array.isArray(names) ? names.filter((n): n is string => Boolean(n)) : [];
  } catch (e) {
    console.warn('[世界书管理器] getWorldbookNames 失败', e);
    return [];
  }
}

export async function safeCharacterNamesAsync(): Promise<string[]> {
  try {
    const names = await resolveMaybeAsync(getCharacterNames());
    return Array.isArray(names) ? names.filter((n): n is string => Boolean(n)) : [];
  } catch (e) {
    console.warn('[世界书管理器] getCharacterNames 失败', e);
    return [];
  }
}

export function safeCharacterNames(): string[] {
  try {
    const names = getCharacterNames();
    if (isThenable(names)) {
      console.warn('[世界书管理器] getCharacterNames 返回 Promise，请使用 safeCharacterNamesAsync');
      return [];
    }
    return Array.isArray(names) ? names.filter((n): n is string => Boolean(n)) : [];
  } catch {
    return [];
  }
}

export function safeGlobalWorldbookNames(): string[] {
  try {
    const names = getGlobalWorldbookNames();
    return Array.isArray(names) ? names.filter((n): n is string => Boolean(n)) : [];
  } catch {
    return [];
  }
}

/** 仅在有聊天时查询；无聊天时绝不调用 getChatWorldbookName */
export async function safeChatWorldbookName(): Promise<string | null> {
  if (!hasOpenChat()) return null;
  try {
    const fromApi = await resolveMaybeAsync(getChatWorldbookName('current'));
    if (fromApi) return fromApi;
  } catch {
    /* ignore and try fallback */
  }
  try {
    if (
      typeof SillyTavern !== 'undefined' &&
      SillyTavern.chatMetadata &&
      typeof SillyTavern.chatMetadata.world_info === 'string'
    ) {
      return SillyTavern.chatMetadata.world_info.trim() || null;
    }
  } catch {
    /* ignore fallback */
  }
  return null;
}

/** @deprecated 请使用 resolveCharWorldbooks */
export async function safeCharWorldbookNamesAsync(
  charName: string,
): Promise<{ primary: string | null; additional: string[] }> {
  const { wb } = await resolveCharWorldbooks(charName);
  return wb;
}

export async function safeCurrentCharWorldbookNames(): Promise<{
  primary: string | null;
  additional: string[];
} | null> {
  if (!hasOpenChat() || !hasCurrentCharacter()) return null;
  try {
    const wb = normalizeCharWorldbooks(await resolveMaybeAsync(getCharWorldbookNames('current')));
    return wb;
  } catch {
    return null;
  }
}
