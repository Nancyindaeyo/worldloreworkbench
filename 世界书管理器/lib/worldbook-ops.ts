import _ from 'lodash';
import type { CharBindingRole, WorldbookBindingInfo } from './binding';
import { formatBindingDetail } from './binding';
import {
  applyCharBookBinding,
  applyCharWorldbookBinding,
  readWorldInfoCharLore,
  writeWorldInfoCharLore,
} from './book-char-bind';
import type { CharWorldbooks } from './char-worldbook';
import { parseCharWorldbooksFromCharData, resolveCharWorldbooks, resolveMaybeAsync, yieldToUi } from './char-worldbook';
import { getCharAvatarBasename } from './chat-lore-scan';
import {
  hasOpenChat,
  safeCharacterNamesAsync,
  safeChatWorldbookName,
  safeGlobalWorldbookNames,
  safeWorldbookNames,
} from './tavern-safe';
import {
  pauseCharWorldbookSync,
  registerWorldbookRename,
  resumeCharWorldbookSync,
  unregisterWorldbookRename,
} from './worldbook-sync-guard';

const CHAR_WB_KEYS = [
  'worldbook',
  'world',
  'worlds',
  'extra_worlds',
  'additional_worlds',
  'character_worlds',
  'character_book',
];

function replaceNameInCharacter(char: Character, oldName: string, newName: string): Character {
  const next = _.cloneDeep(char);
  if (next.worldbook === oldName) next.worldbook = newName;

  const rawAny = next as any;
  if (rawAny.character_book === oldName) {
    rawAny.character_book = newName;
  } else if (rawAny.character_book && typeof rawAny.character_book === 'object') {
    if (rawAny.character_book.name === oldName) {
      rawAny.character_book.name = newName;
    }
  }

  if (rawAny.data && typeof rawAny.data === 'object') {
    if (rawAny.data.character_book === oldName) {
      rawAny.data.character_book = newName;
    } else if (rawAny.data.character_book && typeof rawAny.data.character_book === 'object') {
      if (rawAny.data.character_book.name === oldName) {
        rawAny.data.character_book.name = newName;
      }
    }
    if (rawAny.data.extensions && typeof rawAny.data.extensions === 'object') {
      walkReplace(rawAny.data.extensions, oldName, newName, 0);
    }
  }

  if (next.extensions && typeof next.extensions === 'object') {
    walkReplace(next.extensions as Record<string, unknown>, oldName, newName, 0);
  }
  if (next.worldbook === newName && next.extensions) {
    (next.extensions as Record<string, unknown>).world = newName;
  }
  if (
    rawAny.data?.extensions &&
    typeof rawAny.data.extensions === 'object' &&
    rawAny.data.extensions.world === oldName
  ) {
    rawAny.data.extensions.world = newName;
  }
  return next;
}

function walkReplace(obj: unknown, oldName: string, newName: string, depth = 0): void {
  if (!obj || typeof obj !== 'object' || depth > 8) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      if (typeof item === 'string' && item === oldName) (obj as string[])[i] = newName;
      else walkReplace(item, oldName, newName, depth + 1);
    });
    return;
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const val = (obj as Record<string, unknown>)[key];
    if (typeof val === 'string' && val === oldName && (depth === 0 ? CHAR_WB_KEYS.includes(key) : true)) {
      (obj as Record<string, unknown>)[key] = newName;
    } else if (typeof val === 'object') {
      walkReplace(val, oldName, newName, depth + 1);
    }
  }
}

export async function copyWorldbook(sourceName: string, targetName: string): Promise<void> {
  const names = safeWorldbookNames();
  if (!names.includes(sourceName)) throw new Error(`源世界书「${sourceName}」不存在`);
  if (names.includes(targetName)) throw new Error(`目标名称「${targetName}」已存在`);
  const entries = await getWorldbook(sourceName);
  await createWorldbook(targetName, entries);
  await ensureWorldbookReady(targetName);
}

async function refreshWorldbookList(): Promise<void> {
  try {
    await SillyTavern.updateWorldInfoList?.();
  } catch {
    /* ignore */
  }
  await yieldToUi();
}

