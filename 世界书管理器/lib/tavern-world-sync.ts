import type { BookMeta } from '../schema';

const WORLD_IMPORT_EXT_KEY = 'wm_first_import_at';
const BATCH_SIZE = 8;

type WorldInfoData = {
  entries?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
};

function hasRecordedImport(meta: BookMeta, ext: Record<string, unknown>): boolean {
  const t = meta.firstImportAt ?? ext[WORLD_IMPORT_EXT_KEY];
  return typeof t === 'number' && t > 0;
}

/**
 * 写入导入时间：优先沿用已有记录；否则写入 timestamp（装插件基准或当前时刻）。
 * 不再读取文件 Last-Modified（对装插件前的旧书无区分意义）。
 */
export async function ensureImportTimeOnBook(
  worldName: string,
  ensureBookMeta: (name: string) => BookMeta,
  timestamp: number,
): Promise<boolean> {
  const meta = ensureBookMeta(worldName);

  let data: WorldInfoData | null = null;
  try {
    data = (await SillyTavern.loadWorldInfo(worldName)) as WorldInfoData | null;
  } catch {
    return false;
  }
  if (!data) return false;

  if (!data.extensions || typeof data.extensions !== 'object') {
    data.extensions = {};
  }
  const ext = data.extensions;
  if (hasRecordedImport(meta, ext)) {
    const existing = ext[WORLD_IMPORT_EXT_KEY];
    if (typeof existing === 'number' && existing > 0) {
      meta.firstImportAt = existing;
    }
    return true;
  }

  ext[WORLD_IMPORT_EXT_KEY] = timestamp;
  meta.firstImportAt = timestamp;
  try {
    await SillyTavern.saveWorldInfo(worldName, data, true);
    return true;
  } catch (e) {
    console.warn('[世界书管理器] 写入世界书导入时间失败', worldName, e);
    return false;
  }
}

/** 首次导入排序前：为尚无记录的书写入装插件基准时间 */
export async function prepareImportSortTimes(
  names: string[],
  ensureBookMeta: (name: string) => BookMeta,
  baseline: number,
): Promise<void> {
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const chunk = names.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(name => {
        const meta = ensureBookMeta(name);
        if (meta.firstImportAt && meta.firstImportAt > 0) return Promise.resolve(true);
        return ensureImportTimeOnBook(name, ensureBookMeta, baseline);
      }),
    );
  }
}

