import _ from 'lodash';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { buildBindingIndex, isBookCharOrChatBound, type BindingIndex, type WorldbookBindingInfo } from './lib/binding';
import { formatBindingStatusMessage, type BindingScanReport } from './lib/binding-scan';
import { captureBindingUndoState, restoreBindingUndoState } from './lib/book-binding-restore';
import {
  BOOK_SORT_OPTIONS,
  mergeVisibleIntoBookOrder,
  sortBookNames,
  type BookSortContext,
  type BookSortMode,
} from './lib/book-sort';
import { yieldToUi } from './lib/char-worldbook';
import { draftsEqual } from './lib/entry-diff';
import { applyEditDraftToEntry, entryToEditDraft, type EntryEditDraft } from './lib/entry-edit';
import {
  hasOpenChat,
  safeGlobalWorldbookNames,
  safeWorldbookNames as listAllWorldbooks,
  safeChatWorldbookName,
  safeCurrentCharWorldbookNames,
} from './lib/tavern-safe';
import { ensureImportTimeOnBook, prepareImportSortTimes } from './lib/tavern-world-sync';
import { setWorldbooksGlobalEnabled } from './lib/worldbook-global';
import { countEntryTokens, sumEntryTokens, type EntryTokenInfo } from './lib/token-count';
import {
  createBookStatsLoaderState,
  dropBookStatsCache,
  ensureBookEntryNames,
  ensureBookStats,
  type EntryBookStats,
} from './lib/book-stats-loader';
import { clearActiveUndo, offerUndo } from './lib/undo';
import {
  buildDeleteBookPreview,
  copyWorldbook,
  deleteWorldbooksConfirmed,
  deleteWorldbooksWithConfirm,
  renameWorldbook,
  type DeleteBookPreviewItem,
} from './lib/worldbook-ops';
import {
  BookMetaSchema,
  DEFAULT_FOLDER,
  FilterStateSchema,
  FolderMetaSchema,
  parseSettings,
  type BookMeta,
  type FolderMeta,
  type ManagerSettings,
} from './schema';

export type BookListItem = {
  name: string;
  meta: BookMeta;
  binding: WorldbookBindingInfo;
  entryCount: number | null;
  enabledCount: number | null;
  totalTokens: number | null;
  enabledTokens: number | null;
  matchedEntryNames?: string[];
};

export type EntrySaveSnapshot = {
  bookName: string;
  uid: number;
  savedAt: number;
  before: EntryEditDraft;
  after: EntryEditDraft;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
/** 本脚本刚写入变量后的冷却期，避免 SETTINGS_UPDATED 触发全量同步 */
let selfPersistCooldownUntil = 0;

export { listAllWorldbooks as safeWorldbookNames };

function loadRawSettings(): ManagerSettings {
  const raw = getVariables({ type: 'script', script_id: getScriptId() }) as Record<string, unknown> | undefined;
  return parseSettings(raw?.wb_manager);
}

function schedulePersist(settings: ManagerSettings) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    flushPersist(settings);
  }, 200);
}

function flushPersist(settings: ManagerSettings) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  selfPersistCooldownUntil = Date.now() + 1500;
  const current = getVariables({ type: 'script', script_id: getScriptId() }) || {};
  replaceVariables(
    { ..._.cloneDeep(current), wb_manager: _.cloneDeep(settings) },
    { type: 'script', script_id: getScriptId() },
  );
}

function isSelfPersistCooldown(): boolean {
  return Date.now() < selfPersistCooldownUntil;
}

let externalRefreshPaused = false;
/** 重命名进行中：旧名 → 新名，避免事件仍用旧名读条目 */
let pendingBookRename: { from: string; to: string } | null = null;
/** 酒馆列表短暂仍含旧名时用于元数据迁移与列表去重 */
const recentBookRenames = new Map<string, string>();

function filterStaleRenameNames(names: string[]): string[] {
  let result = [...names];
  if (pendingBookRename && result.includes(pendingBookRename.to)) {
    result = result.filter(n => n !== pendingBookRename!.from);
  }
  for (const [from, to] of recentBookRenames) {
    if (result.includes(to)) result = result.filter(n => n !== from);
  }
  return result;
}

function mergeRenameMetaIntoBackup(metaBackup: Record<string, BookMeta>): void {
  const pairs: [string, string][] = pendingBookRename
    ? [[pendingBookRename.from, pendingBookRename.to]]
    : [];
  for (const [from, to] of recentBookRenames) pairs.push([from, to]);
  for (const [from, to] of pairs) {
    const preserved = metaBackup[to] ?? metaBackup[from];
    if (preserved) metaBackup[to] = BookMetaSchema.parse(_.cloneDeep(preserved));
  }
}

function resolveMetaFromBackup(name: string, metaBackup: Record<string, BookMeta>): BookMeta | undefined {
  if (metaBackup[name]) return metaBackup[name];
  const viaRecent = recentBookRenames.get(name);
  if (viaRecent && metaBackup[viaRecent]) return metaBackup[viaRecent];
  if (pendingBookRename?.from === name && metaBackup[pendingBookRename.to]) {
    return metaBackup[pendingBookRename.to];
  }
  return undefined;
}

function pruneRecentBookRenames(rawTavernNames: string[]): void {
  for (const from of [...recentBookRenames.keys()]) {
    if (!rawTavernNames.includes(from)) recentBookRenames.delete(from);
  }
}

function setExternalRefreshPaused(paused: boolean) {
  externalRefreshPaused = paused;
}

function isExternalRefreshPaused(): boolean {
  return externalRefreshPaused;
}

function resolveBookNameAfterRename(bookName: string): string {
  if (pendingBookRename?.from === bookName) return pendingBookRename.to;
  return bookName;
}

