/** 世界书重命名 / 批量迁移期间暂停 CHARACTER_EDITED 弹窗，避免与自动迁移冲突 */

const pendingWorldbookRenames = new Map<string, string>();
let charWorldbookSyncPauseDepth = 0;

export function pauseCharWorldbookSync(): void {
  charWorldbookSyncPauseDepth += 1;
}

export function resumeCharWorldbookSync(): void {
  charWorldbookSyncPauseDepth = Math.max(0, charWorldbookSyncPauseDepth - 1);
}

export function isCharWorldbookSyncPaused(): boolean {
  return charWorldbookSyncPauseDepth > 0;
}

export function registerWorldbookRename(oldName: string, newName: string): void {
  pendingWorldbookRenames.set(oldName, newName);
}

export function unregisterWorldbookRename(oldName: string): void {
  pendingWorldbookRenames.delete(oldName);
}

export function isExpectedWorldbookRename(oldName: string | null, newName: string | null): boolean {
  if (!oldName || !newName) return false;
  return pendingWorldbookRenames.get(oldName) === newName;
}
