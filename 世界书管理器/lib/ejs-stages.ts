/** 从 EJS if/else if/else 链提取可模拟阶段，并为每阶段生成 mock 变量 */

export type EjsStage = {
  id: string;
  index: number;
  label: string;
  condition: string;
  /** 传给 EjsTemplate.prepareContext 的附加变量 */
  mockContext: Record<string, unknown>;
};

const BRANCH_HEAD =
  /<%_?\s*(if\s*\([\s\S]*?\)|else\s+if\s*\([\s\S]*?\)|else)\s*\{\s*_?%>/g;

function setByPath(root: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return root;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
  return root;
}

function mergeDeep(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = mergeDeep(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** 解析 getvar('a.b.c') > 30 一类条件，生成满足该分支的 mock 值 */
function mockPatchForCondition(cond: string, branch: 'if' | 'elseif' | 'else'): Record<string, unknown> {
  const getvarMatch = cond.match(
    /getvar\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(===|==|!==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?|'[^']*'|"[^"]*")/,
  );
  if (!getvarMatch) return {};

  const [, path, op, rawVal] = getvarMatch;
  const numVal = /^-?\d+(?:\.\d+)?$/.test(rawVal) ? Number(rawVal) : rawVal.replace(/^['"]|['"]$/g, '');

  let mock: unknown;
  if (typeof numVal === 'number') {
    switch (op) {
      case '<':
        mock = branch === 'else' ? numVal : numVal - 1;
        break;
      case '<=':
        mock = numVal;
        break;
      case '>':
        mock = branch === 'else' ? numVal : numVal + 1;
        break;
      case '>=':
        mock = numVal;
        break;
      case '===':
      case '==':
        mock = numVal;
        break;
      case '!==':
      case '!=':
        mock = typeof numVal === 'number' ? numVal + 1 : `not_${numVal}`;
        break;
      default:
        mock = numVal;
    }
  } else {
    mock = branch === 'else' ? `not_${numVal}` : numVal;
  }

  return setByPath({}, path!, mock);
}

/** 从正文提取 if / else if / else 分支（启发式，覆盖常见分阶段写法） */
export function extractEjsStages(content: string): EjsStage[] {
  if (!content.trim()) return [];

  const heads: { kind: 'if' | 'elseif' | 'else'; cond: string }[] = [];
  let m: RegExpExecArray | null;
  BRANCH_HEAD.lastIndex = 0;
  while ((m = BRANCH_HEAD.exec(content)) !== null) {
    const raw = m[1]!.trim();
    if (raw.startsWith('else if')) {
      heads.push({ kind: 'elseif', cond: raw.replace(/^else\s+if\s*/, '') });
    } else if (raw === 'else') {
      heads.push({ kind: 'else', cond: 'true' });
    } else {
      heads.push({ kind: 'if', cond: raw.replace(/^if\s*/, '') });
    }
  }

  if (heads.length === 0) {
    return [
      {
        id: 'stage-0',
        index: 0,
        label: '阶段 1',
        condition: '（无分支，全文）',
        mockContext: {},
      },
    ];
  }

  let accumulated: Record<string, unknown> = {};
  return heads.map((h, i) => {
    const patch = h.kind === 'else' ? {} : mockPatchForCondition(h.cond, h.kind);
    accumulated = mergeDeep(accumulated, patch);
    const condText = h.kind === 'else' ? 'else' : h.cond.replace(/^\(|\)$/g, '').trim();
    return {
      id: `stage-${i}`,
      index: i,
      label: `阶段 ${i + 1}`,
      condition: condText.slice(0, 120) + (condText.length > 120 ? '…' : ''),
      mockContext: { ...accumulated },
    };
  });
}

export function formatStageMockHint(stage: EjsStage): string {
  if (Object.keys(stage.mockContext).length === 0) return '（else / 无 mock 变量）';
  try {
    return JSON.stringify(stage.mockContext);
  } catch {
    return '…';
  }
}