export const useWorldbookManagerStore = defineStore('worldbook-manager', () => {
  const settings = ref<ManagerSettings>(loadRawSettings());
  const bindingIndex = ref<BindingIndex>(new Map());
  const bindingScanReport = ref<BindingScanReport | null>(null);
  const selectedBooks = ref<Set<string>>(new Set());
  const selectedBook = ref<string | null>(null);
  const entries = ref<WorldbookEntry[]>([]);
  const entrySearchQuery = ref('');
  const filteredEntries = computed(() => {
    const q = entrySearchQuery.value.trim().toLowerCase();
    if (!q) return entries.value;
    return entries.value.filter(e => {
      const keysStr = Array.isArray(e.strategy?.keys) ? e.strategy.keys.map(k => String(k)).join(' ') : '';
      const secKeysStr = Array.isArray(e.strategy?.keys_secondary?.keys)
        ? e.strategy.keys_secondary.keys.map(k => String(k)).join(' ')
        : '';
      const hay = [e.name || '', e.content || '', keysStr, secKeysStr, String(e.uid)].join(' ').toLowerCase();
      return hay.includes(q);
    });
  });
  const selectedEntryUids = ref<number[]>([]);
  const entryLoading = ref(false);
  const refreshing = ref(false);
  const entryStats = ref<Record<string, EntryBookStats>>({});
  const entryNamesMap = ref<Record<string, string[]>>({});
  const statsLoader = createBookStatsLoaderState();
  const entryTokenByUid = ref<Record<number, EntryTokenInfo>>({});
  /** 最近一次非静默保存的改前/改后快照（按 uid） */
  const entrySaveSnapshots = ref<Record<number, EntrySaveSnapshot>>({});
  let entryTokenRefreshGen = 0;

  const dragBookName = ref<string | null>(null);
  const dragFolderName = ref<string | null>(null);
  /** 酒馆 getWorldbookNames 顺序，用作「导入顺序」 */
  const tavernImportOrder = ref<string[]>([]);

  watch(settings, s => schedulePersist(s), { deep: true });

  function getFolderMeta(folder: string): FolderMeta {
    const raw = settings.value.folderMeta[folder];
    if (raw) return raw;
    return { pinned: false, tags: [], tagMode: 'or' };
  }

  /** 世界书是否属于该文件夹（手动归类 或 满足文件夹标签规则） */
  function bookInFolder(meta: BookMeta, folder: string): boolean {
    if (folder === DEFAULT_FOLDER) return true;
    if (meta.folder === folder) return true;
    const fm = getFolderMeta(folder);
    const folderTags = fm.tags ?? [];
    if (folderTags.length === 0) return false;
    const bookTags = meta.tags ?? [];
    const has = (t: string) => bookTags.includes(t);
    return fm.tagMode === 'and' ? folderTags.every(has) : folderTags.some(has);
  }

  function getBookMeta(name: string): BookMeta {
    const raw = settings.value.books[name];
    if (raw) return raw;
    return { folder: DEFAULT_FOLDER, tags: [] };
  }

  function ensureBookMeta(name: string): BookMeta {
    if (!settings.value.books[name]) {
      settings.value.books[name] = BookMetaSchema.parse({});
    }
    const m = settings.value.books[name];
    if (!m.tags) m.tags = [];
    if (!m.folder) m.folder = DEFAULT_FOLDER;
    return m;
  }

  function touchBookMeta(name: string) {
    ensureBookMeta(name).lastTouchedAt = Date.now();
  }

  /** 装插件当日基准：无记录的旧书统一用此时间参与「首次导入」排序 */
  function ensurePluginBaseline(): number {
    if (!settings.value.pluginBaselineAt || settings.value.pluginBaselineAt <= 0) {
      settings.value.pluginBaselineAt = Date.now();
    }
    return settings.value.pluginBaselineAt;
  }

  function bookSortContext(): BookSortContext {
    return {
      importOrder: tavernImportOrder.value.length ? tavernImportOrder.value : listAllWorldbooks(),
      getMeta: ensureBookMeta,
      getBinding: name =>
        bindingIndex.value.get(name) ?? {
          charBound: false,
          characters: [],
          chatLore: [],
          chatLoreBound: false,
          globalEnabled: false,
          currentChatBound: false,
          currentCharPrimary: false,
          currentCharAdditional: false,
        },
    };
  }

  function readBookMetaSnapshot(bookName: string): BookMeta {
    const raw = settings.value.books[bookName];
    return BookMetaSchema.parse(_.cloneDeep(raw ?? { folder: DEFAULT_FOLDER, tags: [] }));
  }

  /** 若仅通过标签规则归入文件夹，补写 meta.folder 便于筛选与重命名迁移 */
  function inferAssignedFolder(meta: BookMeta): string {
    if (meta.folder && meta.folder !== DEFAULT_FOLDER) return meta.folder;
    const active = settings.value.filter.folder;
    if (active && active !== DEFAULT_FOLDER && bookInFolder(meta, active)) return active;
    const matched = (settings.value.folders ?? []).filter(
      f => f !== DEFAULT_FOLDER && bookInFolder(meta, f),
    );
    if (matched.length === 1) return matched[0]!;
    return meta.folder ?? DEFAULT_FOLDER;
  }

  function mergeBookMetaForRename(oldName: string, earlySnapshot: BookMeta, newName?: string): BookMeta {
    const liveOld = settings.value.books[oldName];
    const liveNew = newName ? settings.value.books[newName] : undefined;
    const pickFolder = (...candidates: (string | undefined)[]) =>
      candidates.find(f => f && f !== DEFAULT_FOLDER);
    const merged = BookMetaSchema.parse(
      _.cloneDeep({
        ...earlySnapshot,
        ...(liveOld ?? {}),
        ...(liveNew ?? {}),
        tags: liveNew?.tags?.length ? liveNew.tags : liveOld?.tags?.length ? liveOld.tags : earlySnapshot.tags,
        folder:
          pickFolder(liveNew?.folder, liveOld?.folder, earlySnapshot.folder) ?? earlySnapshot.folder,
        pinned: liveNew?.pinned ?? liveOld?.pinned ?? earlySnapshot.pinned,
        lastTouchedAt: liveNew?.lastTouchedAt ?? liveOld?.lastTouchedAt ?? earlySnapshot.lastTouchedAt,
        firstImportAt: liveNew?.firstImportAt ?? liveOld?.firstImportAt ?? earlySnapshot.firstImportAt,
      }),
    );
    merged.folder = inferAssignedFolder(merged);
    return merged;
  }

  function syncBookListFromTavern(forcedBookMeta?: Record<string, BookMeta>) {
    const rawNames = listAllWorldbooks();
    const names = filterStaleRenameNames(rawNames);
    tavernImportOrder.value = [...names];
    const nameSet = new Set(names);
    const metaBackup = _.cloneDeep(settings.value.books);
    mergeRenameMetaIntoBackup(metaBackup);
    if (forcedBookMeta) {
      for (const [k, v] of Object.entries(forcedBookMeta)) {
        metaBackup[k] = _.cloneDeep(v);
      }
    }
    Object.keys(settings.value.books).forEach(key => {
      if (!nameSet.has(key)) delete settings.value.books[key];
    });
    settings.value.bookOrder = settings.value.bookOrder.filter(n => nameSet.has(n));
    names.forEach(n => {
      if (!settings.value.books[n]) {
        const restored = resolveMetaFromBackup(n, metaBackup);
        settings.value.books[n] = restored
          ? BookMetaSchema.parse(_.cloneDeep(restored))
          : BookMetaSchema.parse({});
      }
      if (!settings.value.bookOrder.includes(n)) settings.value.bookOrder.push(n);
    });
    if (forcedBookMeta) {
      for (const [k, v] of Object.entries(forcedBookMeta)) {
        if (nameSet.has(k)) {
          settings.value.books[k] = BookMetaSchema.parse(_.cloneDeep(v));
        }
      }
    }
    pruneRecentBookRenames(rawNames);
  }

  const refreshDirty = {
    bookList: false,
    stats: new Set<string>(),
    binding: false,
    reloadSelected: false,
  };

  function markRefreshDirty(partial: {
    bookList?: boolean;
    stats?: string | string[];
    binding?: boolean;
    reloadSelected?: boolean;
  }) {
    if (partial.bookList) refreshDirty.bookList = true;
    if (partial.binding) refreshDirty.binding = true;
    if (partial.reloadSelected) refreshDirty.reloadSelected = true;
    const stats = partial.stats;
    if (stats) {
      (Array.isArray(stats) ? stats : [stats]).forEach(n => {
        if (n) refreshDirty.stats.add(n);
      });
    }
  }

  /** 操作后按需刷新，替代多数 refreshAll 调用 */
  async function refreshIncremental(opts?: {
    syncList?: boolean;
    books?: string[];
    binding?: boolean;
    reloadSelected?: boolean;
  }) {
    if (opts?.syncList || refreshDirty.bookList) {
      syncBookListFromTavern();
      refreshDirty.bookList = false;
    }
    const statsBooks = opts?.books ?? [...refreshDirty.stats];
    refreshDirty.stats.clear();
    if (statsBooks.length > 0) {
      await ensureBookStatsForNames(statsBooks);
    }
    if (opts?.binding ?? refreshDirty.binding) {
      refreshDirty.binding = false;
      const { index, report } = await buildBindingIndex({ deepScan: false });
      bindingIndex.value = index;
      bindingScanReport.value = report;
    }
    if (opts?.reloadSelected ?? refreshDirty.reloadSelected) {
      refreshDirty.reloadSelected = false;
      if (selectedBook.value && listAllWorldbooks().includes(selectedBook.value)) {
        await loadEntries(selectedBook.value, { silent: true, preserveSelection: true });
      }
    }
  }

  /** 关闭面板时冲刷尚未完成的增量刷新 */
  async function flushPendingRefresh() {
    const needList = refreshDirty.bookList;
    const stats = [...refreshDirty.stats];
    const needBinding = refreshDirty.binding;
    refreshDirty.bookList = false;
    refreshDirty.stats.clear();
    refreshDirty.binding = false;
    refreshDirty.reloadSelected = false;
    if (needList) syncBookListFromTavern();
    if (needBinding) {
      await refreshBindings({ deepScan: false, mode: 'refresh', silent: true });
    }
    if (stats.length > 0) {
      await ensureBookStatsForNames(stats);
    }
  }

  function applyStatsPatch(patch: { entryStats?: Record<string, EntryBookStats>; entryNamesMap?: Record<string, string[]> }) {
    if (patch.entryStats) entryStats.value = patch.entryStats;
    if (patch.entryNamesMap) entryNamesMap.value = patch.entryNamesMap;
  }

  async function ensureBookStatsForNames(names: string[]) {
    await ensureBookStats(statsLoader, names, applyStatsPatch);
  }

  async function ensureBookEntryNamesForNames(names: string[]) {
    await ensureBookEntryNames(statsLoader, names, patch => {
      entryNamesMap.value = patch.entryNamesMap;
      statsLoader.entryNamesMap = patch.entryNamesMap;
    });
  }

  async function refreshEntryTokenCounts(bookEntries: WorldbookEntry[]) {
    const gen = ++entryTokenRefreshGen;
    const next: Record<number, EntryTokenInfo> = {};
    entryTokenByUid.value = next;

    const BATCH = 8;
    for (let i = 0; i < bookEntries.length; i += BATCH) {
      if (gen !== entryTokenRefreshGen) return;
      const chunk = bookEntries.slice(i, i + BATCH);
      await Promise.all(
        chunk.map(async e => {
          next[e.uid] = await countEntryTokens(e);
        }),
      );
      if (gen !== entryTokenRefreshGen) return;
      entryTokenByUid.value = { ...next };
    }
  }

  /** 装插件后首次：为当时已有的世界书统一写入安装日导入时间 */
  async function stampLegacyBooksOnce() {
    if (settings.value.legacyBooksImportStamped) return;
    const baseline = ensurePluginBaseline();
    const names = listAllWorldbooks();
    const missing = names.filter(n => {
      const m = ensureBookMeta(n);
      return !(m.firstImportAt && m.firstImportAt > 0);
    });
    if (missing.length === 0) {
      settings.value.legacyBooksImportStamped = true;
      return;
    }
    let ok = 0;
    const BATCH = 8;
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      const results = await Promise.all(chunk.map(name => ensureImportTimeOnBook(name, ensureBookMeta, baseline)));
      ok += results.filter(Boolean).length;
    }
    settings.value.legacyBooksImportStamped = true;
    console.info(`[世界书管理器] 已为 ${ok}/${missing.length} 本既有世界书标记安装日`);
  }

  /** 装插件后新加入酒馆、尚无记录的世界书 → 当前时间 */
  async function stampNewBooksSinceInstall() {
    if (!settings.value.legacyBooksImportStamped) return;
    const names = listAllWorldbooks().filter(n => {
      const m = ensureBookMeta(n);
      return !(m.firstImportAt && m.firstImportAt > 0);
    });
    if (names.length === 0) return;
    const now = Date.now();
    const BATCH = 8;
    for (let i = 0; i < names.length; i += BATCH) {
      const chunk = names.slice(i, i + BATCH);
      await Promise.all(chunk.map(name => ensureImportTimeOnBook(name, ensureBookMeta, now)));
    }
  }

  const bindingChecking = ref(false);
  const bindingLastRefreshedAt = ref<number | null>(null);
  const bindingProgress = ref({
    active: false,
    mode: null as 'refresh' | 'check' | null,
    current: 0,
    total: 1,
    label: '',
  });
  const bindingStatus = ref<{ kind: 'ok' | 'warn' | 'error'; lines: string[] } | null>(null);

  async function refreshBindings(options?: {
    deepScan?: boolean;
    mode?: 'refresh' | 'check';
    silent?: boolean;
    /** 仅刷新指定世界书；默认跳过已绑定的书 */
    onlyBooks?: string[];
    includeBound?: boolean;
  }): Promise<BindingScanReport | null> {
    const mode = options?.mode ?? (options?.deepScan ? 'check' : 'refresh');
    let onlyBooks: Set<string> | undefined;
    let baseIndex: BindingIndex | undefined;

    if (options?.onlyBooks?.length) {
      const valid = [...new Set(options.onlyBooks.filter(n => listAllWorldbooks().includes(n)))];
      if (valid.length === 0) {
        toastr.warning('没有可刷新的世界书');
        return null;
      }
      const emptyBinding = (): WorldbookBindingInfo => ({
        charBound: false,
        characters: [],
        chatLore: [],
        chatLoreBound: false,
        globalEnabled: false,
        currentChatBound: false,
        currentCharPrimary: false,
        currentCharAdditional: false,
      });
      const targets = options.includeBound
        ? valid
        : valid.filter(n => !isBookCharOrChatBound(bindingIndex.value.get(n) ?? emptyBinding()));
      if (targets.length === 0) {
        toastr.info('所选世界书均已绑定，无需刷新');
        return bindingScanReport.value;
      }
      onlyBooks = new Set(targets);
      baseIndex = bindingIndex.value;
    }

    bindingChecking.value = true;
    bindingProgress.value = {
      active: true,
      mode,
      current: 0,
      total: 1,
      label: mode === 'check' ? '准备检查绑定…' : '准备刷新绑定…',
    };
    if (!options?.silent) {
      bindingStatus.value = null;
    }
    try {
      const { index, report } = await buildBindingIndex({
        deepScan: options?.deepScan ?? mode === 'check',
        baseIndex,
        onlyBooks,
        onProgress: (done, total, label) => {
          bindingProgress.value = {
            active: true,
            mode,
            current: done,
            total: Math.max(total, 1),
            label,
          };
        },
      });
      bindingIndex.value = index;
      bindingScanReport.value = report;
      bindingLastRefreshedAt.value = Date.now();
      if (!options?.silent) {
        bindingStatus.value = formatBindingStatusMessage(report);
      }
      if (onlyBooks && !options?.silent) {
        const skipped = (options.onlyBooks?.filter(n => listAllWorldbooks().includes(n)).length ?? 0) - onlyBooks.size;
        toastr.success(
          skipped > 0
            ? `已更新 ${onlyBooks.size} 本未绑定世界书（跳过 ${skipped} 本已绑定）`
            : `已更新 ${onlyBooks.size} 本世界书的绑定信息`,
        );
      }
      return report;
    } catch (e) {
      if (!options?.silent) {
        bindingStatus.value = {
          kind: 'error',
          lines: ['绑定操作失败，请稍后重试或查看浏览器控制台'],
        };
      }
      throw e;
    } finally {
      bindingChecking.value = false;
      if (bindingProgress.value.active) {
        bindingProgress.value = {
          ...bindingProgress.value,
          current: bindingProgress.value.total,
          label: '完成',
        };
        await yieldToUi();
        await new Promise<void>(r => setTimeout(r, 350));
      }
      bindingProgress.value = {
        active: false,
        mode: null,
        current: 0,
        total: 1,
        label: '',
      };
    }
  }

  /** 酒馆事件触发的轻量同步：只更新世界书列表与标签缓存，不扫绑定、不读条目统计 */
  async function refreshFromTavern() {
    if (externalRefreshPaused || isSelfPersistCooldown()) return;
    try {
      syncBookListFromTavern();
      rebuildAllTags();
    } catch (e) {
      console.warn('[世界书管理器] 轻量同步失败', e);
    }
  }

  async function refreshAll(options?: { loadStats?: boolean }) {
    ensurePluginBaseline();
    refreshing.value = true;
    try {
      if (!settings.value.filter) {
        settings.value.filter = FilterStateSchema.parse({});
      }
      if (!Array.isArray(settings.value.folders)) {
        settings.value.folders = [DEFAULT_FOLDER];
      }
      if (!Array.isArray(settings.value.bookOrder)) {
        settings.value.bookOrder = [];
      }
      const { index, report } = await buildBindingIndex({ deepScan: false });
      bindingIndex.value = index;
      bindingScanReport.value = report;
      bindingLastRefreshedAt.value = Date.now();
      syncBookListFromTavern();
      rebuildAllTags();
      await stampLegacyBooksOnce();
      await stampNewBooksSinceInstall();
      if (options?.loadStats) {
        await ensureBookStatsForNames(listAllWorldbooks());
      }
      if (selectedBook.value && !listAllWorldbooks().includes(selectedBook.value)) {
        selectedBook.value = null;
        entries.value = [];
      }
    } finally {
      refreshing.value = false;
    }
  }

  const sortedFolders = computed(() => {
    const folders = [...(settings.value.folders ?? [])];
    if (!folders.includes(DEFAULT_FOLDER)) folders.unshift(DEFAULT_FOLDER);
    const meta = settings.value.folderMeta;
    const pinned = folders.filter(f => f !== DEFAULT_FOLDER && meta[f]?.pinned);
    const normal = folders.filter(f => f !== DEFAULT_FOLDER && !meta[f]?.pinned);
    return [DEFAULT_FOLDER, ...pinned, ...normal];
  });

  const allTags = ref<string[]>([]);

  function rebuildAllTags() {
    const set = new Set<string>(Object.keys(settings.value.tagDefs));
    Object.values(settings.value.books).forEach(b => (b.tags ?? []).forEach(t => set.add(t)));
    allTags.value = [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }

  rebuildAllTags();

  const filteredBooks = computed((): BookListItem[] => {
    const f = settings.value.filter ?? FilterStateSchema.parse({});
    const q = (f.search ?? '').trim().toLowerCase();
    const items: BookListItem[] = [];
    const allNames = filterStaleRenameNames(listAllWorldbooks());
    const order = (settings.value.bookOrder ?? []).filter(n => allNames.includes(n));
    const rest = allNames.filter(n => !order.includes(n)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const displayNames = [...order, ...rest];

    for (const name of displayNames) {
      const meta = getBookMeta(name);
      const binding = bindingIndex.value.get(name) ?? {
        charBound: false,
        characters: [],
        chatLore: [],
        chatLoreBound: false,
        globalEnabled: false,
        currentChatBound: false,
        currentCharPrimary: false,
        currentCharAdditional: false,
      };

      if (f.folder && !bookInFolder(meta, f.folder)) continue;
      if (f.charBound === 'bound' && !isBookCharOrChatBound(binding)) continue;
      if (f.charBound === 'unbound' && isBookCharOrChatBound(binding)) continue;
      if (f.globalOnly && !binding.globalEnabled) continue;
      if (f.currentCharOnly && !binding.currentCharPrimary && !binding.currentCharAdditional) continue;

      const selectedTags = f.selectedTags ?? [];
      if (selectedTags.length > 0) {
        const tags = meta.tags ?? [];
        if (!selectedTags.some(t => tags.includes(t))) continue;
      }

      let matchedEntryNames: string[] = [];
      if (q) {
        const charNames = binding.characters.map(c => c.name).join(' ');
        const hay = [name, meta.folder, charNames, ...meta.tags].join(' ').toLowerCase();
        let isMatch = hay.includes(q);

        const bookEntryNames = entryNamesMap.value[name] ?? [];
        const matchingEntries = bookEntryNames.filter(eName => eName.toLowerCase().includes(q));
        if (matchingEntries.length > 0) {
          isMatch = true;
          matchedEntryNames = matchingEntries;
        }

        if (!isMatch) continue;
      }

      const st = entryStats.value[name];
      items.push({
        name,
        meta,
        binding,
        entryCount: st?.total ?? null,
        enabledCount: st?.enabled ?? null,
        totalTokens: st?.totalTokens ?? null,
        enabledTokens: st?.enabledTokens ?? null,
        matchedEntryNames: matchedEntryNames.length > 0 ? matchedEntryNames : undefined,
      });
    }

    const sortOrder = settings.value.bookOrder ?? [];
    return items.sort((a, b) => {
      const pinMeta = (m: BookMeta) => (m.pinned ? 1 : 0);
      const pinDiff = pinMeta(b.meta) - pinMeta(a.meta);
      if (pinDiff !== 0) return pinDiff;

      if (hasOpenChat()) {
        const pin = (b: WorldbookBindingInfo) =>
          (b.currentChatBound ? 400 : 0) + (b.currentCharPrimary ? 300 : 0) + (b.currentCharAdditional ? 200 : 0);
        const chatPinDiff = pin(b.binding) - pin(a.binding);
        if (chatPinDiff !== 0) return chatPinDiff;
      }
      const ai = sortOrder.indexOf(a.name);
      const bi = sortOrder.indexOf(b.name);
      if (ai !== bi) return (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi);
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  });

  async function loadEntries(bookName: string, opts?: { silent?: boolean; preserveSelection?: boolean }) {
    const resolvedName = resolveBookNameAfterRename(bookName);
    if (!listAllWorldbooks().includes(resolvedName)) {
      if (externalRefreshPaused || pendingBookRename) return;
      console.warn('[世界书管理器] 世界书不存在，跳过加载', resolvedName);
      return;
    }
    if (!opts?.silent) entryLoading.value = true;
    const prevUids = opts?.preserveSelection ? [...selectedEntryUids.value] : [];
    try {
      entries.value = await getWorldbook(resolvedName);
      if (opts?.preserveSelection) {
        const valid = new Set(entries.value.map(e => e.uid));
        selectedEntryUids.value = prevUids.filter(u => valid.has(u));
      } else {
        selectedEntryUids.value = [];
      }
      const enabled = entries.value.filter(e => e.enabled).length;
      const tokens = await sumEntryTokens(entries.value);
      entryStats.value = {
        ...entryStats.value,
        [resolvedName]: {
          total: entries.value.length,
          enabled,
          totalTokens: tokens.total,
          enabledTokens: tokens.enabled,
        },
      };
      const names = entries.value.map(e => e.name || '').filter(Boolean);
      entryNamesMap.value[resolvedName] = names;
      statsLoader.entryStats[resolvedName] = entryStats.value[resolvedName]!;
      statsLoader.entryNamesMap[resolvedName] = names;
      void refreshEntryTokenCounts(entries.value);
    } catch (e) {
      console.error(e);
      if (externalRefreshPaused || pendingBookRename) return;
      toastr.error(`读取世界书失败: ${resolvedName}`);
      entries.value = [];
    } finally {
      entryLoading.value = false;
    }
  }

  async function ensureDefaultBookFromChat() {
    if (!hasOpenChat()) return false;
    const all = listAllWorldbooks();
    const chatWb = await safeChatWorldbookName();
    if (chatWb && all.includes(chatWb)) {
      selectBook(chatWb);
      return true;
    }
    const charWb = await safeCurrentCharWorldbookNames();
    if (charWb?.primary && all.includes(charWb.primary)) {
      selectBook(charWb.primary);
      return true;
    }
    return false;
  }

  function selectBook(name: string | null) {
    selectedBook.value = name;
    if (name) {
      touchBookMeta(name);
      void loadEntries(name);
    } else {
      entries.value = [];
      selectedEntryUids.value = [];
      entryTokenByUid.value = {};
    }
  }

  function toggleBookSelection(name: string) {
    const s = new Set(selectedBooks.value);
    if (s.has(name)) s.delete(name);
    else s.add(name);
    selectedBooks.value = s;
  }

  function selectAllVisible() {
    selectedBooks.value = new Set(filteredBooks.value.map(b => b.name));
    toastr.info(`已全选 ${selectedBooks.value.size} 本`);
  }

  function invertBookSelection() {
    const next = new Set(selectedBooks.value);
    for (const book of filteredBooks.value) {
      if (next.has(book.name)) next.delete(book.name);
      else next.add(book.name);
    }
    selectedBooks.value = next;
    toastr.info(`已反选，当前选中 ${next.size} 本`);
  }

  function clearBookSelection() {
    if (selectedBooks.value.size === 0) return;
    selectedBooks.value = new Set();
    toastr.info('已取消世界书勾选');
  }

  function selectUnboundChar() {
    selectedBooks.value = new Set(filteredBooks.value.filter(b => !isBookCharOrChatBound(b.binding)).map(b => b.name));
    toastr.info(`已勾选 ${selectedBooks.value.size} 本未绑定角色卡的世界书`);
  }

  function getDeleteBooksPreview(): DeleteBookPreviewItem[] {
    return buildDeleteBookPreview([...selectedBooks.value], bindingIndex.value);
  }

  async function deleteSelectedBooks() {
    const names = [...selectedBooks.value];
    if (names.length === 0) {
      toastr.warning('请先勾选世界书');
      return;
    }
    const bindingState = await captureBindingUndoState(names, bindingIndex.value);
    const backup = await captureBooksForUndo(names);
    const deleted = await deleteWorldbooksWithConfirm(names, bindingIndex.value);
    if (deleted.length === 0) return;
    const snaps = backup.filter(s => deleted.includes(s.name));
    await applyDeletedBooks(deleted, { silent: true });
    if (snaps.length > 0) {
      offerUndo(`已删除 ${deleted.length} 本世界书`, async () => {
        await restoreBooksFromUndo(snaps);
        await restoreBindingUndoState(bindingState);
      });
    } else {
      toastr.success(`已删除 ${deleted.length} 本世界书`);
    }
  }

  async function deleteSelectedBooksConfirmed() {
    const names = [...selectedBooks.value];
    if (names.length === 0) return;
    const bindingState = await captureBindingUndoState(names, bindingIndex.value);
    const backup = await captureBooksForUndo(names);
    const deleted = await deleteWorldbooksConfirmed(names, bindingIndex.value);
    if (deleted.length === 0) return;
    const snaps = backup.filter(s => deleted.includes(s.name));
    await applyDeletedBooks(deleted, { silent: true });
    if (snaps.length > 0) {
      offerUndo(`已删除 ${deleted.length} 本世界书`, async () => {
        await restoreBooksFromUndo(snaps);
        await restoreBindingUndoState(bindingState);
      });
    } else {
      toastr.success(`已删除 ${deleted.length} 本世界书`);
    }
  }

  async function applyDeletedBooks(deleted: string[], opts?: { silent?: boolean }) {
    if (deleted.length === 0) return;
    deleted.forEach(name => {
      delete settings.value.books[name];
      settings.value.bookOrder = settings.value.bookOrder.filter(n => n !== name);
      selectedBooks.value.delete(name);
      delete entryStats.value[name];
      delete entryNamesMap.value[name];
      dropBookStatsCache(statsLoader, name);
      if (selectedBook.value === name) selectBook(null);
    });
    if (!opts?.silent) toastr.success(`已删除 ${deleted.length} 本世界书`);
    markRefreshDirty({ bookList: true, binding: true });
    await refreshIncremental({ binding: true });
  }

  async function applyDeletedBookByName(name: string) {
    await applyDeletedBooks([name], { silent: true });
  }

  function applyBookRenameLocally(oldName: string, newName: string) {
    if (selectedBook.value === oldName || selectedBook.value === newName) {
      selectedBook.value = newName;
    }
    if (entryStats.value[oldName]) {
      entryStats.value[newName] = entryStats.value[oldName]!;
      delete entryStats.value[oldName];
      statsLoader.entryStats[newName] = entryStats.value[newName]!;
      delete statsLoader.entryStats[oldName];
    }
    if (entryNamesMap.value[oldName]) {
      entryNamesMap.value[newName] = entryNamesMap.value[oldName]!;
      delete entryNamesMap.value[oldName];
      statsLoader.entryNamesMap[newName] = entryNamesMap.value[newName]!;
      delete statsLoader.entryNamesMap[oldName];
    }
    const oldInfo = bindingIndex.value.get(oldName);
    if (oldInfo) {
      const globalSet = new Set(safeGlobalWorldbookNames());
      const info = _.cloneDeep(oldInfo);
      info.globalEnabled = globalSet.has(newName);
      bindingIndex.value.delete(oldName);
      bindingIndex.value.set(newName, info);
      void (async () => {
        const chatName = await safeChatWorldbookName();
        const currentCharWb = await safeCurrentCharWorldbookNames();
        const cur = bindingIndex.value.get(newName);
        if (!cur) return;
        cur.currentChatBound = hasOpenChat() && chatName === newName;
        cur.currentCharPrimary = currentCharWb?.primary === newName;
        cur.currentCharAdditional = currentCharWb?.additional.includes(newName) ?? false;
      })();
    } else {
      bindingIndex.value.delete(oldName);
    }
  }

  function commitBookMetaRename(oldName: string, newName: string, meta: BookMeta) {
    settings.value.books[newName] = BookMetaSchema.parse(_.cloneDeep(meta));
    delete settings.value.books[oldName];
    settings.value.bookOrder = settings.value.bookOrder.map(n => (n === oldName ? newName : n));
    if (settings.value.filter.search?.trim() === oldName) {
      settings.value.filter.search = newName;
    }
    if (selectedBooks.value.has(oldName)) {
      selectedBooks.value.delete(oldName);
      selectedBooks.value.add(newName);
    }
  }

  async function refreshBindingsForSelectedBooks() {
    let names = [...selectedBooks.value];
    if (names.length === 0 && selectedBook.value) names = [selectedBook.value];
    if (names.length === 0) {
      toastr.warning('请先勾选世界书');
      return;
    }
    await refreshBindings({ onlyBooks: names, includeBound: false, deepScan: false, silent: true });
  }

  async function copyBookToName(newName: string) {
    const name = selectedBook.value ?? [...selectedBooks.value][0];
    if (!name) {
      toastr.warning('请先选择一本世界书');
      return false;
    }
    const trimmed = newName.trim();
    if (!trimmed) {
      toastr.warning('请输入名称');
      return false;
    }
    if (listAllWorldbooks().includes(trimmed)) {
      toastr.error(`名称「${trimmed}」已存在`);
      return false;
    }
    try {
      await copyWorldbook(name, trimmed);
      const srcMeta = ensureBookMeta(name);
      const cloned = _.cloneDeep(srcMeta);
      cloned.pinned = false;
      cloned.firstImportAt = Date.now();
      settings.value.books[trimmed] = BookMetaSchema.parse(cloned);
      settings.value.bookOrder.push(trimmed);
      toastr.success(`已复制为「${trimmed}」`);
      markRefreshDirty({ bookList: true, stats: trimmed, reloadSelected: true });
      await refreshIncremental({ syncList: true, books: [trimmed], reloadSelected: true });
      selectBook(trimmed);
      return true;
    } catch (e) {
      toastr.error(String(e));
      return false;
    }
  }

  async function renameBookToName(
    newName: string,
    sourceName?: string,
    boundSnapshot?: { name: string; roles: ('primary' | 'additional')[] }[],
  ) {
    const explicit = sourceName?.trim();
    const checked = explicit ? [explicit] : [...selectedBooks.value];
    if (checked.length !== 1) {
      toastr.warning(checked.length === 0 ? '请先勾选一本要重命名的世界书' : '一次只能重命名一本，请只保留一个勾选');
      return false;
    }
    const name = checked[0];
    const trimmed = newName.trim();
    if (!trimmed || trimmed === name) return false;
    const allBooks = listAllWorldbooks();
    if (allBooks.includes(trimmed) && trimmed !== name && !allBooks.includes(name)) {
      toastr.error(`名称「${trimmed}」已存在`);
      return false;
    }
    const earlyMeta = readBookMetaSnapshot(name);
    const preseedMeta = BookMetaSchema.parse(
      _.cloneDeep({ ...earlyMeta, folder: inferAssignedFolder(earlyMeta) }),
    );
    const hadPreexistingTargetMeta = Boolean(settings.value.books[trimmed]);
    if (!hadPreexistingTargetMeta) {
      settings.value.books[trimmed] = _.cloneDeep(preseedMeta);
    }
    const wasViewing = selectedBook.value === name;
    if (wasViewing) selectedBook.value = trimmed;
    pendingBookRename = { from: name, to: trimmed };
    recentBookRenames.set(name, trimmed);
    setExternalRefreshPaused(true);
    let committedMeta: BookMeta | null = null;
    try {
      const boundInfo = bindingIndex.value.get(name);
      const boundChars = boundSnapshot ?? boundInfo?.characters ?? [];
      const { updatedCharacters } = await renameWorldbook(name, trimmed, {
        extraCharacterNames: boundChars.map(c => c.name),
        boundCharacters: boundChars,
      });
      const afterNames = listAllWorldbooks();
      if (afterNames.includes(name) && name !== trimmed) {
        throw new Error(`重命名未完成：旧世界书「${name}」仍在列表中`);
      }
      if (!afterNames.includes(trimmed)) {
        throw new Error(`重命名未完成：未找到「${trimmed}」`);
      }
      committedMeta = mergeBookMetaForRename(name, earlyMeta, trimmed);
      commitBookMetaRename(name, trimmed, committedMeta);
      applyBookRenameLocally(name, trimmed);
      selectedBook.value = trimmed;
      syncBookListFromTavern({ [trimmed]: committedMeta });
      rebuildAllTags();
      await loadEntries(trimmed, { silent: true, preserveSelection: true });
      flushPersist(settings.value);
      toastr.success(
        updatedCharacters.length > 0
          ? `已重命名为「${trimmed}」，并更新了 ${updatedCharacters.length} 张角色卡的世界书绑定`
          : `已重命名为「${trimmed}」`,
      );
      try {
        await SillyTavern.updateWorldInfoList?.();
      } catch {
        /* ignore */
      }
      syncBookListFromTavern({ [trimmed]: committedMeta });
      await refreshIncremental({ books: [trimmed], reloadSelected: false });
      flushPersist(settings.value);
      return true;
    } catch (e) {
      if (!hadPreexistingTargetMeta) delete settings.value.books[trimmed];
      recentBookRenames.delete(name);
      if (wasViewing && selectedBook.value === trimmed) selectedBook.value = name;
      toastr.error(String(e));
      markRefreshDirty({ bookList: true, binding: true });
      try {
        await SillyTavern.updateWorldInfoList?.();
      } catch {
        /* ignore */
      }
      syncBookListFromTavern();
      await refreshBindings({ deepScan: true, mode: 'refresh', silent: true });
      return false;
    } finally {
      pendingBookRename = null;
      setExternalRefreshPaused(false);
    }
  }

  function addFolder(name: string, meta?: Partial<FolderMeta>) {
    const n = name.trim();
    if (!n || n === DEFAULT_FOLDER || settings.value.folders.includes(n)) return false;
    settings.value.folders.push(n);
    settings.value.folderMeta[n] = FolderMetaSchema.parse({ ...meta });
    upsertTag(n, '#10b981');
    return true;
  }

  function updateFolderMeta(name: string, patch: Partial<FolderMeta>) {
    if (name === DEFAULT_FOLDER) return;
    const cur = getFolderMeta(name);
    settings.value.folderMeta[name] = FolderMetaSchema.parse({ ...cur, ...patch });
  }

  function removeFolder(name: string) {
    if (name === DEFAULT_FOLDER) return;
    settings.value.folders = settings.value.folders.filter(f => f !== name);
    delete settings.value.folderMeta[name];
    Object.values(settings.value.books).forEach(b => {
      if (b.folder === name) b.folder = DEFAULT_FOLDER;
    });
    if (settings.value.filter.folder === name) settings.value.filter.folder = null;
  }

  function toggleFolderPin(name: string) {
    const cur = getFolderMeta(name);
    settings.value.folderMeta[name] = { ...cur, pinned: !cur.pinned };
  }

  function setBookFolder(bookName: string, folder: string) {
    ensureBookMeta(bookName).folder = folder;
  }

  function reorderBooks(fromName: string, toName: string) {
    const order = [...settings.value.bookOrder];
    const fromIdx = order.indexOf(fromName);
    const toIdx = order.indexOf(toName);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, fromName);
    settings.value.bookOrder = order;
  }

  function toggleBookPin(name: string) {
    const m = ensureBookMeta(name);
    m.pinned = !m.pinned;
    toastr.info(m.pinned ? `「${name}」已置顶` : `「${name}」已取消置顶`);
  }

  /** 勾选批量或当前选中一本：全部置顶；若已全部置顶则全部取消 */
  function togglePinSelectedBooks() {
    let names = [...selectedBooks.value];
    if (names.length === 0 && selectedBook.value) {
      names = [selectedBook.value];
    }
    if (names.length === 0) {
      toastr.warning('请先勾选或点选一本世界书');
      return;
    }
    const allPinned = names.every(n => !!ensureBookMeta(n).pinned);
    const nextPinned = !allPinned;
    names.forEach(n => {
      ensureBookMeta(n).pinned = nextPinned;
    });
    syncBookOrderPinnedFirst();
    if (names.length === 1) {
      toastr.info(nextPinned ? `「${names[0]}」已置顶` : `「${names[0]}」已取消置顶`);
    } else {
      toastr.info(nextPinned ? `已置顶 ${names.length} 本` : `已取消 ${names.length} 本置顶`);
    }
  }

  function applyBookOrder(names: string[]) {
    settings.value.bookOrder = names;
  }

  /** 置顶项前移，避免 filteredBooks 再按 pinned 重排导致列表整表重挂载 */
  function syncBookOrderPinnedFirst() {
    const allNames = listAllWorldbooks();
    const order = settings.value.bookOrder.filter(n => allNames.includes(n));
    const missing = allNames.filter(n => !order.includes(n));
    const pinned = order.filter(n => ensureBookMeta(n).pinned);
    const rest = order.filter(n => !ensureBookMeta(n).pinned);
    const missingPinned = missing.filter(n => ensureBookMeta(n).pinned);
    const missingRest = missing.filter(n => !ensureBookMeta(n).pinned);
    applyBookOrder([...pinned, ...missingPinned, ...rest, ...missingRest]);
  }

  /** 快速排序：scope=visible 仅重排筛选结果；scope=all 重排全部世界书 */
  async function sortBooks(mode: BookSortMode, scope: 'visible' | 'all' = 'visible') {
    const label = BOOK_SORT_OPTIONS.find(o => o.value === mode)?.label ?? mode;

    const namesToSort = scope === 'all' ? listAllWorldbooks() : filteredBooks.value.map(b => b.name);
    if (mode.startsWith('import')) {
      await prepareImportSortTimes(namesToSort, ensureBookMeta, ensurePluginBaseline());
    }

    const ctx = bookSortContext();

    if (scope === 'all') {
      const allNames = listAllWorldbooks();
      const pinned = allNames.filter(n => ensureBookMeta(n).pinned);
      const rest = allNames.filter(n => !ensureBookMeta(n).pinned);
      const sortedRest = sortBookNames(rest, mode, ctx);
      applyBookOrder([...pinned, ...sortedRest]);
      settings.value.lastBookSortMode = mode;
      settings.value.lastBookSortScope = scope;
      toastr.success(`已按「${label}」排序全部 ${allNames.length} 本`);
      return;
    }

    const visible = filteredBooks.value;
    const pinned = visible.filter(b => b.meta.pinned).map(b => b.name);
    const rest = visible.filter(b => !b.meta.pinned).map(b => b.name);
    const sortedRest = sortBookNames(rest, mode, ctx);
    const newVisibleOrder = [...pinned, ...sortedRest];
    const visibleNames = visible.map(b => b.name);
    settings.value.bookOrder = mergeVisibleIntoBookOrder(settings.value.bookOrder, visibleNames, newVisibleOrder);
    settings.value.lastBookSortMode = mode;
    settings.value.lastBookSortScope = scope;
    toastr.success(`已按「${label}」排序当前列表（${visibleNames.length} 本）`);
  }

  async function sortVisibleBooks(mode: BookSortMode) {
    await sortBooks(mode, 'visible');
  }

  type BookUndoSnapshot = { name: string; entries: WorldbookEntry[]; meta: BookMeta };

  async function captureBooksForUndo(names: string[]): Promise<BookUndoSnapshot[]> {
    const snaps: BookUndoSnapshot[] = [];
    for (const name of names) {
      try {
        const entries = await getWorldbook(name);
        snaps.push({
          name,
          entries: _.cloneDeep(entries),
          meta: BookMetaSchema.parse(_.cloneDeep(settings.value.books[name] ?? {})),
        });
      } catch (e) {
        console.warn('[世界书管理器] 备份世界书失败，无法撤销', name, e);
      }
    }
    return snaps;
  }

  async function restoreBooksFromUndo(snaps: BookUndoSnapshot[]) {
    for (const s of snaps) {
      const names = listAllWorldbooks();
      if (!names.includes(s.name)) {
        await createWorldbook(s.name, s.entries);
      } else {
        await replaceWorldbook(s.name, s.entries, { render: 'none' as any });
      }
      settings.value.books[s.name] = BookMetaSchema.parse(_.cloneDeep(s.meta));
      if (!settings.value.bookOrder.includes(s.name)) {
        settings.value.bookOrder.push(s.name);
      }
    }
    await refreshIncremental({ syncList: true, books: snaps.map(s => s.name), binding: true });
  }
  function moveSelectedBooksBelowAnchor(anchorName: string) {
    const selectedSet = new Set(selectedBooks.value);
    if (selectedSet.size === 0) {
      toastr.warning('请先勾选世界书');
      return;
    }
    const order = [...settings.value.bookOrder];
    const picked = order.filter(n => selectedSet.has(n));
    const missing = [...selectedSet].filter(n => !order.includes(n));
    const rest = order.filter(n => !selectedSet.has(n));
    const allPicked = [...picked, ...missing];

    if (selectedSet.has(anchorName)) {
      let insertAt = 0;
      const anchorIdx = order.indexOf(anchorName);
      for (let i = 0; i < anchorIdx; i++) {
        if (!selectedSet.has(order[i])) insertAt++;
      }
      const others = allPicked.filter(n => n !== anchorName);
      rest.splice(insertAt, 0, anchorName, ...others);
    } else {
      const anchorIdx = rest.indexOf(anchorName);
      if (anchorIdx < 0) {
        toastr.warning('无法定位目标世界书');
        return;
      }
      rest.splice(anchorIdx + 1, 0, ...allPicked);
    }
    settings.value.bookOrder = rest;
    toastr.success(`已将 ${allPicked.length} 本世界书移到「${anchorName}」下方`);
  }

  function reorderFolders(fromName: string, toName: string) {
    const folders = sortedFolders.value.filter(f => f !== DEFAULT_FOLDER);
    const fromIdx = folders.indexOf(fromName);
    const toIdx = folders.indexOf(toName);
    if (fromIdx < 0 || toIdx < 0) return;
    folders.splice(fromIdx, 1);
    folders.splice(toIdx, 0, fromName);
    settings.value.folders = [DEFAULT_FOLDER, ...folders];
  }

  function upsertTag(name: string, color: string) {
    const n = name.trim();
    if (!n) return;
    settings.value.tagDefs[n] = { color };
    rebuildAllTags();
  }

  function removeTagDef(name: string) {
    delete settings.value.tagDefs[name];
    Object.values(settings.value.books).forEach(b => {
      b.tags = b.tags.filter(t => t !== name);
    });
    settings.value.filter.selectedTags = settings.value.filter.selectedTags.filter(t => t !== name);
    rebuildAllTags();
  }

  function toggleBookTag(bookName: string, tag: string) {
    const meta = ensureBookMeta(bookName);
    if (meta.tags.includes(tag)) meta.tags = meta.tags.filter(t => t !== tag);
    else meta.tags.push(tag);
  }

  function addTagsToSelectedBooks(tags: string[]) {
    const names = [...selectedBooks.value];
    const tagList = tags.map(t => t.trim()).filter(Boolean);
    if (names.length === 0) {
      toastr.warning('请先勾选世界书');
      return;
    }
    if (tagList.length === 0) {
      toastr.warning('请选择或创建要添加的标签');
      return;
    }
    tagList.forEach(t => {
      if (!settings.value.tagDefs[t]) settings.value.tagDefs[t] = { color: '#6366f1' };
    });
    let added = 0;
    for (const name of names) {
      const meta = ensureBookMeta(name);
      for (const t of tagList) {
        if (!meta.tags.includes(t)) {
          meta.tags.push(t);
          added++;
        }
      }
    }
    toastr.success(`已为 ${names.length} 本世界书添加标签（新增 ${added} 处）`);
    rebuildAllTags();
  }

  function removeTagsFromSelectedBooks(tags: string[]) {
    const names = [...selectedBooks.value];
    const tagList = tags.map(t => t.trim()).filter(Boolean);
    if (names.length === 0 || tagList.length === 0) {
      toastr.warning('请先勾选世界书并选择要移除的标签');
      return;
    }
    const tagSet = new Set(tagList);
    for (const name of names) {
      const meta = ensureBookMeta(name);
      meta.tags = meta.tags.filter(t => !tagSet.has(t));
    }
    toastr.success(`已从 ${names.length} 本世界书移除所选标签`);
    rebuildAllTags();
  }

  function moveSelectedBooksToFolder(folder: string) {
    const names = [...selectedBooks.value];
    if (names.length === 0) {
      toastr.warning('请先勾选世界书');
      return;
    }
    if (!settings.value.folders.includes(folder)) {
      toastr.warning('文件夹不存在');
      return;
    }
    names.forEach(name => setBookFolder(name, folder));
    flushPersist(settings.value);
    toastr.success(`已将 ${names.length} 本世界书归入「${folder}」`);
  }

  function toggleFilterTag(tag: string) {
    const f = settings.value.filter;
    if (f.selectedTags.includes(tag)) f.selectedTags = f.selectedTags.filter(t => t !== tag);
    else f.selectedTags = [...f.selectedTags, tag];
  }

  function isEntrySelected(uid: number): boolean {
    const id = Number(uid);
    return selectedEntryUids.value.some(u => Number(u) === id);
  }

  const selectedEntryCount = computed(() => selectedEntryUids.value.length);

  function toggleEntryUid(uid: number) {
    const id = Number(uid);
    const list = selectedEntryUids.value.map(Number);
    if (list.includes(id)) {
      selectedEntryUids.value = list.filter(u => u !== id);
    } else {
      selectedEntryUids.value = [...list, id];
    }
  }

  /** 将已勾选条目整体移动到 anchorUid 条目正下方（保持勾选条目相对顺序） */
  async function moveSelectedEntriesBelowAnchor(anchorUid: number) {
    const book = selectedBook.value;
    const anchor = Number(anchorUid);
    const selectedSet = new Set(selectedEntryUids.value.map(Number));
    if (!book || selectedSet.size === 0) return;

    let moved = 0;
    await updateWorldbookWith(
      book,
      wb => {
        const picked = wb.filter(e => selectedSet.has(Number(e.uid)));
        const rest = wb.filter(e => !selectedSet.has(Number(e.uid)));
        const anchorInSelection = selectedSet.has(anchor);

        if (anchorInSelection) {
          const anchorEntry = wb.find(e => Number(e.uid) === anchor);
          const others = picked.filter(e => Number(e.uid) !== anchor);
          if (!anchorEntry) return wb;
          let insertAt = 0;
          const anchorOrigIdx = wb.findIndex(e => Number(e.uid) === anchor);
          for (let i = 0; i < anchorOrigIdx; i++) {
            if (!selectedSet.has(Number(wb[i].uid))) insertAt++;
          }
          rest.splice(insertAt, 0, anchorEntry, ...others);
        } else {
          const anchorIdx = rest.findIndex(e => Number(e.uid) === anchor);
          if (anchorIdx < 0) {
            toastr.warning('无法定位目标条目');
            return wb;
          }
          rest.splice(anchorIdx + 1, 0, ...picked);
        }
        moved = picked.length;
        return rest;
      },
      { render: 'none' as any },
    );
    if (moved > 0) {
      touchBookMeta(book);
      toastr.success(`已将 ${moved} 个条目移到目标下方`);
      await loadEntries(book, { silent: true, preserveSelection: true });
    }
  }

  /** 批量上移/下移所有已勾选条目（各移动一格，保持相对顺序） */
  async function moveSelectedEntriesByOffset(delta: number) {
    const book = selectedBook.value;
    if (!book || delta === 0 || selectedEntryUids.value.length === 0) return;

    const sortedUids = [...selectedEntryUids.value].sort((a, b) => {
      const ia = entries.value.findIndex(e => e.uid === a);
      const ib = entries.value.findIndex(e => e.uid === b);
      return ia - ib;
    });
    const order = delta < 0 ? sortedUids : [...sortedUids].reverse();

    await updateWorldbookWith(
      book,
      wb => {
        const next = [...wb];
        for (const uid of order) {
          const idx = next.findIndex(e => e.uid === uid);
          if (idx < 0) continue;
          const newIdx = idx + delta;
          if (newIdx < 0 || newIdx >= next.length) continue;
          const [item] = next.splice(idx, 1);
          next.splice(newIdx, 0, item);
        }
        return next;
      },
      { render: 'none' as any },
    );
    touchBookMeta(book);
    await loadEntries(book, { silent: true, preserveSelection: true });
  }

  async function moveEntryToPosition(uid: number, oneBasedPosition: number) {
    const book = selectedBook.value;
    if (!book) return;
    const target = Math.max(1, Math.min(oneBasedPosition, entries.value.length));
    await reorderEntryToIndex(uid, target - 1);
  }

  function selectAllEntries() {
    selectedEntryUids.value = entries.value.map(e => e.uid);
    toastr.info(`已全选 ${selectedEntryUids.value.length} 个条目`);
  }

  function invertEntrySelection() {
    const set = new Set(selectedEntryUids.value);
    selectedEntryUids.value = entries.value.filter(e => !set.has(e.uid)).map(e => e.uid);
    toastr.info(`已反选，当前选中 ${selectedEntryUids.value.length} 个条目`);
  }

  function clearEntrySelection() {
    if (selectedEntryUids.value.length === 0) return;
    selectedEntryUids.value = [];
    toastr.info('已取消条目勾选');
  }

  const dragEntryUid = ref<number | null>(null);

  async function reorderEntryToIndex(fromUid: number, toIndex: number) {
    const book = selectedBook.value;
    if (!book) return;
    await updateWorldbookWith(
      book,
      wb => {
        const fromIdx = wb.findIndex(e => e.uid === fromUid);
        if (fromIdx < 0) return wb;
        const next = [...wb];
        const [item] = next.splice(fromIdx, 1);
        let insertAt = Math.max(0, Math.min(toIndex, next.length));
        if (fromIdx < insertAt) insertAt -= 1;
        next.splice(insertAt, 0, item);
        return next;
      },
      { render: 'none' as any },
    );
    await loadEntries(book, { silent: true, preserveSelection: true });
  }

  async function moveEntryByOffset(uid: number, delta: number) {
    const book = selectedBook.value;
    if (!book || delta === 0) return;
    const idx = entries.value.findIndex(e => e.uid === uid);
    const newIdx = idx + delta;
    if (idx < 0 || newIdx < 0 || newIdx >= entries.value.length) return;
    await reorderEntryToIndex(uid, newIdx);
  }

  async function saveEntry(
    uid: number,
    draft: EntryEditDraft,
    opts?: { silent?: boolean; diffBefore?: EntryEditDraft },
  ) {
    const book = selectedBook.value;
    if (!book) return;
    const prevEntry = entries.value.find(e => e.uid === uid);
    const beforeDraft = opts?.diffBefore ?? (prevEntry ? entryToEditDraft(prevEntry) : null);
    const updated = await updateWorldbookWith(
      book,
      wb =>
        wb.map(entry => {
          if (entry.uid !== uid) return entry;
          const next = _.cloneDeep(entry);
          applyEditDraftToEntry(next, draft);
          return next;
        }),
      { render: 'immediate' },
    );
    entries.value = updated;
    touchBookMeta(book);
    if (!opts?.silent && beforeDraft && !draftsEqual(beforeDraft, draft)) {
      entrySaveSnapshots.value = {
        ...entrySaveSnapshots.value,
        [uid]: {
          bookName: book,
          uid,
          savedAt: Date.now(),
          before: _.cloneDeep(beforeDraft),
          after: _.cloneDeep(draft),
        },
      };
    }
    const enabled = updated.filter(e => e.enabled).length;
    const tokens = await sumEntryTokens(updated);
    entryStats.value = {
      ...entryStats.value,
      [book]: {
        total: updated.length,
        enabled,
        totalTokens: tokens.total,
        enabledTokens: tokens.enabled,
      },
    };
    entryNamesMap.value[book] = updated.map(e => e.name || '').filter(Boolean);
    void refreshEntryTokenCounts(updated);
    if (!opts?.silent) toastr.success('条目已保存');
  }

  function hasEntrySaveSnapshot(uid: number): boolean {
    return !!entrySaveSnapshots.value[uid];
  }

  function getEntrySaveSnapshot(uid: number): EntrySaveSnapshot | null {
    return entrySaveSnapshots.value[uid] ?? null;
  }

  function clearEntrySaveSnapshot(uid: number) {
    if (!entrySaveSnapshots.value[uid]) return;
    const next = { ...entrySaveSnapshots.value };
    delete next[uid];
    entrySaveSnapshots.value = next;
  }

  async function restoreEntryFromSnapshot(uid: number): Promise<boolean> {
    const snap = entrySaveSnapshots.value[uid];
    if (!snap) return false;
    await saveEntry(uid, _.cloneDeep(snap.before), { silent: true });
    clearEntrySaveSnapshot(uid);
    return true;
  }

  async function deleteSelectedEntriesConfirmed() {
    clearActiveUndo();
    const book = selectedBook.value;
    if (!book || selectedEntryUids.value.length === 0) return;
    const count = selectedEntryUids.value.length;
    const uids = new Set(selectedEntryUids.value);
    const wb = await getWorldbook(book);
    const backup = wb.filter(e => uids.has(e.uid)).map(e => _.cloneDeep(e));
    await deleteWorldbookEntries(book, e => uids.has(e.uid), { render: 'none' as any });
    await loadEntries(book, { silent: true });
    markRefreshDirty({ stats: book });
    await refreshIncremental({ books: [book] });
    if (backup.length > 0) {
      offerUndo(`已删除 ${backup.length} 个条目`, async () => {
        const payloads = backup.map(({ uid, ...rest }) => rest);
        await createWorldbookEntries(book, payloads, { render: 'none' as any });
        await loadEntries(book, { silent: true, preserveSelection: true });
        markRefreshDirty({ stats: book });
        await refreshIncremental({ books: [book] });
      });
    } else {
      toastr.success(`已删除 ${count} 个条目`);
    }
  }

  async function transferSelectedEntries(targetBook: string, mode: 'copy' | 'move') {
    clearActiveUndo();
    const book = selectedBook.value;
    if (!book || !targetBook || selectedEntryUids.value.length === 0) return;
    if (book === targetBook) {
      toastr.warning('目标不能与源相同');
      return;
    }
    const uids = new Set(selectedEntryUids.value);
    const src = await getWorldbook(book);
    const picked = src.filter(e => uids.has(e.uid));
    const newEntries = picked.map(({ uid, ...rest }) => rest);
    await createWorldbookEntries(targetBook, newEntries, { render: 'none' as any });
    if (mode === 'move') {
      await deleteWorldbookEntries(book, e => uids.has(e.uid), { render: 'none' as any });
    }
    toastr.success(`已${mode === 'move' ? '移动到' : '复制到'}目标世界书 ${picked.length} 个条目`);
    await loadEntries(book, { silent: true });
    markRefreshDirty({ stats: [book, targetBook] });
    await refreshIncremental({ books: [book, targetBook] });
    selectedEntryUids.value = [];
  }

  async function setSelectedBooksGlobalEnabled(enable: boolean) {
    const names = [...selectedBooks.value];
    if (names.length === 0) {
      toastr.warning('请先勾选世界书');
      return;
    }
    try {
      await setWorldbooksGlobalEnabled(names, enable);
      markRefreshDirty({ binding: true });
      await refreshIncremental({ binding: true });
      toastr.success(enable ? `已将 ${names.length} 本设为全局世界书` : `已取消 ${names.length} 本的全局开启`);
    } catch (e) {
      console.error('[世界书管理器] 设置全局世界书失败', e);
      toastr.error('设置全局世界书失败');
    }
  }

  async function batchEditSelectedEntries(options: {
    fields: {
      enabled?: boolean;
      strategyType?: 'constant' | 'selective' | 'vectorized';
      probability?: number;
      positionType?: WorldbookEntry['position']['type'];
      positionRole?: 'system' | 'assistant' | 'user';
      positionDepth?: number;
      positionOrder?: number;
      preventIncoming?: boolean;
      preventOutgoing?: boolean;
      scanDepth?: string;
    };
    replace?: {
      findText: string;
      replaceText: string;
      targetContent?: boolean;
      targetName?: boolean;
      targetKeys?: boolean;
    };
  }) {
    const book = selectedBook.value;
    if (!book || selectedEntryUids.value.length === 0) return;
    const uids = new Set(selectedEntryUids.value);

    await updateWorldbookWith(
      book,
      wb => {
        return wb.map(entry => {
          if (!uids.has(entry.uid)) return entry;
          const next = _.cloneDeep(entry);

          // 1. 字段批量覆盖
          if (options.fields.enabled !== undefined) next.enabled = options.fields.enabled;
          if (options.fields.probability !== undefined) {
            next.probability = Math.min(100, Math.max(0, options.fields.probability));
          }
          if (options.fields.strategyType !== undefined) {
            if (!next.strategy) {
              next.strategy = {
                type: 'selective',
                keys: [],
                keys_secondary: { logic: 'and_any', keys: [] },
                scan_depth: 'same_as_global',
              };
            }
            next.strategy.type = options.fields.strategyType;
          }
          if (options.fields.scanDepth !== undefined) {
            if (!next.strategy) {
              next.strategy = {
                type: 'selective',
                keys: [],
                keys_secondary: { logic: 'and_any', keys: [] },
                scan_depth: 'same_as_global',
              };
            }
            const sd = options.fields.scanDepth.trim();
            next.strategy.scan_depth = sd === 'same_as_global' || sd === '' ? 'same_as_global' : Number(sd) || 1;
          }
          if (options.fields.positionType !== undefined) {
            if (!next.position)
              next.position = { type: 'after_character_definition', role: 'system', depth: 0, order: 100 };
            next.position.type = options.fields.positionType;
          }
          if (options.fields.positionRole !== undefined) {
            if (!next.position)
              next.position = { type: 'after_character_definition', role: 'system', depth: 0, order: 100 };
            next.position.role = options.fields.positionRole;
          }
          if (options.fields.positionDepth !== undefined) {
            if (!next.position)
              next.position = { type: 'after_character_definition', role: 'system', depth: 0, order: 100 };
            next.position.depth = options.fields.positionDepth;
          }
          if (options.fields.positionOrder !== undefined) {
            if (!next.position)
              next.position = { type: 'after_character_definition', role: 'system', depth: 0, order: 100 };
            next.position.order = options.fields.positionOrder;
          }
          if (options.fields.preventIncoming !== undefined) {
            if (!next.recursion)
              next.recursion = { prevent_incoming: false, prevent_outgoing: false, delay_until: null };
            next.recursion.prevent_incoming = options.fields.preventIncoming;
          }
          if (options.fields.preventOutgoing !== undefined) {
            if (!next.recursion)
              next.recursion = { prevent_incoming: false, prevent_outgoing: false, delay_until: null };
            next.recursion.prevent_outgoing = options.fields.preventOutgoing;
          }

          // 2. 文本查找与替换/删除
          if (options.replace && options.replace.findText) {
            const findText = options.replace.findText;
            const replaceText = options.replace.replaceText ?? '';

            if (options.replace.targetContent && next.content) {
              next.content = next.content.replaceAll(findText, replaceText);
            }
            if (options.replace.targetName && next.name) {
              next.name = next.name.replaceAll(findText, replaceText);
            }
            if (options.replace.targetKeys) {
              if (next.strategy && Array.isArray(next.strategy.keys)) {
                next.strategy.keys = next.strategy.keys
                  .map(k => {
                    if (typeof k === 'string') {
                      return k.replaceAll(findText, replaceText);
                    }
                    return k;
                  })
                  .filter(Boolean);
              }
              if (next.strategy?.keys_secondary && Array.isArray(next.strategy.keys_secondary.keys)) {
                next.strategy.keys_secondary.keys = next.strategy.keys_secondary.keys
                  .map(k => {
                    if (typeof k === 'string') {
                      return k.replaceAll(findText, replaceText);
                    }
                    return k;
                  })
                  .filter(Boolean);
              }
            }
          }

          return next;
        });
      },
      { render: 'immediate' },
    );

    touchBookMeta(book);
    await loadEntries(book, { silent: true, preserveSelection: true });
    toastr.success(`已批量修改 ${selectedEntryUids.value.length} 个条目`);
  }

  const hasChat = computed(() => hasOpenChat());

  const currentBookTokenStats = computed(() => {
    const book = selectedBook.value;
    if (!book) return null;
    if (entries.value.length > 0) {
      let rawTotal = 0;
      let rawEnabled = 0;
      let hasNull = false;
      for (const e of entries.value) {
        const info = entryTokenByUid.value[e.uid];
        if (!info || info.raw == null) {
          hasNull = true;
          break;
        }
        rawTotal += info.raw;
        if (e.enabled) rawEnabled += info.raw;
      }
      if (!hasNull) return { total: rawTotal, enabled: rawEnabled };
    }
    const st = entryStats.value[book];
    if (!st || st.totalTokens == null) return null;
    return { total: st.totalTokens, enabled: st.enabledTokens ?? 0 };
  });

  return {
    DEFAULT_FOLDER,
    hasChat,
    settings,
    bindingIndex,
    bindingScanReport,
    bindingChecking,
    bindingLastRefreshedAt,
    bindingProgress,
    bindingStatus,
    selectedBooks,
    selectedBook,
    entries,
    entrySearchQuery,
    filteredEntries,
    selectedEntryUids,
    entryLoading,
    refreshing,
    entryStats,
    entryNamesMap,
    entryTokenByUid,
    entrySaveSnapshots,
    currentBookTokenStats,
    dragBookName,
    dragFolderName,
    sortedFolders,
    allTags,
    filteredBooks,
    refreshAll,
    refreshFromTavern,
    refreshIncremental,
    flushPendingRefresh,
    markRefreshDirty,
    setExternalRefreshPaused,
    isExternalRefreshPaused,
    refreshBindings,
    refreshBindingsForSelectedBooks,
    ensureDefaultBookFromChat,
    loadEntries,
    selectBook,
    toggleBookSelection,
    selectAllVisible,
    invertBookSelection,
    clearBookSelection,
    selectUnboundChar,
    getDeleteBooksPreview,
    deleteSelectedBooks,
    deleteSelectedBooksConfirmed,
    applyDeletedBookByName,
    copyBookToName,
    renameBookToName,
    getFolderMeta,
    bookInFolder,
    addFolder,
    updateFolderMeta,
    removeFolder,
    toggleFolderPin,
    setBookFolder,
    reorderBooks,
    toggleBookPin,
    togglePinSelectedBooks,
    sortBooks,
    sortVisibleBooks,
    moveSelectedBooksBelowAnchor,
    reorderFolders,
    upsertTag,
    removeTagDef,
    toggleBookTag,
    addTagsToSelectedBooks,
    removeTagsFromSelectedBooks,
    moveSelectedBooksToFolder,
    toggleFilterTag,
    isEntrySelected,
    selectedEntryCount,
    dragEntryUid,
    toggleEntryUid,
    reorderEntryToIndex,
    moveEntryByOffset,
    moveSelectedEntriesByOffset,
    moveSelectedEntriesBelowAnchor,
    moveEntryToPosition,
    selectAllEntries,
    invertEntrySelection,
    clearEntrySelection,
    saveEntry,
    hasEntrySaveSnapshot,
    getEntrySaveSnapshot,
    clearEntrySaveSnapshot,
    restoreEntryFromSnapshot,
    deleteSelectedEntriesConfirmed,
    transferSelectedEntries,
    setSelectedBooksGlobalEnabled,
    batchEditSelectedEntries,
    ensureBookMeta,
    getBookMeta,
    ensureBookStatsForNames,
    ensureBookEntryNamesForNames,
  };
});
