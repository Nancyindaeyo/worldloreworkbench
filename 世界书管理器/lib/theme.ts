export const WB_MANAGER_THEME_KEY = 'wb-manager-theme';

import { $tavern, getTavernDocument } from './tavern-autocomplete';

export type WbManagerTheme = 'light' | 'dark';

export function getStoredTheme(): WbManagerTheme {
  return localStorage.getItem(WB_MANAGER_THEME_KEY) === 'light' ? 'light' : 'dark';
}

export function setStoredTheme(theme: WbManagerTheme) {
  localStorage.setItem(WB_MANAGER_THEME_KEY, theme);
}

/** 将日间/夜间类名同步到模态框 DOM（与酒馆主题无关） */
export function applyThemeToModal(light: boolean) {
  const $content = $tavern('#wb-manager-modal-content');
  const $modal = $tavern('#wb-manager-modal');
  if ($content.length) {
    $content.toggleClass('wm-light-mode', light);
  } else {
    getTavernDocument().getElementById('wb-manager-modal-content')?.classList.toggle('wm-light-mode', light);
  }
  if ($modal.length) {
    $modal.toggleClass('wm-light-mode', light);
  } else {
    getTavernDocument().getElementById('wb-manager-modal')?.classList.toggle('wm-light-mode', light);
  }
}
