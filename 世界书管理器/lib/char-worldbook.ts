export type CharWorldbooks = {
  primary: string | null;
  additional: string[];
};

export type CharWorldbookResolveVia = 'api' | 'legacy' | 'charData' | 'character' | 'empty';

export type ResolveCharWorldbooksOptions = {
  /** 深度检查：API / 本地数据仍无绑定时再读 getCharacter */
  deepScan?: boolean;
};

export async function resolveMaybeAsync<T>(value: T | Promise<T>): Promise<T> {
  if (value && typeof (value as Promise<T>).then === 'function') {
    return await (value as Promise<T>);
  }
  return value as T;
}

export function normalizeCharWorldbooks(raw: unknown): CharWorldbooks {
  if (!raw || typeof raw !== 'object') {
    return { primary: null, additional: [] };
  }
  const wb = raw as { primary?: unknown; additional?: unknown };
  const primary = typeof wb.primary === 'string' && wb.primary.trim() ? wb.primary.trim() : null;
  const additional = Array.isArray(wb.additional)
    ? wb.additional
        .filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
        .map(n => n.trim())
    : [];
  const uniqueAdditional = [...new Set(additional)].filter(n => n !== primary);
  return { primary, additional: uniqueAdditional };
}

function hasCharWorldbooks(wb: CharWorldbooks): boolean {
  return Boolean(wb.primary) || wb.additional.length > 0;
}

const EMPTY_WB: CharWorldbooks = { primary: null, additional: [] };

function mergeWorldbooks(a: CharWorldbooks, b: CharWorldbooks): CharWorldbooks {
  const primary = a.primary ?? b.primary;
  const additional = [...new Set([...a.additional, ...b.additional])].filter(n => n !== primary);
  return { primary, additional };
}

/** 从酒馆 v1CharData / getCharacter 原始字段解析世界书绑定 */
export function parseCharWorldbooksFromCharData(card: SillyTavern.v1CharData | Character): CharWorldbooks {
  let primary: string | null = null;
  const additional: string[] = [];

  const asCharacter = card as Character;
  if (typeof asCharacter.worldbook === 'string' && asCharacter.worldbook.trim()) {
    primary = asCharacter.worldbook.trim();
  }

  const asV1 = card as SillyTavern.v1CharData;
  const data = asV1.data;
  if (data?.extensions && typeof data.extensions.world === 'string' && data.extensions.world.trim()) {
    primary = primary ?? data.extensions.world.trim();
  }

  if (!primary) {
    const cb = (card as any).character_book || (data as any)?.character_book;
    if (cb) {
      if (typeof cb === 'string' && cb.trim()) {
        primary = cb.trim();
      } else if (typeof cb === 'object' && typeof cb.name === 'string' && cb.name.trim()) {
        primary = cb.name.trim();
      }
    }
  }

  const ext = (asCharacter.extensions ?? data?.extensions) as Record<string, unknown> | undefined;
  if (ext) {
    for (const key of ['extra_worlds', 'additional_worlds', 'character_worlds']) {
      const val = ext[key];
      if (Array.isArray(val)) {
        val.forEach(n => {
          if (typeof n === 'string' && n.trim()) additional.push(n.trim());
        });
      }
    }
    if (!primary) {
      for (const key of ['world', 'worlds', 'worldbook']) {
        const val = ext[key];
        if (typeof val === 'string' && val.trim()) {
          primary = val.trim();
          break;
        }
      }
    }
  }

  const uniqueAdditional = [...new Set(additional)].filter(n => n !== primary);
  return { primary, additional: uniqueAdditional };
}

function collectNameCandidates(charName: string, card?: SillyTavern.v1CharData | null): string[] {
  const set = new Set<string>([charName.trim()]);
  if (!card) return [...set];
  if (typeof card.avatar === 'string' && card.avatar.trim()) {
    set.add(card.avatar.trim());
    set.add(card.avatar.replace(/\.png$/i, '').trim());
  }
  if (typeof card.data?.name === 'string' && card.data.name.trim()) {
    set.add(card.data.name.trim());
  }
  return [...set].filter(Boolean);
}

