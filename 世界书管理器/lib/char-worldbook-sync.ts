import _ from 'lodash';
import type { BindingIndex, WorldbookBindingInfo } from './binding';
import { parseCharWorldbooksFromCharData, resolveCharWorldbooks } from './char-worldbook';
import { safeCharacterNames, safeCharacterNamesAsync, safeWorldbookNames } from './tavern-safe';
import { deleteWorldbookWithCleanup } from './worldbook-ops';
import { isCharWorldbookSyncPaused, isExpectedWorldbookRename } from './worldbook-sync-guard';

type CharWorldbookSnapshot = {
  primary: string | null;
  additional: string[];
};

export type CharWorldbookSyncDeps = {
  getBindingIndex: () => BindingIndex;
  applyDeletedBookByName: (name: string) => Promise<void>;
  scheduleBindingRefresh: () => void;
  safeWorldbookNames: () => string[];
};

const RECENTLY_DELETED_CHAR_TTL_MS = 60_000;
const recentlyDeletedCharKeys = new Map<string, number>();
/** 打开角色编辑器时缓存的主/附世界书，供 CHARACTER_EDITED 对比 */
const editorWorldbookSnapshots = new Map<string, CharWorldbookSnapshot>();

function normalizeEventKey(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function markCharacterDeleted(id?: unknown, name?: unknown) {
  const now = Date.now();
  const idKey = normalizeEventKey(id);
  const nameKey = normalizeEventKey(name);
  if (idKey) recentlyDeletedCharKeys.set(idKey, now);
  if (nameKey) recentlyDeletedCharKeys.set(nameKey, now);
}

function pruneRecentlyDeletedChars() {
  const now = Date.now();
  for (const [key, ts] of recentlyDeletedCharKeys) {
    if (now - ts > RECENTLY_DELETED_CHAR_TTL_MS) recentlyDeletedCharKeys.delete(key);
  }
}

function isRecentlyDeletedCharacter(id?: unknown, name?: unknown): boolean {
  pruneRecentlyDeletedChars();
  const idKey = normalizeEventKey(id);
  const nameKey = normalizeEventKey(name);
  return Boolean((idKey && recentlyDeletedCharKeys.has(idKey)) || (nameKey && recentlyDeletedCharKeys.has(nameKey)));
}

function extractCharacterEvent(result: unknown): { id?: unknown; character: SillyTavern.v1CharData } | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  const detail = r.detail as Record<string, unknown> | undefined;
  const character = (detail?.character ?? r.character) as SillyTavern.v1CharData | undefined;
  const id = detail?.id ?? r.id;
  if (!character || typeof character !== 'object') return null;
  return { id, character };
}

/** 由 CHARACTER_EDITOR_OPENED 的 chid 解析角色名（多为列表索引） */
function resolveCharNameByEditorId(chid: unknown): string | null {
  const key = normalizeEventKey(chid);
  if (!key) return null;
  const names = safeCharacterNames();
  const asIndex = Number(key);
  if (!Number.isNaN(asIndex) && Number.isInteger(asIndex) && asIndex >= 0 && asIndex < names.length) {
    return names[asIndex] ?? null;
  }
  if (names.includes(key)) return key;
  try {
    const current = getCurrentCharacterName();
    if (current && normalizeEventKey(current) === key) return current;
  } catch {
    /* ignore */
  }
  return null;
}

export async function snapshotCharacterWorldbooksForEditor(chid: unknown): Promise<void> {
  const charName = resolveCharNameByEditorId(chid);
  if (!charName) return;
  try {
    const { wb } = await resolveCharWorldbooks(charName, { deepScan: true });
    editorWorldbookSnapshots.set(charName, {
      primary: wb.primary,
      additional: [...wb.additional],
    });
  } catch (e) {
    console.warn('[世界书管理器] 缓存角色世界书绑定失败', charName, e);
  }
}

function resolveOldPrimaryWorldbook(charName: string, bindingIndex: BindingIndex): string | null {
  const snap = editorWorldbookSnapshots.get(charName);
  if (snap) {
    editorWorldbookSnapshots.delete(charName);
    return snap.primary;
  }
  for (const [wbName, info] of bindingIndex.entries()) {
    if (info.characters.some(c => c.name === charName && c.roles.includes('primary'))) {
      return wbName;
    }
  }
  return null;
}

async function isCharacterStillListed(name: string): Promise<boolean> {
  const names = await safeCharacterNamesAsync();
  return names.includes(name);
}

