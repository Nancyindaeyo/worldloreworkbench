import _ from 'lodash';
import { hasEjsMarkers, isEjsTemplateAvailable } from './entry-ejs';
import { hasCurrentCharacter, hasOpenChat } from './tavern-safe';

export type EjsVarTreeNode = {
  id: string;
  label: string;
  path: string;
  depth: number;
  children: EjsVarTreeNode[];
  value?: string;
  valueKind: 'none' | 'scalar' | 'object' | 'missing';
  isBranch: boolean;
};

const GETVAR_PATH = /getvar\s*\(\s*['"]([^'"]+)['"]/g;

/** 从 EJS 正文提取 getvar('路径') 引用的变量路径 */
export function extractGetvarPaths(content: string): string[] {
  const paths = new Set<string>();
  GETVAR_PATH.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GETVAR_PATH.exec(content)) !== null) {
    if (m[1]) paths.add(m[1]);
  }
  return [...paths];
}

/** 从已启用 EJS 条目中汇总所有 getvar 路径 */
export function collectGetvarPathsFromEntries(entries: WorldbookEntry[]): string[] {
  const paths = new Set<string>();
  for (const e of entries) {
    if (!e.enabled) continue;
    const content = e.content ?? '';
    if (!hasEjsMarkers(content)) continue;
    extractGetvarPaths(content).forEach(p => paths.add(p));
  }
  return [...paths].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function formatEjsVarValue(value: unknown): string {
  if (value === undefined) return '（未定义）';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    const t = value.replace(/\s+/g, ' ').trim();
    return t.length > 200 ? `${t.slice(0, 200)}…` : t || '（空字符串）';
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return String(value);
  }
}

function mergeVariableLayers(): Record<string, unknown> {
  let merged: Record<string, unknown> = {};
  const layers: (() => Record<string, unknown>)[] = [
    () => getVariables({ type: 'global' }),
    () => getVariables({ type: 'chat' }),
    () => getVariables({ type: 'message', message_id: 'latest' }),
  ];
  if (hasCurrentCharacter()) {
    layers.push(() => getVariables({ type: 'character' }));
  }
  for (const load of layers) {
    try {
      merged = _.merge({}, merged, load());
    } catch {
      /* 某层不可用时跳过 */
    }
  }
  return merged;
}

/** 与 EJS getvar 一致地解析路径（优先 allVariables / getvar 求值） */
export async function resolveGetvarValue(
  path: string,
  context: Record<string, unknown>,
): Promise<unknown> {
  let v = _.get(context, path);
  if (v !== undefined) return v;

  if (isEjsTemplateAvailable()) {
    try {
      if (typeof EjsTemplate.allVariables === 'function') {
        v = _.get(EjsTemplate.allVariables(), path);
        if (v !== undefined) return v;
      }
    } catch {
      /* ignore */
    }

    try {
      const ctx = await EjsTemplate.prepareContext();
      v = _.get(ctx, path);
      if (v !== undefined) return v;

      const gv = (ctx as Record<string, unknown>).getvar;
      if (typeof gv === 'function') {
        const out = (gv as (p: string, opts?: { defaults?: unknown }) => unknown)(path, { defaults: undefined });
        if (out !== undefined) return out;
      }
    } catch {
      /* ignore */
    }

    const evalFn = EjsTemplate.evaltemplate ?? (EjsTemplate as { evalTemplate?: typeof EjsTemplate.evaltemplate }).evalTemplate;
    if (typeof evalFn === 'function') {
      try {
        const esc = path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const raw = await evalFn.call(
          EjsTemplate,
          `<% try { %><%= JSON.stringify(getvar('${esc}', { defaults: null })) %><% } catch (e) { %>null<% } %>`,
        );
        if (raw != null && raw.trim() !== '' && raw.trim() !== 'null') {
          return JSON.parse(raw.trim());
        }
      } catch {
        /* ignore */
      }
    }
  }

  v = _.get(mergeVariableLayers(), path);
  return v;
}