async function tryApiForNames(names: string[]): Promise<CharWorldbooks | null> {
  let merged = EMPTY_WB;
  let found = false;
  for (const name of names) {
    try {
      const raw = getCharWorldbookNames(name);
      const wb = normalizeCharWorldbooks(await resolveMaybeAsync(raw));
      if (hasCharWorldbooks(wb)) {
        merged = mergeWorldbooks(merged, wb);
        found = true;
      }
    } catch {
      /* 尝试下一个别名 */
    }
  }
  return found ? merged : null;
}

async function tryCharDataWorldbooks(charName: string): Promise<{ wb: CharWorldbooks; card: SillyTavern.v1CharData | null } | null> {
  if (typeof getCharData !== 'function') return null;
  try {
    const raw = (getCharData as any)(charName, true);
    const card = await resolveMaybeAsync(raw);
    if (!card) return null;
    const wb = parseCharWorldbooksFromCharData(card);
    return hasCharWorldbooks(wb) ? { wb, card } : { wb: EMPTY_WB, card };
  } catch {
    return null;
  }
}

async function tryLegacyCharLorebooks(charName: string): Promise<CharWorldbooks | null> {
  if (typeof getCharLorebooks !== 'function') return null;
  try {
    const raw = getCharLorebooks({ name: charName, type: 'all' });
    const wb = normalizeCharWorldbooks(await resolveMaybeAsync(raw));
    return hasCharWorldbooks(wb) ? wb : null;
  } catch {
    return null;
  }
}

async function resolveCurrentCharWorldbooks(): Promise<{ wb: CharWorldbooks; via: CharWorldbookResolveVia }> {
  const fromApi = await tryApiForNames(['current']);
  if (fromApi) return { wb: fromApi, via: 'api' };
  const fromData = await tryCharDataWorldbooks('current');
  if (fromData && hasCharWorldbooks(fromData.wb)) {
    return { wb: fromData.wb, via: 'charData' };
  }
  return { wb: EMPTY_WB, via: 'empty' };
}

/** 读取单张角色卡的世界书绑定，兼容 Promise API 与多种回退路径 */
export async function resolveCharWorldbooks(
  charName: string,
  options: ResolveCharWorldbooksOptions = {},
): Promise<{ wb: CharWorldbooks; via: CharWorldbookResolveVia }> {
  const name = charName.trim();
  if (!name || name === 'current') {
    return resolveCurrentCharWorldbooks();
  }

  const charDataResult = await tryCharDataWorldbooks(name);
  const nameCandidates = collectNameCandidates(name, charDataResult?.card ?? null);

  const fromApi = await tryApiForNames(nameCandidates);
  if (fromApi) {
    return { wb: fromApi, via: 'api' };
  }

  if (charDataResult && hasCharWorldbooks(charDataResult.wb)) {
    return { wb: charDataResult.wb, via: 'charData' };
  }

  if (!options.deepScan) {
    return { wb: EMPTY_WB, via: 'empty' };
  }

  const legacy = await tryLegacyCharLorebooks(name);
  if (legacy) {
    return { wb: legacy, via: 'legacy' };
  }

  for (const candidate of nameCandidates) {
    if (candidate === name) continue;
    const legacyAlt = await tryLegacyCharLorebooks(candidate);
    if (legacyAlt) {
      return { wb: legacyAlt, via: 'legacy' };
    }
  }

  try {
    const char = await resolveMaybeAsync(getCharacter(name));
    const wb = parseCharWorldbooksFromCharData(char);
    if (hasCharWorldbooks(wb)) {
      return { wb, via: 'character' };
    }
  } catch {
    /* 角色不存在或无法读取时静默跳过 */
  }

  return { wb: EMPTY_WB, via: 'empty' };
}

export function isValidCharacterNameForBinding(name: string): boolean {
  const n = name.trim();
  return Boolean(n) && n !== 'current';
}

export async function yieldToUi(): Promise<void> {
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });
}
