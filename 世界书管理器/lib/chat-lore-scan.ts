import { isValidCharacterNameForBinding, yieldToUi } from './char-worldbook';
import { safeCharacterNamesAsync } from './tavern-safe';

const CHAT_METADATA_WORLD_KEY = 'world_info';

export type ChatLoreBindingEntry = {
  name: string;
  chatCount: number;
  chatFiles: string[];
};

export type ChatLoreIndex = Map<string, ChatLoreBindingEntry[]>;

type ChatBriefWithMeta = {
  file_name: string;
  chat_metadata?: Record<string, unknown>;
};

function requestHeaders(): Record<string, string> {
  try {
    return SillyTavern.getRequestHeaders();
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

function avatarBasename(avatar: string): string {
  return avatar.replace(/\.[^/.]+$/, '');
}

async function fetchCharacterChatsWithMetadata(charName: string): Promise<ChatBriefWithMeta[]> {
  if (typeof getCharData !== 'function') return [];
  const card = getCharData(charName);
  if (!card?.avatar) return [];
  try {
    const res = await fetch('/api/characters/chats', {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify({ avatar_url: card.avatar, metadata: true }),
      cache: 'no-cache',
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((c): c is ChatBriefWithMeta => Boolean(c?.file_name));
  } catch (e) {
    console.warn('[世界书管理器] 读取聊天列表失败', charName, e);
    return [];
  }
}

function chatWorldbookName(chat: ChatBriefWithMeta): string | null {
  const meta = chat.chat_metadata;
  if (!meta || typeof meta !== 'object') return null;
  const wb = meta[CHAT_METADATA_WORLD_KEY];
  return typeof wb === 'string' && wb.trim() ? wb.trim() : null;
}

/** 扫描全部角色卡下聊天文件中的 Chat Lore 绑定 */
export async function buildChatLoreIndex(options?: {
  charNames?: string[];
  onProgress?: (done: number, total: number, label: string) => void;
}): Promise<ChatLoreIndex> {
  const index: ChatLoreIndex = new Map();
  const charNames = (options?.charNames ?? (await safeCharacterNamesAsync())).filter(isValidCharacterNameForBinding);
  const total = Math.max(charNames.length, 1);
  let done = 0;

  options?.onProgress?.(0, total, '准备扫描聊天世界书…');
  await yieldToUi();

  const BATCH = 4;
  for (let i = 0; i < charNames.length; i += BATCH) {
    const chunk = charNames.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async charName => {
        const chats = await fetchCharacterChatsWithMetadata(charName);
        const byBook = new Map<string, string[]>();
        for (const chat of chats) {
          const wb = chatWorldbookName(chat);
          if (!wb) continue;
          const list = byBook.get(wb) ?? [];
          list.push(chat.file_name);
          byBook.set(wb, list);
        }
        for (const [bookName, files] of byBook) {
          let entries = index.get(bookName);
          if (!entries) {
            entries = [];
            index.set(bookName, entries);
          }
          entries.push({ name: charName, chatCount: files.length, chatFiles: files });
        }
      }),
    );
    done += chunk.length;
    options?.onProgress?.(
      Math.min(done, total),
      total,
      charNames.length > 0 ? `扫描聊天世界书 ${Math.min(done, charNames.length)}/${charNames.length}` : '完成',
    );
    await yieldToUi();
  }

  options?.onProgress?.(total, total, '聊天世界书扫描完成');
  return index;
}

export function getCharAvatarBasename(charName: string): string | null {
  if (typeof getCharData !== 'function') return null;
  const card = getCharData(charName);
  if (!card?.avatar) return null;
  return avatarBasename(card.avatar);
}

/** 读取当前是否为该角色卡 */
export function isCurrentCharacterName(charName: string): boolean {
  try {
    const current = getCurrentCharacterName();
    return Boolean(current && current === charName);
  } catch {
    return false;
  }
}
