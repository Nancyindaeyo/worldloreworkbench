import { sumEntryTokens } from './token-count';

export type EntryBookStats = {
  total: number;
  enabled: number;
  totalTokens: number | null;
  enabledTokens: number | null;
};

export type BookStatsLoaderState = {
  entryStats: Record<string, EntryBookStats>;
  entryNamesMap: Record<string, string[]>;
  pendingStats: Set<string>;
  pendingNames: Set<string>;
};

export function createBookStatsLoaderState(): BookStatsLoaderState {
  return {
    entryStats: {},
    entryNamesMap: {},
    pendingStats: new Set(),
    pendingNames: new Set(),
  };
}

async function statsFromWorldbook(wb: WorldbookEntry[]): Promise<EntryBookStats> {
  const tokens = await sumEntryTokens(wb);
  return {
    total: wb.length,
    enabled: wb.filter(e => e.enabled).length,
    totalTokens: tokens.total,
    enabledTokens: tokens.enabled,
  };
}

const emptyStats = (): EntryBookStats => ({
  total: 0,
  enabled: 0,
  totalTokens: 0,
  enabledTokens: 0,
});

/** 按需加载世界书条目统计（含 token）；已加载的会跳过 */
export async function ensureBookStats(
  state: BookStatsLoaderState,
  names: string[],
  onUpdate: (patch: { entryStats?: Record<string, EntryBookStats>; entryNamesMap?: Record<string, string[]> }) => void,
): Promise<void> {
  const unique = [...new Set(names.filter(Boolean))];
  const todo = unique.filter(n => !(n in state.entryStats) && !state.pendingStats.has(n));
  if (todo.length === 0) return;

  todo.forEach(n => state.pendingStats.add(n));
  const BATCH = 6;

  try {
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      const patchStats: Record<string, EntryBookStats> = { ...state.entryStats };
      const patchNames: Record<string, string[]> = { ...state.entryNamesMap };

      await Promise.all(
        chunk.map(async name => {
          try {
            const wb = await getWorldbook(name);
            patchStats[name] = await statsFromWorldbook(wb);
            patchNames[name] = wb.map(e => e.name || '').filter(Boolean);
          } catch {
            patchStats[name] = emptyStats();
            patchNames[name] = [];
          } finally {
            state.pendingStats.delete(name);
          }
        }),
      );

      state.entryStats = patchStats;
      state.entryNamesMap = patchNames;
      onUpdate({ entryStats: { ...patchStats }, entryNamesMap: { ...patchNames } });
    }
  } finally {
    todo.forEach(n => state.pendingStats.delete(n));
  }
}

/** 仅加载条目名称（用于搜索匹配），不计算 token */
export async function ensureBookEntryNames(
  state: BookStatsLoaderState,
  names: string[],
  onUpdate: (patch: { entryNamesMap: Record<string, string[]> }) => void,
): Promise<void> {
  const unique = [...new Set(names.filter(Boolean))];
  const todo = unique.filter(n => !(n in state.entryNamesMap) && !state.pendingNames.has(n));
  if (todo.length === 0) return;

  todo.forEach(n => state.pendingNames.add(n));
  const BATCH = 10;

  try {
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      const patchNames: Record<string, string[]> = { ...state.entryNamesMap };

      await Promise.all(
        chunk.map(async name => {
          try {
            const wb = await getWorldbook(name);
            patchNames[name] = wb.map(e => e.name || '').filter(Boolean);
          } catch {
            patchNames[name] = [];
          } finally {
            state.pendingNames.delete(name);
          }
        }),
      );

      state.entryNamesMap = patchNames;
      onUpdate({ entryNamesMap: { ...patchNames } });
    }
  } finally {
    todo.forEach(n => state.pendingNames.delete(n));
  }
}

/** 删除某书的缓存（删书后调用） */
export function dropBookStatsCache(state: BookStatsLoaderState, name: string): void {
  delete state.entryStats[name];
  delete state.entryNamesMap[name];
  state.pendingStats.delete(name);
  state.pendingNames.delete(name);
}
