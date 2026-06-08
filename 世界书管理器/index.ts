import panelHtml from './panel.html?raw';
import cssContent from './style.scss?raw';
import { applyThemeToModal, getStoredTheme } from './lib/theme';
import {
  $tavern,
  blurWithin,
  getTavernDocument,
  getTavernJQuery,
  restampWbModalAutocomplete,
  suppressStaleTavernAutocomplete,
} from './lib/tavern-autocomplete';
import { WB_MANAGER_VERSION } from './lib/changelog';
import { createPinia } from 'pinia';
import App from './App.vue';
import { vTap } from './lib/v-tap';

const EXT_MENU_BUTTON_ID = 'wb-manager-ext-menu-btn';
const MODAL_ID = 'wb-manager-modal';
const STYLE_ID = 'wb-manager-style';

let app: ReturnType<typeof createApp> | null = null;
let menuObserver: MutationObserver | null = null;
let menuBodyObserver: MutationObserver | null = null;
let lastOpenAt = 0;

function hideExtensionsMenu() {
  $tavern('#extensionsMenu, #extensions_menu').hide();
}

function ensureModalDom() {
  const doc = getTavernDocument();
  if ($tavern(`#${STYLE_ID}`).length === 0) {
    $tavern('head').append(`<style id="${STYLE_ID}">${cssContent}</style>`);
  } else {
    $tavern(`#${STYLE_ID}`).html(cssContent);
  }

  if ($tavern(`#${MODAL_ID}`).length === 0) {
    $tavern(panelHtml).appendTo(doc.body);
    $tavern('#wb-manager-modal-overlay')
      .off('click.wbManager')
      .on('click.wbManager', () => closePanel());
    $tavern('#wb-manager-modal-content')
      .off('click.wbManager touchend.wbManager')
      .on('click.wbManager touchend.wbManager', e => e.stopPropagation());
  }
}

function getVueMountEl(): HTMLElement | null {
  const $el = $tavern('#wb-manager-vue-root');
  if ($el.length > 0) return $el[0];
  return getTavernDocument().getElementById('wb-manager-vue-root');
}

function mountVue(): boolean {
  const el = getVueMountEl();
  if (!el) {
    console.error('[世界书管理器] 未找到挂载点 #wb-manager-vue-root（请确认 panel 已注入酒馆页面）');
    return false;
  }
  app?.unmount();
  app = null;
  app = createApp(App, { onClose: closePanel });
  app.directive('tap', vTap);
  app.use(createPinia());
  app.mount(el);
  return true;
}

export function closePanel() {
  blurWithin(getTavernDocument().getElementById('wb-manager-modal'));
  suppressStaleTavernAutocomplete();
  $tavern(`#${MODAL_ID}`).removeClass('is-open');
  window.dispatchEvent(new CustomEvent('wb-manager-panel-close'));
  app?.unmount();
  app = null;
}

export function openPanel() {
  const now = Date.now();
  if (now - lastOpenAt < 350 && $tavern(`#${MODAL_ID}`).hasClass('is-open')) return;
  lastOpenAt = now;

  ensureModalDom();

  const $modal = $tavern(`#${MODAL_ID}`);
  if ($modal.length === 0) {
    console.error('[世界书管理器] 模态框未创建');
    return;
  }

  if (!mountVue()) {
    toastr.error('世界书工作台界面加载失败，请刷新酒馆后重试');
    return;
  }

  applyThemeToModal(getStoredTheme() === 'light');
  $modal.addClass('is-open');
  requestAnimationFrame(() => restampWbModalAutocomplete());
}

function handleOpenPanelEvent(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  hideExtensionsMenu();
  openPanel();
}

function bindOpenTrigger(el: HTMLElement | null, force = false) {
  if (!el) return;
  const key = '__wbManagerOpenBound';
  const tagged = el as HTMLElement & { [key]?: boolean };
  if (tagged[key] && !force) return;
  tagged[key] = true;

  const handler = (e: Event) => handleOpenPanelEvent(e);
  el.onclick = handler;
  el.addEventListener('touchend', handler, { capture: true, passive: false });
  el.addEventListener('click', handler, { capture: true });
}

function getExtensionsMenu(): JQuery {
  const $menu = $tavern('#extensionsMenu');
  return $menu.length ? $menu : $tavern('#extensions_menu');
}

function ensureExtensionsMenuListItem() {
  const $menu = getExtensionsMenu();
  if (!$menu.length) return;

  let $btn = $tavern(`#${EXT_MENU_BUTTON_ID}`);
  if ($btn.length === 0) {
    $btn = $tavern(
      `<div id="${EXT_MENU_BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" title="世界书工作台" tabindex="0" role="listitem">` +
        `<div class="fa-fw fa-solid fa-book-open"></div>` +
        `<span>世界书工作台</span>` +
        `</div>`,
    );
    $menu.append($btn);
  }
  bindOpenTrigger($btn.get(0) ?? null, true);
}

function attachExtensionsMenuObserver() {
  const doc = getTavernDocument();
  const menu = doc.querySelector('#extensionsMenu, #extensions_menu');
  if (!menu) return false;
  ensureExtensionsMenuListItem();
  if (!menuObserver) {
    menuObserver = new MutationObserver(() => ensureExtensionsMenuListItem());
    menuObserver.observe(menu, { childList: true });
  }
  if (menuBodyObserver) {
    menuBodyObserver.disconnect();
    menuBodyObserver = null;
  }
  return true;
}

function watchExtensionsMenu() {
  if (attachExtensionsMenuObserver()) return;
  const doc = getTavernDocument();
  if (menuBodyObserver) return;
  menuBodyObserver = new MutationObserver(() => {
    if (attachExtensionsMenuObserver()) {
      menuBodyObserver?.disconnect();
      menuBodyObserver = null;
    }
  });
  menuBodyObserver.observe(doc.body, { childList: true, subtree: true });
}

function setupExtensionsMenuDelegation() {
  const selector = `#${EXT_MENU_BUTTON_ID}`;
  getTavernJQuery()(getTavernDocument())
    .off('click.wbManagerExt touchend.wbManagerExt', selector)
    .on('click.wbManagerExt touchend.wbManagerExt', selector, e => {
      const raw = (e as JQuery.TriggeredEvent).originalEvent;
      if (raw) handleOpenPanelEvent(raw);
      else handleOpenPanelEvent(e as unknown as Event);
    });
}

function cleanupUI() {
  blurWithin(getTavernDocument().getElementById('wb-manager-modal'));
  suppressStaleTavernAutocomplete();
  $tavern(`#${EXT_MENU_BUTTON_ID}`).remove();
  $tavern(`#${MODAL_ID}`).remove();
  $tavern(`#${STYLE_ID}`).remove();
  getTavernJQuery()(getTavernDocument()).off('click.wbManagerExt touchend.wbManagerExt', `#${EXT_MENU_BUTTON_ID}`);
  menuObserver?.disconnect();
  menuObserver = null;
  menuBodyObserver?.disconnect();
  menuBodyObserver = null;
  app?.unmount();
  app = null;
}

function initUI() {
  $tavern(`#${EXT_MENU_BUTTON_ID}`).remove();
  ensureModalDom();
  watchExtensionsMenu();
  setupExtensionsMenuDelegation();
}

$(() => {
  errorCatched(() => {
    initUI();
    console.info(`[世界书管理器] 已加载 v${WB_MANAGER_VERSION}（魔法棒入口）`);
  })();
});

$(window).on('pagehide', () => {
  cleanupUI();
});