/** 等待新世界书在服务端可读（createWorldbook 后列表/文件可能尚未就绪） */
async function ensureWorldbookReady(name: string): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt++) {
    if (safeWorldbookNames().includes(name)) {
      try {
        await getWorldbook(name);
        return;
      } catch {
        /* 名称已在列表但尚不可读 */
      }
    }
    await refreshWorldbookList();
    await new Promise<void>(resolve => {
      setTimeout(resolve, 60 + attempt * 80);
    });
  }
  throw new Error(`世界书「${name}」创建后未能就绪，请稍后重试`);
}

async function createWorldbookForRename(newName: string, entries: WorldbookEntry[]): Promise<void> {
  const names = safeWorldbookNames();
  if (names.includes(newName)) {
    await createOrReplaceWorldbook(newName, entries, { render: 'immediate' });
  } else {
    await createWorldbook(newName, entries);
  }
  await ensureWorldbookReady(newName);
}

function isWorldbookMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /doesn't exist|Not found.*World info|世界书.*不存在/i.test(msg);
}

async function applyCharBindingWithRetry(charName: string, wb: CharWorldbooks): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await applyCharWorldbookBinding(charName, wb);
      return;
    } catch (e) {
      lastError = e;
      if (!isWorldbookMissingError(e)) throw e;
      await refreshWorldbookList();
      await new Promise<void>(resolve => {
        setTimeout(resolve, 80 + attempt * 100);
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function characterReferencesWorldbook(wb: { primary: string | null; additional: string[] }, bookName: string): boolean {
  return wb.primary === bookName || wb.additional.includes(bookName);
}

/** 以角色卡文件 + charLore 为准（避免 API 缓存仍返回旧名） */
async function characterReferencesWorldbookStored(charName: string, bookName: string): Promise<boolean> {
  try {
    const card = await resolveMaybeAsync(getCharacter(charName));
    if (characterReferencesWorldbook(parseCharWorldbooksFromCharData(card), bookName)) return true;
  } catch {
    /* ignore */
  }
  const basename = getCharAvatarBasename(charName);
  if (basename) {
    const charLore = await readWorldInfoCharLore();
    const entry = charLore.find(e => e.name === basename);
    if (entry?.extraBooks?.includes(bookName)) return true;
  }
  return false;
}

async function characterReferencesWorldbookDeep(charName: string, bookName: string): Promise<boolean> {
  if (await characterReferencesWorldbookStored(charName, bookName)) return true;
  const { wb } = await resolveCharWorldbooks(charName, { deepScan: true });
  return characterReferencesWorldbook(wb, bookName);
}

function applyPrimaryWorldbookName(char: Character, primary: string | null): Character {
  const next = _.cloneDeep(char);
  next.worldbook = primary;
  const raw = next as any;
  if (!raw.extensions) raw.extensions = {};
  if (primary) {
    raw.extensions.world = primary;
    if (raw.character_book && typeof raw.character_book === 'object') {
      raw.character_book.name = primary;
    } else {
      raw.character_book = primary;
    }
    if (raw.data && typeof raw.data === 'object') {
      if (raw.data.character_book && typeof raw.data.character_book === 'object') {
        raw.data.character_book.name = primary;
      } else {
        raw.data.character_book = primary;
      }
      if (!raw.data.extensions) raw.data.extensions = {};
      raw.data.extensions.world = primary;
    }
  }
  return next;
}

async function collectCharactersBoundToWorldbook(bookName: string, extraNames: string[] = []): Promise<string[]> {
  const set = new Set<string>(extraNames.filter(Boolean));
  for (const charName of await safeCharacterNamesAsync()) {
    if (await characterReferencesWorldbookDeep(charName, bookName)) {
      set.add(charName);
    }
  }
  return [...set];
}

async function collectCharactersStillReferencing(bookName: string): Promise<string[]> {
  const result: string[] = [];
  for (const charName of await safeCharacterNamesAsync()) {
    if (await characterReferencesWorldbookDeep(charName, bookName)) {
      result.push(charName);
    }
  }
  return result;
}

function collectReplaceableWorldbookNames(
  char: Character,
  wb: { primary: string | null; additional: string[] },
  oldName: string,
): string[] {
  const stored = parseCharWorldbooksFromCharData(char);
  const names = new Set<string>([oldName]);
  for (const n of [wb.primary, stored.primary, ...wb.additional, ...stored.additional]) {
    if (typeof n === 'string' && n.trim()) names.add(n.trim());
  }
  return [...names];
}

async function verifyCharPrimaryIs(charName: string, bookName: string): Promise<boolean> {
  try {
    const { wb } = await resolveCharWorldbooks(charName, { deepScan: true });
    if (wb.primary === bookName) return true;
    const card = await resolveMaybeAsync(getCharacter(charName));
    return parseCharWorldbooksFromCharData(card).primary === bookName;
  } catch {
    return false;
  }
}

/** 角色卡文件内不再引用旧名，且主世界书已指向新名 */
async function verifyCharFullyMigrated(charName: string, oldName: string, newName: string): Promise<boolean> {
  if (await characterReferencesWorldbookStored(charName, oldName)) return false;
  return verifyCharPrimaryIs(charName, newName);
}

async function reconcileCharactersForRename(
  oldName: string,
  newName: string,
  boundRefs: { name: string; roles: CharBindingRole[] }[],
): Promise<void> {
  const todo = new Map<string, CharBindingRole[]>();
  for (const ref of boundRefs) {
    todo.set(ref.name, ref.roles);
  }
  for (const charName of await collectCharactersStillReferencing(oldName)) {
    if (!todo.has(charName)) todo.set(charName, ['primary', 'additional']);
  }
  for (const ref of boundRefs) {
    if (ref.roles.includes('primary') && !(await verifyCharFullyMigrated(ref.name, oldName, newName))) {
      todo.set(ref.name, ref.roles);
    }
  }
  for (const [charName, roles] of todo) {
    await migrateCharacterWorldbookForRename(charName, oldName, newName, { force: true, roles });
    if (roles.includes('primary')) {
      await mergeCharacterPrimaryWorldbookLink(charName, newName);
      await syncCharacterJsonAfterRename(charName, oldName, newName, newName);
    }
  }
  const needRebind: { name: string; roles: CharBindingRole[] }[] = [];
  for (const ref of boundRefs) {
    if (ref.roles.includes('primary') && !(await verifyCharFullyMigrated(ref.name, oldName, newName))) {
      needRebind.push(ref);
    }
  }
  if (needRebind.length > 0) {
    await bindCharactersToWorldbookForRename(newName, needRebind);
    for (const ref of needRebind) {
      await syncCharacterJsonAfterRename(ref.name, oldName, newName, newName);
    }
  }
}

function computeNextCharWorldbooksForRename(
  wb: { primary: string | null; additional: string[] },
  oldName: string,
  newName: string,
  roles: CharBindingRole[] = [],
  force = false,
): { primary: string | null; additional: string[] } {
  let nextPrimary = wb.primary;
  let nextAdditional = wb.additional.map(n => (n === oldName ? newName : n));

  if ((force && roles.includes('primary')) || wb.primary === oldName) {
    nextPrimary = newName;
  }
  if (wb.additional.includes(oldName)) {
    nextAdditional = wb.additional.map(n => (n === oldName ? newName : n));
  } else if (force && roles.includes('additional') && nextPrimary !== newName) {
    nextAdditional = [...nextAdditional, newName];
  }

  nextAdditional = [...new Set(nextAdditional)].filter(n => n !== nextPrimary);
  return { primary: nextPrimary, additional: nextAdditional };
}

async function bindCharactersToWorldbookForRename(
  newName: string,
  boundRefs: { name: string; roles: CharBindingRole[] }[],
): Promise<string[]> {
  const updated: string[] = [];
  for (const ref of boundRefs) {
    if (ref.roles.includes('primary')) {
      const result = await applyCharBookBinding({
        bookNames: [newName],
        charNames: [ref.name],
        mode: 'primary',
        action: 'bind',
      });
      if (result.errors.length > 0) {
        throw new Error(`绑定角色「${ref.name}」主世界书失败：${result.errors.join('；')}`);
      }
      updated.push(ref.name);
    }
    if (ref.roles.includes('additional')) {
      const result = await applyCharBookBinding({
        bookNames: [newName],
        charNames: [ref.name],
        mode: 'additional',
        action: 'bind',
      });
      if (result.errors.length > 0) {
        throw new Error(`绑定角色「${ref.name}」附加世界书失败：${result.errors.join('；')}`);
      }
      if (!updated.includes(ref.name)) updated.push(ref.name);
    }
  }
  return updated;
}

async function syncCharacterJsonAfterRename(
  charName: string,
  oldName: string,
  newName: string,
  primary: string | null,
): Promise<void> {
  const { wb } = await resolveCharWorldbooks(charName, { deepScan: true });
  const char = await resolveMaybeAsync(getCharacter(charName));
  const previousNames = collectReplaceableWorldbookNames(char, wb, oldName);
  let next = _.cloneDeep(char);
  for (const prev of previousNames) {
    if (prev !== newName) next = replaceNameInCharacter(next, prev, newName);
  }
  next = applyPrimaryWorldbookName(next, primary);
  await replaceCharacter(charName as Exclude<string, 'current'>, next, { render: 'none' });
  await yieldToUi();
}
async function migrateCharacterWorldbookForRename(
  charName: string,
  oldName: string,
  newName: string,
  options?: { force?: boolean; roles?: CharBindingRole[] },
): Promise<boolean> {
  const force = options?.force ?? false;
  const roles = options?.roles ?? [];
  const referenced = await characterReferencesWorldbookDeep(charName, oldName);
  if (!referenced && !force) return false;

  const { wb } = await resolveCharWorldbooks(charName, { deepScan: true });
  const char = await resolveMaybeAsync(getCharacter(charName));
  const previousNames = collectReplaceableWorldbookNames(char, wb, oldName);
  const referencesOld =
    referenced || previousNames.includes(oldName) || wb.primary === oldName || wb.additional.includes(oldName);
  const touchesOld = referencesOld || (force && (roles.includes('primary') || roles.includes('additional')));
  if (!touchesOld) return false;

  const nextWb = computeNextCharWorldbooksForRename(wb, oldName, newName, roles, force);
  let nextPrimary = nextWb.primary;
  if (force && roles.includes('primary')) nextPrimary = newName;

  const originalWb = { primary: wb.primary, additional: [...wb.additional] };

  try {
    if (roles.includes('primary') && (force || wb.primary === oldName || referencesOld)) {
      const result = await applyCharBookBinding({
        bookNames: [newName],
        charNames: [charName],
        mode: 'primary',
        action: 'bind',
      });
      if (result.errors.length > 0) {
        throw new Error(result.errors.join('；'));
      }
    } else if (nextPrimary === newName) {
      await applyCharBindingWithRetry(charName, { primary: nextPrimary, additional: nextWb.additional });
    }

    if (roles.includes('additional') && wb.additional.includes(oldName)) {
      const result = await applyCharBookBinding({
        bookNames: [newName],
        charNames: [charName],
        mode: 'additional',
        action: 'bind',
      });
      if (result.errors.length > 0) {
        throw new Error(result.errors.join('；'));
      }
    }

    await syncCharacterJsonAfterRename(charName, oldName, newName, nextPrimary);

    if ((force && roles.includes('primary')) || nextPrimary === newName) {
      if (!(await verifyCharPrimaryIs(charName, newName))) {
        throw new Error(`角色「${charName}」的世界书绑定未能切换到「${newName}」`);
      }
    }
  } catch (e) {
    try {
      await applyCharWorldbookBinding(charName, originalWb, { skipPrimary: false });
    } catch (revertErr) {
      console.warn('[世界书管理器] 回滚角色世界书绑定失败', charName, revertErr);
    }
    throw e;
  }
  return true;
}

async function migrateCharLoreWorldbookName(oldName: string, newName: string): Promise<void> {
  const charLore = await readWorldInfoCharLore();
  let changed = false;
  for (const entry of charLore) {
    const books = entry.extraBooks ?? [];
    const next = books.map(n => (n === oldName ? newName : n));
    if (next.some((n, i) => n !== books[i])) {
      entry.extraBooks = next;
      changed = true;
    }
  }
  if (changed) await writeWorldInfoCharLore(charLore);
}

function stRequestHeaders(): Record<string, string> {
  try {
    return SillyTavern.getRequestHeaders();
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

/** 与 SillyTavern 原生 deleteWorldInfo 一致：POST /api/worldinfo/delete */
async function deleteWorldInfoNative(name: string): Promise<boolean> {
  try {
    const res = await fetch('/api/worldinfo/delete', {
      method: 'POST',
      headers: stRequestHeaders(),
      cache: 'no-cache',
      body: JSON.stringify({ name }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[世界书管理器] /api/worldinfo/delete 失败', name, e);
    return false;
  }
}

/** 删除世界书文件：优先 ST 原生 API，回退酒馆助手 deleteWorldbook */
async function deleteWorldbookFile(name: string, options?: { purgeRefs?: boolean }): Promise<boolean> {
  const purgeRefs = options?.purgeRefs ?? false;
  try {
    await SillyTavern.updateWorldInfoList?.();
  } catch {
    /* ignore */
  }
  await yieldToUi();

  if (purgeRefs) {
    await purgeWorldbookReferences(name);
  }

  let ok = await deleteWorldInfoNative(name);
  if (!ok) {
    ok = await deleteWorldbook(name);
  }
  if (ok) {
    try {
      await SillyTavern.updateWorldInfoList?.();
    } catch {
      /* ignore */
    }
    await yieldToUi();
  }
  return ok;
}

async function assertWorldbookRemoved(name: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await SillyTavern.updateWorldInfoList?.();
    } catch {
      /* ignore */
    }
    await yieldToUi();
    if (!safeWorldbookNames().includes(name)) return;
    const ok = await deleteWorldbookFile(name);
    if (!ok) {
      await new Promise<void>(r => setTimeout(r, 80 + attempt * 120));
    }
  }
  if (safeWorldbookNames().includes(name)) {
    throw new Error(`旧世界书「${name}」仍存在，重命名未完成`);
  }
}

/** 与 SillyTavern 原生重命名一致：通过 merge-attributes 更新 data.extensions.world */
async function mergeCharacterPrimaryWorldbookLink(charName: string, newWorldName: string): Promise<void> {
  const char = await resolveMaybeAsync(getCharacter(charName));
  const avatar = char.avatar;
  if (typeof avatar !== 'string' || !avatar.trim()) {
    throw new Error(`无法读取角色「${charName}」的头像文件名`);
  }
  const res = await fetch('/api/characters/merge-attributes', {
    method: 'POST',
    headers: stRequestHeaders(),
    cache: 'no-cache',
    body: JSON.stringify({
      avatar,
      data: {
        extensions: {
          world: newWorldName,
        },
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`更新角色「${charName}」世界书绑定失败${detail ? `：${detail}` : ''}（HTTP ${res.status}）`);
  }
}

async function characterStoredPrimaryIs(charName: string, bookName: string): Promise<boolean> {
  try {
    const char = await resolveMaybeAsync(getCharacter(charName));
    const parsed = parseCharWorldbooksFromCharData(char);
    if (parsed.primary === bookName) return true;
    const extWorld = (char as { data?: { extensions?: { world?: string } } }).data?.extensions?.world;
    return extWorld === bookName;
  } catch {
    return false;
  }
}

async function collectCharactersWithPrimaryWorldbook(
  bookName: string,
  boundRefs: { name: string; roles: CharBindingRole[] }[],
  extraNames: string[] = [],
): Promise<string[]> {
  const set = new Set<string>();
  for (const ref of boundRefs) {
    if (ref.roles.includes('primary')) set.add(ref.name);
  }
  for (const name of extraNames) set.add(name);
  for (const charName of await safeCharacterNamesAsync()) {
    if (await characterStoredPrimaryIs(charName, bookName)) set.add(charName);
    const { wb } = await resolveCharWorldbooks(charName, { deepScan: true });
    if (wb.primary === bookName) set.add(charName);
  }
  return [...set];
}

/** 重定向角色卡主世界书绑定（对齐 ST updateWorldInfoLinks） */
async function retargetCharacterWorldInfoLinks(
  oldName: string,
  newName: string,
  boundRefs: { name: string; roles: CharBindingRole[] }[],
  extraNames: string[] = [],
): Promise<string[]> {
  await migrateCharLoreWorldbookName(oldName, newName);

  const charNames = await collectCharactersWithPrimaryWorldbook(oldName, boundRefs, extraNames);
  const updated: string[] = [];

  for (const charName of charNames) {
    const ref = boundRefs.find(r => r.name === charName);
    const roles = ref?.roles ?? (['primary', 'additional'] as CharBindingRole[]);
    const force = Boolean(ref) || extraNames.includes(charName);

    await migrateCharacterWorldbookForRename(charName, oldName, newName, { force, roles });
    if (roles.includes('primary')) {
      await mergeCharacterPrimaryWorldbookLink(charName, newName);
      await syncCharacterJsonAfterRename(charName, oldName, newName, newName);
    }
    if (roles.includes('primary') && !(await verifyCharFullyMigrated(charName, oldName, newName))) {
      throw new Error(`角色「${charName}」未能绑定到「${newName}」`);
    }
    updated.push(charName);
  }

  for (const ref of boundRefs) {
    if (ref.roles.includes('additional') && !charNames.includes(ref.name)) {
      const result = await applyCharBookBinding({
        bookNames: [newName],
        charNames: [ref.name],
        mode: 'additional',
        action: 'bind',
      });
      if (result.errors.length > 0) throw new Error(result.errors.join('；'));
      const { wb } = await resolveCharWorldbooks(ref.name, { deepScan: true });
      const primary = wb.primary === oldName ? newName : wb.primary;
      await syncCharacterJsonAfterRename(ref.name, oldName, newName, primary);
      if (!updated.includes(ref.name)) updated.push(ref.name);
    }
  }

  return updated;
}

async function forceMigrateCharactersOffOldBook(oldName: string, newName: string, charNames: string[]): Promise<void> {
  for (const charName of charNames) {
    await migrateCharacterWorldbookForRename(charName, oldName, newName, {
      force: true,
      roles: ['primary', 'additional'],
    });
    await mergeCharacterPrimaryWorldbookLink(charName, newName);
    await syncCharacterJsonAfterRename(charName, oldName, newName, newName);
    if (!(await verifyCharFullyMigrated(charName, oldName, newName))) {
      throw new Error(`角色「${charName}」仍引用旧世界书「${oldName}」`);
    }
  }
}

/** 删除重命名前的旧世界书文件（对齐 ST：saveWorldInfo → deleteWorldInfo） */
async function deleteOldWorldbookAfterRename(oldName: string): Promise<void> {
  const ok = await deleteWorldbookFile(oldName);
  if (!ok) {
    throw new Error(`无法删除旧世界书「${oldName}」`);
  }
  await assertWorldbookRemoved(oldName);
}

export type RenameWorldbookOptions = {
  /** 绑定索引中已知的关联角色（补全 API 漏检） */
  extraCharacterNames?: string[];
  /** 绑定索引中的角色及主/附角色，用于强制迁移 */
  boundCharacters?: { name: string; roles: CharBindingRole[] }[];
};

export async function renameWorldbook(
  oldName: string,
  newName: string,
  options?: RenameWorldbookOptions,
): Promise<{ updatedCharacters: string[] }> {
  const names = safeWorldbookNames();
  if (!names.includes(oldName)) throw new Error(`世界书「${oldName}」不存在`);
  if (names.includes(newName) && !names.includes(oldName)) {
    throw new Error(`名称「${newName}」已存在`);
  }
  if (oldName === newName) return { updatedCharacters: [] };

  registerWorldbookRename(oldName, newName);
  pauseCharWorldbookSync();
  try {
    return await renameWorldbookCore(oldName, newName, options);
  } finally {
    resumeCharWorldbookSync();
    unregisterWorldbookRename(oldName);
  }
}

async function renameWorldbookCore(
  oldName: string,
  newName: string,
  options?: RenameWorldbookOptions,
): Promise<{ updatedCharacters: string[] }> {
  if (typeof SillyTavern.loadWorldInfo !== 'function' || typeof SillyTavern.saveWorldInfo !== 'function') {
    throw new Error('当前酒馆环境不支持世界书重命名（缺少 loadWorldInfo / saveWorldInfo）');
  }

  const worldData = await SillyTavern.loadWorldInfo(oldName);
  if (!worldData) throw new Error(`无法读取世界书「${oldName}」`);

  await SillyTavern.saveWorldInfo(newName, worldData, true);
  await ensureWorldbookReady(newName);

  const global = getGlobalWorldbookNames();
  if (global.includes(oldName)) {
    await rebindGlobalWorldbooks(global.map(n => (n === oldName ? newName : n)));
  }

  if (hasOpenChat()) {
    try {
      const raw = getChatWorldbookName('current');
      const chat =
        raw && typeof (raw as unknown as Promise<string | null>).then === 'function'
          ? await (raw as unknown as Promise<string | null>)
          : (raw as string | null);
      if (chat === oldName) {
        await rebindChatWorldbook('current', newName);
      }
    } catch {
      /* 无聊天或获取失败时跳过 */
    }
  }

  // 对齐 ST 原生 renameWorldInfo：先 save 新名 → delete 旧文件 → 再 updateWorldInfoLinks
  if (oldName !== newName) {
    await deleteOldWorldbookAfterRename(oldName);
  }

  const boundRefs = options?.boundCharacters ?? [];
  let updatedCharacters = await retargetCharacterWorldInfoLinks(
    oldName,
    newName,
    boundRefs,
    options?.extraCharacterNames ?? [],
  );

  await reconcileCharactersForRename(oldName, newName, boundRefs);

  let stillOnOld = await collectCharactersStillReferencing(oldName);
  if (stillOnOld.length > 0) {
    await forceMigrateCharactersOffOldBook(oldName, newName, stillOnOld);
    for (const name of stillOnOld) {
      if (!updatedCharacters.includes(name)) updatedCharacters.push(name);
    }
    stillOnOld = await collectCharactersStillReferencing(oldName);
  }
  if (stillOnOld.length > 0) {
    throw new Error(
      `仍有 ${stillOnOld.length} 张角色卡绑定旧名称「${oldName}」（${stillOnOld.slice(0, 5).join('、')}${stillOnOld.length > 5 ? '…' : ''}）`,
    );
  }

  if (!safeWorldbookNames().includes(newName)) {
    throw new Error(`新世界书「${newName}」未出现在列表中，重命名未完成`);
  }
  await assertWorldbookRemoved(oldName);

  try {
    await SillyTavern.updateWorldInfoList?.();
  } catch {
    /* ignore */
  }
  return { updatedCharacters };
}

export type DeleteWorldbookCleanupOptions = {
  /** 已删除角色卡的头像 basename，用于清理 charLore 残留 */
  deletedCharAvatar?: string | null;
};

/** 删除世界书前解除全局 / 聊天 / charLore 等引用，避免 deleteWorldbook 因仍被绑定而失败 */
export async function purgeWorldbookReferences(
  bookName: string,
  options?: DeleteWorldbookCleanupOptions,
): Promise<void> {
  const global = safeGlobalWorldbookNames();
  if (global.includes(bookName)) {
    await rebindGlobalWorldbooks(global.filter(n => n !== bookName));
  }

  if (hasOpenChat()) {
    try {
      const chat = await safeChatWorldbookName();
      if (chat === bookName) {
        const unset = setChatLorebook as (lorebook: string | null) => Promise<void>;
        await unset(null);
      }
    } catch (e) {
      console.warn('[世界书管理器] 解绑聊天世界书失败', bookName, e);
    }
  }

  const deletedAvatar = options?.deletedCharAvatar?.trim() || null;
  const charLore = await readWorldInfoCharLore();
  let charLoreChanged = false;
  for (let i = charLore.length - 1; i >= 0; i--) {
    const entry = charLore[i];
    const before = entry.extraBooks?.length ?? 0;
    entry.extraBooks = (entry.extraBooks ?? []).filter(n => n !== bookName);
    if (entry.extraBooks.length !== before) charLoreChanged = true;
    if (deletedAvatar && entry.name === deletedAvatar && entry.extraBooks.length === 0) {
      charLore.splice(i, 1);
      charLoreChanged = true;
    }
  }
  if (charLoreChanged) {
    await writeWorldInfoCharLore(charLore);
  }

  const charNames = await safeCharacterNamesAsync();
  for (const charName of charNames) {
    try {
      const { wb } = await resolveCharWorldbooks(charName, { deepScan: false });
      const touchesPrimary = wb.primary === bookName;
      const touchesAdditional = wb.additional.includes(bookName);
      if (!touchesPrimary && !touchesAdditional) continue;

      await (updateCharacterWith as any)(
        charName,
        (char: Character) => {
          const next = _.cloneDeep(char);
          if (touchesPrimary) next.worldbook = null;
          if (next.extensions?.world === bookName) {
            delete next.extensions.world;
          }
          const rawAny = next as any;
          if (rawAny.character_book === bookName) rawAny.character_book = null;
          else if (rawAny.character_book?.name === bookName) rawAny.character_book.name = '';
          if (rawAny.data?.character_book === bookName) rawAny.data.character_book = null;
          else if (rawAny.data?.character_book?.name === bookName) rawAny.data.character_book.name = '';
          if (rawAny.data?.extensions?.world === bookName) delete rawAny.data.extensions.world;
          return next;
        },
        { render: 'none' },
      );

      if (touchesAdditional) {
        const basename =
          typeof getCharData === 'function' ? getCharData(charName)?.avatar?.replace(/\.[^/.]+$/, '') : null;
        if (basename) {
          const lore = await readWorldInfoCharLore();
          const idx = lore.findIndex(e => e.name === basename);
          if (idx >= 0) {
            lore[idx].extraBooks = lore[idx].extraBooks.filter(n => n !== bookName);
            if (lore[idx].extraBooks.length === 0) lore.splice(idx, 1);
            await writeWorldInfoCharLore(lore);
          }
        }
      }
    } catch (e) {
      console.warn('[世界书管理器] 解除角色卡世界书引用失败', charName, bookName, e);
    }
  }
}

/** 清理引用后删除世界书，并刷新酒馆世界书列表 */
export async function deleteWorldbookWithCleanup(
  bookName: string,
  options?: DeleteWorldbookCleanupOptions,
): Promise<boolean> {
  if (!safeWorldbookNames().includes(bookName)) return false;
  await purgeWorldbookReferences(bookName, options);
  return deleteWorldbookFile(bookName);
}

export type DeleteBookPreviewItem = {
  name: string;
  charBound: boolean;
  characterLines: string[];
  globalEnabled: boolean;
};

export function buildDeleteBookPreview(
  names: string[],
  bindingIndex: Map<string, WorldbookBindingInfo>,
): DeleteBookPreviewItem[] {
  return names.map(name => {
    const info = bindingIndex.get(name);
    const characters = info?.characters ?? [];
    return {
      name,
      charBound: !!info?.charBound,
      characterLines: characters.map(c => `${c.name}（${c.roles.join('、')}）`),
      globalEnabled: !!info?.globalEnabled,
    };
  });
}

/** 已在 UI 中确认后执行删除（不再弹原生 confirm） */
export async function deleteWorldbooksConfirmed(
  names: string[],
  _bindingIndex: Map<string, WorldbookBindingInfo>,
): Promise<string[]> {
  const deleted: string[] = [];
  for (const name of names) {
    try {
      if (await deleteWorldbook(name)) deleted.push(name);
    } catch (e) {
      console.error(`删除世界书失败: ${name}`, e);
    }
  }
  return deleted;
}

export async function deleteWorldbooksWithConfirm(
  names: string[],
  bindingIndex: Map<string, WorldbookBindingInfo>,
): Promise<string[]> {
  const deleted: string[] = [];
  const unboundOnly = names.filter(n => !bindingIndex.get(n)?.charBound);
  const bound = names.filter(n => bindingIndex.get(n)?.charBound);

  if (unboundOnly.length > 0) {
    const globalHint = unboundOnly.filter(n => bindingIndex.get(n)?.globalEnabled);
    let msg = `确定删除 ${unboundOnly.length} 本未绑定角色卡的世界书？\n此操作不可撤销。`;
    if (globalHint.length > 0) {
      msg += `\n\n其中 ${globalHint.length} 本仍全局开启：\n${globalHint.slice(0, 8).join('、')}${globalHint.length > 8 ? '…' : ''}`;
    }
    if (!confirm(msg)) return deleted;
    for (const name of unboundOnly) {
      if (await deleteWorldbook(name)) deleted.push(name);
    }
  }

  if (bound.length > 0) {
    const detail = bound
      .map(name => {
        const info = bindingIndex.get(name)!;
        return `【${name}】\n${formatBindingDetail(info)}`;
      })
      .join('\n\n');
    if (
      !confirm(`以下 ${bound.length} 本世界书绑定了角色卡，删除后相关角色卡引用将失效：\n\n${detail}\n\n确定仍要删除？`)
    ) {
      return deleted;
    }
    for (const name of bound) {
      if (await deleteWorldbook(name)) deleted.push(name);
    }
  }

  return deleted;
}
