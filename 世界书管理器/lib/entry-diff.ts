import {
  POSITION_OPTIONS,
  SECONDARY_LOGIC_OPTIONS,
  type EntryEditDraft,
} from './entry-edit';

export type DiffSpan = { text: string; highlight: boolean };

export type DiffSection = {
  key: string;
  label: string;
  left: DiffSpan[];
  right: DiffSpan[];
  isContent: boolean;
  kind: 'text' | 'checkbox';
  boolBefore?: boolean;
  boolAfter?: boolean;
};

export type EntryDiffResult = {
  hasChanges: boolean;
  sections: DiffSection[];
};

const STRATEGY_LABELS: Record<EntryEditDraft['strategyType'], string> = {
  constant: '🔵 常量',
  selective: '🟢 可选',
  vectorized: '🔗 向量',
};

function positionLabel(type: EntryEditDraft['positionType']): string {
  return POSITION_OPTIONS.find(o => o.value === type)?.label ?? type;
}

function secondaryLogicLabel(logic: EntryEditDraft['keysSecondaryLogic']): string {
  return SECONDARY_LOGIC_OPTIONS.find(o => o.value === logic)?.label ?? logic;
}

function scanDepthLabel(v: string): string {
  return v === 'same_as_global' || !v ? '同全局' : `${v} 楼`;
}

function boolLabel(v: boolean): string {
  return v ? '是' : '否';
}

type FieldSpec = {
  key: keyof EntryEditDraft;
  label: string;
  kind: 'text' | 'checkbox';
  format: (d: EntryEditDraft) => string;
  boolValue?: (d: EntryEditDraft) => boolean;
};

const FIELD_SPECS: FieldSpec[] = [
  { key: 'name', label: '标题', kind: 'text', format: d => d.name || '（空）' },
  {
    key: 'enabled',
    label: '启用',
    kind: 'checkbox',
    format: d => boolLabel(d.enabled),
    boolValue: d => d.enabled,
  },
  {
    key: 'strategyType',
    label: '策略',
    kind: 'text',
    format: d => STRATEGY_LABELS[d.strategyType] ?? d.strategyType,
  },
  { key: 'probability', label: '触发%', kind: 'text', format: d => String(d.probability) },
  { key: 'keysText', label: '主关键字', kind: 'text', format: d => d.keysText || '（无）' },
  { key: 'keysSecondaryText', label: '副关键字', kind: 'text', format: d => d.keysSecondaryText || '（无）' },
  {
    key: 'keysSecondaryLogic',
    label: '副关键字逻辑',
    kind: 'text',
    format: d => secondaryLogicLabel(d.keysSecondaryLogic),
  },
  { key: 'scanDepth', label: '扫描深度', kind: 'text', format: d => scanDepthLabel(d.scanDepth) },
  { key: 'positionType', label: '插入位置', kind: 'text', format: d => positionLabel(d.positionType) },
  { key: 'positionRole', label: '身份', kind: 'text', format: d => d.positionRole },
  { key: 'positionDepth', label: '深度', kind: 'text', format: d => String(d.positionDepth) },
  { key: 'positionOrder', label: '顺序', kind: 'text', format: d => String(d.positionOrder) },
  {
    key: 'preventIncoming',
    label: '不可递归',
    kind: 'checkbox',
    format: d => boolLabel(d.preventIncoming),
    boolValue: d => d.preventIncoming,
  },
  {
    key: 'preventOutgoing',
    label: '防止进一步递归',
    kind: 'checkbox',
    format: d => boolLabel(d.preventOutgoing),
    boolValue: d => d.preventOutgoing,
  },
  { key: 'content', label: '正文', kind: 'text', format: d => d.content ?? '' },
];

export function draftsEqual(a: EntryEditDraft, b: EntryEditDraft): boolean {
  return (Object.keys(a) as (keyof EntryEditDraft)[]).every(k => a[k] === b[k]);
}

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? (text ? [text] : []);
}

type TokenOp = { type: 'same' | 'add' | 'remove'; token: string };

function diffTokens(before: string, after: string): TokenOp[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: TokenOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', token: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'remove', token: a[i] });
      i++;
    } else {
      out.push({ type: 'add', token: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: 'remove', token: a[i++] });
  while (j < m) out.push({ type: 'add', token: b[j++] });
  return out;
}

export function inlineContentDiff(before: string, after: string): { left: DiffSpan[]; right: DiffSpan[] } {
  if (before === after) {
    return { left: [{ text: before, highlight: false }], right: [{ text: after, highlight: false }] };
  }
  const ops = diffTokens(before ?? '', after ?? '');
  const left: DiffSpan[] = [];
  const right: DiffSpan[] = [];
  for (const op of ops) {
    if (op.type === 'same') {
      left.push({ text: op.token, highlight: false });
      right.push({ text: op.token, highlight: false });
    } else if (op.type === 'remove') {
      left.push({ text: op.token, highlight: true });
    } else {
      right.push({ text: op.token, highlight: true });
    }
  }
  return { left, right };
}

export function escapeDiffHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function spansToHtml(spans: DiffSpan[]): string {
  return spans
    .map(s =>
      s.highlight
        ? `<mark class="wm-diff-mark">${escapeDiffHtml(s.text)}</mark>`
        : escapeDiffHtml(s.text),
    )
    .join('');
}

function displayText(raw: string, emptyLabel: string): string {
  return raw.trim() ? raw : emptyLabel;
}

export function diffEntryDrafts(before: EntryEditDraft, after: EntryEditDraft): EntryDiffResult {
  const sections: DiffSection[] = [];
  for (const spec of FIELD_SPECS) {
    const rawBefore = spec.format(before);
    const rawAfter = spec.format(after);
    if (rawBefore === rawAfter) continue;

    if (spec.kind === 'checkbox' && spec.boolValue) {
      sections.push({
        key: spec.key,
        label: spec.label,
        left: [],
        right: [],
        isContent: false,
        kind: 'checkbox',
        boolBefore: spec.boolValue(before),
        boolAfter: spec.boolValue(after),
      });
      continue;
    }

    const emptyLabel = spec.key === 'content' ? '（空）' : '（无）';
    const { left, right } = inlineContentDiff(
      displayText(rawBefore, emptyLabel),
      displayText(rawAfter, emptyLabel),
    );
    sections.push({
      key: spec.key,
      label: spec.label,
      left,
      right,
      isContent: spec.key === 'content',
      kind: 'text',
    });
  }
  return { hasChanges: sections.length > 0, sections };
}
