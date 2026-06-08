import { safeGlobalWorldbookNames } from './tavern-safe';

/** 将指定世界书加入或移出酒馆全局世界书列表 */
export async function setWorldbooksGlobalEnabled(names: string[], enable: boolean): Promise<string[]> {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return safeGlobalWorldbookNames();
  const next = new Set(safeGlobalWorldbookNames());
  unique.forEach(n => {
    if (enable) next.add(n);
    else next.delete(n);
  });
  await rebindGlobalWorldbooks([...next]);
  return [...next];
}