export async function loadChatEjsContext(): Promise<{
  ok: boolean;
  hasChat: boolean;
  error: string;
  context: Record<string, unknown>;
}> {
  if (!hasOpenChat()) {
    return { ok: false, hasChat: false, error: '请先进入角色卡聊天后再查看当前变量', context: {} };
  }

  let context: Record<string, unknown> = mergeVariableLayers();

  if (isEjsTemplateAvailable()) {
    try {
      if (typeof EjsTemplate.allVariables === 'function') {
        context = _.merge({}, context, EjsTemplate.allVariables());
      }
    } catch (e) {
      console.warn('[世界书管理器] allVariables 失败', e);
    }
    try {
      const ctx = (await EjsTemplate.prepareContext()) as Record<string, unknown>;
      context = _.merge({}, context, ctx);
    } catch (e) {
      console.warn('[世界书管理器] prepareContext 失败', e);
    }
  }

  if (Object.keys(context).length === 0) {
    return {
      ok: false,
      hasChat: true,
      error: '无法读取聊天变量（请确认已安装提示词模板插件）',
      context: {},
    };
  }

  return { ok: true, hasChat: true, error: '', context };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function upsertTreeNode(
  roots: EjsVarTreeNode[],
  parts: string[],
  leafValue: { value?: string; valueKind: EjsVarTreeNode['valueKind'] },
): void {
  let level = roots;
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    acc = acc ? `${acc}.${part}` : part;
    const isLeaf = i === parts.length - 1;
    let node = level.find(n => n.label === part);
    if (!node) {
      node = {
        id: acc,
        label: part,
        path: acc,
        depth: i,
        children: [],
        value: isLeaf ? leafValue.value : undefined,
        valueKind: isLeaf ? leafValue.valueKind : 'none',
        isBranch: !isLeaf,
      };
      level.push(node);
    } else if (isLeaf) {
      node.value = leafValue.value;
      node.valueKind = leafValue.valueKind;
    }
    if (!isLeaf) node.isBranch = true;
    level = node.children;
  }
}

function enrichBranchFromContext(node: EjsVarTreeNode, raw: unknown): void {
  if (!isPlainObject(raw)) return;
  const existing = new Set(node.children.map(c => c.label));
  for (const [key, val] of Object.entries(raw)) {
    if (key.startsWith('$') || key.startsWith('_')) continue;
    if (existing.has(key)) continue;
    const childPath = `${node.path}.${key}`;
    const scalar = !isPlainObject(val) && !Array.isArray(val);
    node.children.push({
      id: childPath,
      label: key,
      path: childPath,
      depth: node.depth + 1,
      children: [],
      value: scalar ? formatEjsVarValue(val) : undefined,
      valueKind: scalar ? (val === undefined ? 'missing' : 'scalar') : 'object',
      isBranch: !scalar,
    });
  }
  node.children.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
}

/** 将 getvar 路径构建为树，并填充对象子节点 */
export async function buildEjsVarTree(
  entries: WorldbookEntry[],
  context: Record<string, unknown>,
): Promise<EjsVarTreeNode[]> {
  const paths = collectGetvarPathsFromEntries(entries);
  const roots: EjsVarTreeNode[] = [];

  for (const path of paths) {
    const parts = path.split('.').filter(Boolean);
    if (parts.length === 0) continue;
    const raw = await resolveGetvarValue(path, context);
    upsertTreeNode(roots, parts, {
      value: formatEjsVarValue(raw),
      valueKind: raw === undefined ? 'missing' : 'scalar',
    });
  }

  async function walk(nodes: EjsVarTreeNode[]) {
    for (const node of nodes) {
      const raw = await resolveGetvarValue(node.path, context);
      if (isPlainObject(raw)) {
        node.isBranch = true;
        node.valueKind = 'object';
        node.value = `{${Object.keys(raw).length} 项}`;
        enrichBranchFromContext(node, raw);
        await walk(node.children);
      } else if (node.children.length > 0) {
        await walk(node.children);
      } else if (node.valueKind === 'none' || node.valueKind === 'missing') {
        const v = raw;
        node.value = formatEjsVarValue(v);
        node.valueKind = v === undefined ? 'missing' : 'scalar';
      }
    }
  }

  await walk(roots);
  roots.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  return roots;
}

export function flattenVarTree(
  nodes: EjsVarTreeNode[],
  expanded: Set<string>,
  out: EjsVarTreeNode[] = [],
): EjsVarTreeNode[] {
  for (const node of nodes) {
    out.push(node);
    if (node.isBranch && expanded.has(node.id)) {
      flattenVarTree(node.children, expanded, out);
    }
  }
  return out;
}

export function defaultExpandedVarNodes(_roots: EjsVarTreeNode[]): Set<string> {
  return new Set();
}
