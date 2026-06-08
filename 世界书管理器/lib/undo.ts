import { ref } from 'vue';

let activeUndo: (() => Promise<void>) | null = null;

/** 面板内撤销按钮是否应显示 */
export const undoAvailable = ref(false);

export function clearActiveUndo() {
  activeUndo = null;
  undoAvailable.value = false;
}

export function hasActiveUndo(): boolean {
  return activeUndo !== null;
}

/** 从管理器面板触发撤销 */
export async function triggerUndo() {
  await runUndo();
}

/** 提供可撤销操作：仅通过面板「撤销」按钮执行，不弹出 toastr */
export function offerUndo(_message: string, undo: () => Promise<void>) {
  clearActiveUndo();
  activeUndo = undo;
  undoAvailable.value = true;
}

async function runUndo() {
  const fn = activeUndo;
  clearActiveUndo();
  if (!fn) return;
  try {
    await fn();
  } catch (e) {
    console.error('[世界书管理器] 撤销失败', e);
    toastr.error(`撤销失败：${String(e)}`);
  }
}
