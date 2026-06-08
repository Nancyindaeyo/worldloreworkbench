/** 提示词模板 (EJS) 检测、阶段模拟与渲染 — 依赖 ST-Prompt-Template 插件 */

import { extractEjsStages, formatStageMockHint, type EjsStage } from './ejs-stages';

const EJS_MARK = /<%[\s=_-]?|<%=/;

export function hasEjsMarkers(text: string): boolean {
  return EJS_MARK.test(text);
}

export function isEjsTemplateAvailable(): boolean {
  return typeof EjsTemplate?.getSyntaxErrorInfo === 'function';
}

function getEvalFn(): ((code: string, context?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<string>) | null {
  const et = EjsTemplate as unknown as {
    evalTemplate?: (code: string, context?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<string>;
    evaltemplate?: (code: string, context?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<string>;
  };
  const fn = et?.evalTemplate ?? et?.evaltemplate;
  return typeof fn === 'function' ? fn.bind(EjsTemplate) : null;
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function prepareMergedContext(mockOverrides?: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!isEjsTemplateAvailable()) return mockOverrides ?? {};
  const base = (await EjsTemplate.prepareContext()) as Record<string, unknown>;
  if (!mockOverrides || Object.keys(mockOverrides).length === 0) return base;
  return deepMerge(base, mockOverrides);
}

/** 语法检查（不执行） */
export async function checkEjsSyntax(content: string): Promise<{ ok: boolean; error: string }> {
  if (!content.trim()) return { ok: true, error: '' };
  if (!hasEjsMarkers(content)) return { ok: true, error: '' };
  if (!isEjsTemplateAvailable()) {
    return { ok: false, error: '未安装提示词模板插件' };
  }
  try {
    const error = (await EjsTemplate.getSyntaxErrorInfo(content))?.trim() ?? '';
    return { ok: !error, error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 渲染 EJS（可附加 mock 变量模拟某阶段） */
export async function renderEjsContent(
  content: string,
  mockOverrides?: Record<string, unknown>,
): Promise<{ ok: boolean; output: string; error: string }> {
  if (!content.trim()) return { ok: true, output: '', error: '' };
  if (!hasEjsMarkers(content)) return { ok: true, output: content, error: '' };
  if (!isEjsTemplateAvailable()) {
    return { ok: false, output: '', error: '未安装提示词模板插件' };
  }
  const evalFn = getEvalFn();
  if (!evalFn) return { ok: false, output: '', error: '缺少 evalTemplate' };
  try {
    const ctx = await prepareMergedContext(mockOverrides);
    const output = await evalFn(content, ctx);
    return { ok: true, output: output ?? '', error: '' };
  } catch (e) {
    return { ok: false, output: '', error: e instanceof Error ? e.message : String(e) };
  }
}

export async function renderEjsForCurrentStage(content: string) {
  return renderEjsContent(content);
}

export async function renderEjsForStage(content: string, stage: EjsStage) {
  return renderEjsContent(content, stage.mockContext);
}

/** 语法 + 运行检查（当前上下文） */
export async function validateEjsEntry(content: string): Promise<{ ok: boolean; error: string }> {
  const syntax = await checkEjsSyntax(content);
  if (!syntax.ok) return syntax;
  if (!hasEjsMarkers(content)) return { ok: true, error: '' };
  const run = await renderEjsForCurrentStage(content);
  if (!run.ok) return { ok: false, error: run.error };
  return { ok: true, error: '' };
}

export { extractEjsStages, formatStageMockHint, type EjsStage };