async function restoreCharacterPrimaryWorldbook(charName: string, oldPrimaryWb: string | null): Promise<void> {
  await updateCharacterWith(charName, char => {
    const next = _.cloneDeep(char);
    next.worldbook = oldPrimaryWb;
    const rawAny = next as any;
    if (rawAny.character_book === oldPrimaryWb) {
      // keep
    } else if (rawAny.character_book && typeof rawAny.character_book === 'object') {
      rawAny.character_book.name = oldPrimaryWb || '';
    } else {
      rawAny.character_book = oldPrimaryWb;
    }
    if (rawAny.data) {
      rawAny.data.character_book = oldPrimaryWb;
      if (rawAny.data.extensions) {
        rawAny.data.extensions.world = oldPrimaryWb || '';
      }
    }
    if (next.extensions) {
      next.extensions.world = oldPrimaryWb || '';
    }
    return next;
  });
}

export function createCharWorldbookSyncHandlers(deps: CharWorldbookSyncDeps) {
  async function handleCharacterDeleted(result: unknown) {
    try {
      const parsed = extractCharacterEvent(result);
      if (!parsed) return;
      const char = parsed.character;
      const charName = normalizeEventKey(char.name);
      if (!charName) return;
      markCharacterDeleted(parsed.id, charName);
      editorWorldbookSnapshots.delete(charName);

      const wbInfo = parseCharWorldbooksFromCharData(char);
      const primaryWb = wbInfo.primary;
      if (!primaryWb) {
        deps.scheduleBindingRefresh();
        return;
      }

      if (!deps.safeWorldbookNames().includes(primaryWb)) {
        deps.scheduleBindingRefresh();
        return;
      }

      const info = deps.getBindingIndex().get(primaryWb);
      const otherChars = info ? info.characters.filter(c => c.name !== charName) : [];

      let msg = '';
      if (otherChars.length === 0) {
        msg =
          `检测到角色「${charName}」已删除。<br/>` +
          `是否也删除其关联的主要世界书「${primaryWb}」（该世界书目前没有其他角色使用）？<br/><br/>` +
          `<b>此操作不可撤销。</b>`;
      } else {
        msg =
          `检测到角色「${charName}」已删除。<br/>` +
          `其关联的主要世界书「${primaryWb}」仍被其他角色（${otherChars.map(c => c.name).join('、')}）关联。<br/><br/>` +
          `<b>确定仍要删除「${primaryWb}」吗？（此操作不可撤销）</b>`;
      }

      const confirmRes = await SillyTavern.callGenericPopup(msg, SillyTavern.POPUP_TYPE.CONFIRM, '', {
        okButton: '确定删除',
        cancelButton: '保留世界书',
      });

      if (confirmRes === SillyTavern.POPUP_RESULT.AFFIRMATIVE) {
        try {
          const deletedCharAvatar = typeof char.avatar === 'string' ? char.avatar.replace(/\.[^/.]+$/, '') : null;
          const ok = await deleteWorldbookWithCleanup(primaryWb, { deletedCharAvatar });
          if (ok) {
            toastr.success(`已删除角色「${charName}」关联的主要世界书「${primaryWb}」`);
            await deps.applyDeletedBookByName(primaryWb);
          } else {
            toastr.error(`删除主要世界书「${primaryWb}」失败`);
          }
        } catch (e) {
          console.error(`删除关联主要世界书失败: ${primaryWb}`, e);
          toastr.error(`删除主要世界书「${primaryWb}」时出错`);
        }
      }

      deps.scheduleBindingRefresh();
    } catch (e) {
      console.error('[世界书管理器] 处理角色删除事件失败', e);
    }
  }

  async function handleCharacterEdited(result: unknown) {
    try {
      const parsed = extractCharacterEvent(result);
      if (!parsed) return;

      const newChar = parsed.character;
      const charName = normalizeEventKey(newChar.name);
      if (!charName) return;
      if (isRecentlyDeletedCharacter(parsed.id, charName)) return;
      if (!(await isCharacterStillListed(charName))) return;
      if (isCharWorldbookSyncPaused()) return;

      deps.scheduleBindingRefresh();

      const oldPrimaryWb = resolveOldPrimaryWorldbook(charName, deps.getBindingIndex());
      const newWbInfo = parseCharWorldbooksFromCharData(newChar);
      const newPrimaryWb = newWbInfo.primary;

      if (oldPrimaryWb === newPrimaryWb) return;
      if (isExpectedWorldbookRename(oldPrimaryWb, newPrimaryWb)) return;
      // 主世界书被清空（删除角色卡或主动解绑）时不弹「还原绑定」
      if (newPrimaryWb === null) return;

      const msg =
        `检测到角色「${charName}」更新后，其绑定的主世界书发生了变化：<br/>` +
        `- 原绑定：「${oldPrimaryWb || '无'}」<br/>` +
        `- 新绑定：「${newPrimaryWb || '无'}」<br/><br/>` +
        `是否同意替换为新世界书绑定？<br/>（选择「取消」将还原为原世界书绑定）`;

      const confirmRes = await SillyTavern.callGenericPopup(msg, SillyTavern.POPUP_TYPE.CONFIRM, '', {
        okButton: '同意替换',
        cancelButton: '还原原绑定',
      });

      if (confirmRes !== SillyTavern.POPUP_RESULT.AFFIRMATIVE) {
        if (isRecentlyDeletedCharacter(parsed.id, charName) || !(await isCharacterStillListed(charName))) {
          return;
        }
        try {
          await restoreCharacterPrimaryWorldbook(charName, oldPrimaryWb);
          toastr.success(`已恢复角色「${charName}」原有的世界书绑定「${oldPrimaryWb || '无'}」`);
          deps.scheduleBindingRefresh();
        } catch (e) {
          console.error(`恢复角色世界书绑定失败: ${charName}`, e);
          toastr.error(`还原原世界书绑定失败，请手动在角色卡中检查`);
        }
      } else {
        toastr.success(`角色「${charName}」已更新主世界书绑定为「${newPrimaryWb || '无'}」`);
      }
    } catch (e) {
      console.error('[世界书管理器] 处理角色编辑事件失败', e);
    }
  }

  return {
    handleCharacterDeleted,
    handleCharacterEdited,
  };
}

