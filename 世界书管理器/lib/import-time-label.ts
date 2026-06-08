/** 世界书卡片右下角导入时间文案 */
export function formatBookImportStamp(
  firstImportAt?: number,
  pluginBaselineAt?: number,
): { text: string; title: string } {
  if (typeof firstImportAt === 'number' && firstImportAt > 0) {
    const d = new Date(firstImportAt);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const isBaseline =
      typeof pluginBaselineAt === 'number' && pluginBaselineAt > 0 && firstImportAt === pluginBaselineAt;
    return {
      text: `导入 ${y}-${m}-${day}`,
      title: isBaseline
        ? `装插件前已有的书：统一记为启用管理器当日 ${y}-${m}-${day}（非真实导入时刻）`
        : `记录时间：${y}-${m}-${day} ${h}:${min}（新书为创建/复制时刻）`,
    };
  }
  return { text: '', title: '' };
}
