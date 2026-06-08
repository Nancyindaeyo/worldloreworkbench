import { applyCharWorldbookBinding } from './book-char-bind';
import type { BindingIndex } from './binding';
import { hasOpenChat, safeCharWorldbookNamesAsync, safeChatWorldbookName, safeGlobalWorldbookNames } from './tavern-safe';

export type CharWorldbooksSnapshot = {
  primary: string | null;
  additional: string[];
};

export type BindingUndoState = {
  globalNames: string[];
  chatWorldbook: string | null;
  charWorldbooks: Record<string, CharWorldbooksSnapshot>;
};

/** 删除前快照：全局列表、聊天绑定、涉及角色卡的完整世界书绑定 */
export async function captureBindingUndoState(
  bookNames: string[],
  bindingIndex: BindingIndex,
): Promise<BindingUndoState> {
  const charSet = new Set<string>();
  for (const name of bookNames) {
    bindingIndex.get(name)?.characters.forEach(c => charSet.add(c.name));
  }
  const charWorldbooks: Record<string, CharWorldbooksSnapshot> = {};
  for (const char of charSet) {
    const wb = await safeCharWorldbookNamesAsync(char);
    charWorldbooks[char] = {
      primary: wb.primary,
      additional: [...wb.additional],
    };
  }
  return {
    globalNames: [...safeGlobalWorldbookNames()],
    chatWorldbook: await safeChatWorldbookName(),
    charWorldbooks,
  };
}

/** 恢复世界书文件后，写回角色卡 / 全局 / 聊天绑定 */
export async function restoreBindingUndoState(state: BindingUndoState): Promise<void> {
  await rebindGlobalWorldbooks([...state.globalNames]);

  if (hasOpenChat() && state.chatWorldbook) {
    try {
      await rebindChatWorldbook('current', state.chatWorldbook);
    } catch (e) {
      console.warn('[世界书管理器] 恢复聊天世界书绑定失败', e);
    }
  }

  for (const [charName, wb] of Object.entries(state.charWorldbooks)) {
    try {
      await applyCharWorldbookBinding(charName, wb);
    } catch (e) {
      console.warn('[世界书管理器] 恢复角色卡世界书绑定失败', charName, e);
    }
  }
}