function buildRenameWorldbookConfirmHtml(oldName: string, newName: string, bindingIndex: BindingIndex): string {
  const info: WorldbookBindingInfo = bindingIndex.get(oldName) ?? {
    charBound: false,
    characters: [],
    chatLore: [],
    chatLoreBound: false,
    globalEnabled: false,
    currentChatBound: false,
    currentCharPrimary: false,
    currentCharAdditional: false,
  };

  const lines: string[] = [
    `将世界书「${oldName}」重命名为「${newName}」。`,
    '<br/>以下绑定将<strong>自动更新</strong>为新名称：',
  ];

  if (info.globalEnabled) lines.push('· 全局开启');
  if (info.currentChatBound) lines.push('· 当前聊天世界书');
  if (info.chatLore.length > 0) {
    info.chatLore.forEach(c => lines.push(`· 聊天 Lore：${c.name}（${c.chatCount} 个聊天）`));
  }
  if (info.characters.length === 0) {
    lines.push('· （无角色卡绑定，仅重命名世界书文件）');
  } else {
    info.characters.forEach(c => {
      lines.push(`· 角色「${c.name}」（${c.roles.join('、')}）`);
    });
  }

  const targetInfo = bindingIndex.get(newName);
  const targetExists = newName !== oldName && safeWorldbookNames().includes(newName);
  if (targetExists && targetInfo?.charBound && !info.charBound) {
    const bound = targetInfo.characters.map(c => `${c.name}(${c.roles.includes('primary') ? '主' : '附'})`).join('、');
    lines.push(
      `<br/><span style="color:#e6a817">⚠ 「${newName}」已存在且绑定了角色（${bound}）。当前选中的「${oldName}」<strong>未绑定</strong>角色——若你意在完成重命名，请取消后改选带「(主)」标记的那本再操作。</span>`,
    );
  }

  lines.push('<br/><b>确定继续？</b>');
  return lines.join('<br/>');
}

/** 重命名前弹出酒馆原生确认框；返回 true 表示用户确认 */
export async function confirmRenameWorldbookWithPopup(
  oldName: string,
  newName: string,
  bindingIndex: BindingIndex,
): Promise<boolean> {
  const msg = buildRenameWorldbookConfirmHtml(oldName, newName, bindingIndex);
  const res = await SillyTavern.callGenericPopup(msg, SillyTavern.POPUP_TYPE.CONFIRM, '', {
    okButton: '确定重命名',
    cancelButton: '取消',
  });
  return res === SillyTavern.POPUP_RESULT.AFFIRMATIVE;
}
