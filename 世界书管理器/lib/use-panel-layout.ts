import { onMounted, onUnmounted, ref, type Ref } from 'vue';

/** 低于此宽度使用 Tab/点按 等紧凑布局（与模态框实际宽度一致，而非 iframe 视口） */
const LAYOUT_BREAKPOINT = 720;

/**
 * 根据管理器面板 (#wb-manager-modal-content) 宽度判断布局。
 * 脚本在 iframe 中运行时 window.matchMedia 会误判为手机，故不用视口媒体查询。
 */
/** 面板很窄时启用点按/长按交互（无勾选框）；宽面板仍用手机式布局 + 勾选框 */
export function usePanelMobileLayout(rootRef: Ref<HTMLElement | null>) {
  const isNarrow = ref(false);
  let ro: ResizeObserver | null = null;

  function applyWidth(width: number) {
    if (width > 0) isNarrow.value = width < LAYOUT_BREAKPOINT;
  }

  function observeTarget() {
    const root = rootRef.value;
    const target = root?.closest('#wb-manager-modal-content') ?? root;
    if (!target) return;
    ro?.disconnect();
    ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      applyWidth(w);
    });
    ro.observe(target);
    applyWidth(target.getBoundingClientRect().width);
  }

  onMounted(() => {
    observeTarget();
    requestAnimationFrame(observeTarget);
  });

  onUnmounted(() => {
    ro?.disconnect();
    ro = null;
  });

  return { isNarrow };
}
