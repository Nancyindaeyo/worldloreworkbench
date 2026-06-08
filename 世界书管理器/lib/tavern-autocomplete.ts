/** 避免工作台 DOM 变更后，酒馆 Macro AutoComplete 仍引用已卸载节点而刷屏报错 */

export function getTavernDocument(): Document {
  return window.parent?.document && window.parent.document !== document ? window.parent.document : document;
}

export function getTavernWindow(): Window {
  return getTavernDocument().defaultView ?? window;
}

export function getTavernJQuery(): JQueryStatic {
  const doc = getTavernDocument();
  const win = doc.defaultView as (Window & { jQuery?: JQueryStatic }) | null;
  return win?.jQuery ?? $;
}

export function $tavern(selector: string): JQuery {
  const $jq = getTavernJQuery();
  if (selector.startsWith('<')) return $jq(selector);
  return $jq(selector, getTavernDocument());
}

type AutoCompleteHandle = { close?: () => void; destroy?: () => void; unbind?: () => void };

function getInputAutoComplete(el: HTMLInputElement | HTMLTextAreaElement): AutoCompleteHandle | undefined {
  const rec = el as unknown as Record<string, AutoCompleteHandle | undefined>;
  return rec.autoComplete ?? rec._autoComplete;
}

/** 仅写 HTML 属性禁用 Macro 补全 (不 destroy 实例, 适合 focusin 时调用) */
export function stampInputMacroAutocompleteHidden(el: HTMLInputElement | HTMLTextAreaElement): void {
  if (el.hasAttribute('data-macros')) {
    el.removeAttribute('data-macros');
  }
  if (el.getAttribute('data-macros-autocomplete') !== 'hide') {
    el.setAttribute('data-macros-autocomplete', 'hide');
  }
  if (el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'number') {
    if (el.getAttribute('autocomplete') !== 'off') {
      el.setAttribute('autocomplete', 'off');
    }
  }
}

/** 断开单个输入框上的 Macro AutoComplete 实例 (不 blur, 不影响其它输入框) */
export function detachInputMacroAutocomplete(el: HTMLInputElement | HTMLTextAreaElement): void {
  stampInputMacroAutocompleteHidden(el);
  try {
    const ac = getInputAutoComplete(el);
    ac?.close?.();
    ac?.destroy?.();
    ac?.unbind?.();
    const rec = el as unknown as Record<string, unknown>;
    delete rec.autoComplete;
    delete rec._autoComplete;
  } catch {
    /* ignore */
  }
}

export function detachMacroAutocompleteIn(root: ParentNode | null): void {
  if (!root) return;
  root.querySelectorAll('input, textarea').forEach(node => {
    detachInputMacroAutocomplete(node as HTMLInputElement | HTMLTextAreaElement);
  });
}

/** 移除已脱离 DOM 的 AutoComplete 浮层, 避免 updateFloatingPosition 对 null 调 getBoundingClientRect */
export function removeOrphanMacroAutocompleteDom(doc: Document = getTavernDocument()): void {
  try {
    const active = doc.activeElement;
    doc
      .querySelectorAll('[id^="autoComplete_list_"], .macro_autocomplete, .autocomplete-items')
      .forEach(node => {
        if (active && (node === active || node.contains(active))) return;
        node.remove();
      });
    // 仅移除已无 input/textarea 的空壳 wrapper, 切勿删除仍包裹输入框的 wrapper
    doc.querySelectorAll('.autoComplete_wrapper').forEach(wrapper => {
      if (wrapper.querySelector('input, textarea')) return;
      wrapper.remove();
    });
  } catch {
    /* ignore */
  }
}

export function suppressStaleTavernAutocomplete(): void {
  try {
    (getTavernDocument().activeElement as HTMLElement | null)?.blur?.();
  } catch {
    /* ignore */
  }
}

export function blurWithin(root: ParentNode | null): void {
  if (!root) return;
  const active = getTavernDocument().activeElement;
  if (active && root.contains(active)) {
    (active as HTMLElement).blur();
  }
}

/** 仅写属性禁用补全，不 detach（面板编辑期间安全） */
export function stampInputAutocompleteHiddenIn(root: ParentNode | null): void {
  if (!root) return;
  root.querySelectorAll('input, textarea').forEach(node => {
    const el = node as HTMLInputElement | HTMLTextAreaElement;
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'number') return;
    stampInputMacroAutocompleteHidden(el);
  });
}

/** 工作台输入框默认关闭 Macro 自动补全（管理 UI 不需要；且易与虚拟列表/Sheet 冲突） */
export function stampWbInputAutocompletePolicy(root: ParentNode | null): void {
  if (!root) return;
  const active = getTavernDocument().activeElement;
  root.querySelectorAll('input, textarea').forEach(node => {
    const el = node as HTMLInputElement | HTMLTextAreaElement;
    // 正在编辑的输入框只做属性标记, destroy 可能拆 wrapper 导致丢焦点/无法输入
    if (active === el) {
      stampInputMacroAutocompleteHidden(el);
      return;
    }
    detachInputMacroAutocomplete(el);
  });
}

export function restampWbModalAutocomplete(): void {
  stampWbInputAutocompletePolicy(getTavernDocument().getElementById('wb-manager-modal'));
  removeOrphanMacroAutocompleteDom();
}
