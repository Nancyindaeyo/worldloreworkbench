import type { Directive, DirectiveBinding } from 'vue';

type TapHandler = (e: Event) => void;

type TapState = {
  cleanup: () => void;
};

function bindTap(el: HTMLElement, handler: TapHandler): () => void {
  let touchHandledAt = 0;

  const onTouchEnd = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    touchHandledAt = Date.now();
    handler(e);
  };

  const onClick = (e: MouseEvent) => {
    if (Date.now() - touchHandledAt < 500) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    handler(e);
  };

  el.addEventListener('touchend', onTouchEnd, { passive: false });
  el.addEventListener('click', onClick);

  return () => {
    el.removeEventListener('touchend', onTouchEnd);
    el.removeEventListener('click', onClick);
  };
}

function resolveHandler(binding: DirectiveBinding<TapHandler>): TapHandler | null {
  return typeof binding.value === 'function' ? binding.value : null;
}

/**
 * 移动端可靠点按：在 touchend 主动触发，并避免随后合成的 click 重复执行。
 * 用于酒馆父页面 WebView 中 div/button 点按偶发失效的场景。
 */
export const vTap: Directive<HTMLElement, TapHandler> = {
  mounted(el, binding) {
    const handler = resolveHandler(binding);
    if (!handler) return;
    const cleanup = bindTap(el, handler);
    (el as HTMLElement & { __wmTapState?: TapState }).__wmTapState = { cleanup };
  },
  updated(el, binding) {
    const state = (el as HTMLElement & { __wmTapState?: TapState }).__wmTapState;
    state?.cleanup();
    const handler = resolveHandler(binding);
    if (!handler) {
      delete (el as HTMLElement & { __wmTapState?: TapState }).__wmTapState;
      return;
    }
    const cleanup = bindTap(el, handler);
    (el as HTMLElement & { __wmTapState?: TapState }).__wmTapState = { cleanup };
  },
  unmounted(el) {
    const state = (el as HTMLElement & { __wmTapState?: TapState }).__wmTapState;
    state?.cleanup();
    delete (el as HTMLElement & { __wmTapState?: TapState }).__wmTapState;
  },
};
