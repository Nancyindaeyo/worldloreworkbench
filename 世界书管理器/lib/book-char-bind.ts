import type { CharWorldbooks } from './char-worldbook';
import { resolveCharWorldbooks, resolveMaybeAsync } from './char-worldbook';
import { getCharAvatarBasename, isCurrentCharacterName } from './chat-lore-scan';
import { hasOpenChat, safeCharWorldbookNamesAsync } from './tavern-safe';

export type CharBindMode = 'primary' | 'additional' | 'chat';
export type CharBindAction = 'bind' | 'unbind';

export type CharBindRequest = {
  bookNames: string[];
  charNames: string[];
  mode: CharBindMode;
  action: CharBindAction;
};

export type CharBindResult = {
  ok: string[];
  skipped: string[];
  errors: string[];
};

function requestHeaders(): Record<string, string> {
  try {
    return SillyTavern.getRequestHeaders();
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

type CharLoreEntry = { name: string; extraBooks: string[] };

export async function readWorldInfoCharLore(): Promise<CharLoreEntry[]> {
  try {
    const res = await fetch('/api/settings/get', {
      method: 'POST',
      headers: requestHeaders(),
      cache: 'no-cache',
    });
    if (!res.ok) return [];
    const settings = await res.json();
    const worldInfo = settings?.world_info_settings?.world_info ?? settings?.world_info;
    const charLore = worldInfo?.charLore;
    return Array.isArray(charLore) ? (charLore as CharLoreEntry[]) : [];
  } catch (e) {
    console.warn('[世界书管理器] 读取 charLore 设置失败', e);
    return [];
  }
}

export async function writeWorldInfoCharLore(charLore: CharLoreEntry[]): Promise<void> {
  const res = await fetch('/api/settings/get', {
    method: 'POST',
    headers: requestHeaders(),
    cache: 'no-cache',
  });
  if (!res.ok) throw new Error('无法读取酒馆设置');
  const settings = await res.json();
  if (!settings.world_info_settings) settings.world_info_settings = {};
  if (!settings.world_info_settings.world_info) settings.world_info_settings.world_info = {};
  settings.world_info_settings.world_info.charLore = charLore;
  const saveRes = await fetch('/api/settings/save', {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify(settings),
    cache: 'no-cache',
  });
  if (!saveRes.ok) throw new Error('保存 charLore 设置失败');
}

/** 将角色卡主/附世界书写入酒馆（含 charLore 附加绑定） */
export async function applyCharWorldbookBinding(
  charName: string,
  wb: CharWorldbooks,
  options?: { skipPrimary?: boolean },
): Promise<void> {
  if (isCurrentCharacterName(charName)) {
    if (!options?.skipPrimary) {
      await rebindCharWorldbooks('current', wb);
    } else if (wb.additional !== undefined) {
      const current = await resolveCharWorldbooks(charName, { deepScan: true });
      await rebindCharWorldbooks('current', {
        primary: current.wb.primary,
        additional: wb.additional,
      });
    }
    return;
  }

  if (!options?.skipPrimary && wb.primary !== undefined) {
    await (updateCharacterWith as (
      name: string,
      updater: (char: Character) => Character,
      opts?: { render?: 'none' | 'debounced' | 'immediate' },
    ) => Promise<Character>)(charName, char => {
      char.worldbook = wb.primary;
      if (!char.extensions) char.extensions = {} as Character['extensions'];
      if (wb.primary) {
        char.extensions.world = wb.primary;
      } else {
        delete char.extensions.world;
      }
      return char;
    }, { render: 'none' });
  }

  if (wb.additional !== undefined) {
    const basename = getCharAvatarBasename(charName);
    if (!basename) throw new Error(`无法读取角色卡「${charName}」头像 ID`);
    const charLore = await readWorldInfoCharLore();
    const idx = charLore.findIndex(e => e.name === basename);
    if (wb.additional.length === 0) {
      if (idx >= 0) charLore.splice(idx, 1);
    } else if (idx === -1) {
      charLore.push({ name: basename, extraBooks: [...wb.additional] });
    } else {
      charLore[idx].extraBooks = [...wb.additional];
    }
    await writeWorldInfoCharLore(charLore);
  }
}

async function readCharWorldbooks(charName: string): Promise<CharWorldbooks> {
  const { wb } = await resolveCharWorldbooks(charName, { deepScan: true });
  return {
    primary: wb.primary,
    additional: [...wb.additional],
  };
}

async function bindWorldLore(charName: string, bookNames: string[], mode: 'primary' | 'additional'): Promise<void> {
  const current = await readCharWorldbooks(charName);
  if (mode === 'primary') {
    const primary = bookNames[bookNames.length - 1] ?? null;
    await applyCharWorldbookBinding(charName, {
      primary,
      additional: current.additional,
    });
    return;
  }
  const additional = [...new Set([...current.additional, ...bookNames])].filter(n => n !== current.primary);
  await applyCharWorldbookBinding(charName, {
    primary: current.primary,
    additional,
  });
}

async function unbindWorldLore(charName: string, bookNames: string[], mode: 'primary' | 'additional'): Promise<void> {
  const current = await readCharWorldbooks(charName);
  const remove = new Set(bookNames);
  if (mode === 'primary') {
    const primary = current.primary && remove.has(current.primary) ? null : current.primary;
    await applyCharWorldbookBinding(charName, {
      primary,
      additional: current.additional.filter(n => !remove.has(n)),
    });
    return;
  }
  await applyCharWorldbookBinding(charName, {
    primary: current.primary,
    additional: current.additional.filter(n => !remove.has(n)),
  });
}

async function bindChatLore(bookName: string): Promise<void> {
  if (!hasOpenChat()) throw new Error('请先打开一个聊天，再绑定聊天世界书');
  await rebindChatWorldbook('current', bookName);
}

async function unbindChatLore(bookName: string): Promise<void> {
  if (!hasOpenChat()) throw new Error('请先打开一个聊天，再解绑聊天世界书');
  const current = await resolveMaybeAsync(getChatWorldbookName('current'));
  if (current !== bookName) return;
  const unset = setChatLorebook as (lorebook: string | null) => Promise<void>;
  await unset(null);
}

export async function applyCharBookBinding(req: CharBindRequest): Promise<CharBindResult> {
  const result: CharBindResult = { ok: [], skipped: [], errors: [] };
  const books = [...new Set(req.bookNames.filter(Boolean))];
  const chars = [...new Set(req.charNames.filter(Boolean))];

  if (books.length === 0) {
    result.errors.push('未选择世界书');
    return result;
  }
  if (chars.length === 0 && req.mode !== 'chat') {
    result.errors.push('未选择角色卡');
    return result;
  }

  if (req.mode === 'chat') {
    if (books.length > 1 && req.action === 'bind') {
      result.errors.push('聊天世界书一次只能绑定一本');
      return result;
    }
    const book = books[0];
    try {
      if (req.action === 'bind') {
        await bindChatLore(book);
        result.ok.push(`已绑定聊天世界书：${book}`);
      } else {
        await unbindChatLore(book);
        result.ok.push(`已解绑聊天世界书：${book}`);
      }
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
    return result;
  }

  for (const charName of chars) {
    try {
      if (req.action === 'bind') {
        await bindWorldLore(charName, books, req.mode);
        result.ok.push(`${charName}：已绑定 ${books.join('、')}（${req.mode === 'primary' ? '主' : '附'}）`);
      } else {
        await unbindWorldLore(charName, books, req.mode);
        result.ok.push(`${charName}：已解绑 ${books.join('、')}（${req.mode === 'primary' ? '主' : '附'}）`);
      }
    } catch (e) {
      result.errors.push(`${charName}：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

/** 预览：所选世界书在各角色卡上的现有绑定 */
export async function previewCharBindState(
  _bookNames: string[],
  charNames: string[],
): Promise<{ charName: string; primary: string | null; additional: string[] }[]> {
  const out: { charName: string; primary: string | null; additional: string[] }[] = [];
  for (const charName of charNames) {
    const wb = await safeCharWorldbookNamesAsync(charName);
    out.push({ charName, primary: wb.primary, additional: [...wb.additional] });
  }
  return out;
}
