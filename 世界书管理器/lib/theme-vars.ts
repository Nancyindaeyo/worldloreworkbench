import type { CustomThemeColors } from '../schema';

export type ThemeColorField = {
  key: keyof CustomThemeColors;
  label: string;
  hint: string;
  placeholder?: { light: string; dark: string };
  /** color input 不支持 rgba 时用于取色器近似色 */
  pickerFallback?: string;
};

export const THEME_BASIC_FIELDS: ThemeColorField[] = [
  { key: 'primary', label: '主色调', hint: '按钮、选中边框、链接强调' },
  {
    key: 'bg',
    label: '背景底色',
    hint: '面板与输入框背景',
    placeholder: { light: '#f5f5f5', dark: '#1a1a1a' },
  },
  {
    key: 'text',
    label: '正文颜色',
    hint: '普通说明文字',
    placeholder: { light: '#333333', dark: '#eeeeee' },
  },
  {
    key: 'border',
    label: '边框颜色',
    hint: '卡片、分割线',
    placeholder: { light: '#cccccc', dark: '#444444' },
  },
  {
    key: 'highlight',
    label: '搜索高亮',
    hint: '搜索命中时的 mark 背景',
    placeholder: { light: 'rgba(251, 191, 36, 0.45)', dark: 'rgba(251, 191, 36, 0.45)' },
    pickerFallback: '#fbbf24',
  },
];

export const THEME_ADVANCED_FIELDS: ThemeColorField[] = [
  {
    key: 'title',
    label: '标题 / 条目名',
    hint: '世界书名、条目名称',
    placeholder: { light: '#333333', dark: '#eeeeee' },
  },
  {
    key: 'muted',
    label: '次要文字',
    hint: '条目预览、元信息、绑定说明',
    placeholder: { light: 'rgba(0,0,0,0.5)', dark: 'rgba(255,255,255,0.55)' },
    pickerFallback: '#888888',
  },
  {
    key: 'itemBg',
    label: '卡片底色',
    hint: '世界书 / 条目列表卡片',
    placeholder: { light: '#ffffff', dark: 'rgba(0,0,0,0.5)' },
  },
  {
    key: 'danger',
    label: '危险色',
    hint: '删除按钮、警告提示',
    placeholder: { light: '#e55353', dark: '#ff6b6b' },
  },
  {
    key: 'globalAccent',
    label: '全局世界书强调',
    hint: '「全局」标签与卡片左边条',
    placeholder: { light: '#fde68a', dark: '#eab308' },
    pickerFallback: '#fde68a',
  },
  {
    key: 'globalAccentText',
    label: '全局标签文字',
    hint: '「全局」芯片上的文字颜色',
    placeholder: { light: '#422006', dark: '#fef9c3' },
    pickerFallback: '#422006',
  },
];

export function defaultThemeColors(isLight: boolean): Required<CustomThemeColors> {
  return {
    primary: '#0066cc',
    bg: isLight ? '#f5f5f5' : '#1a1a1a',
    text: isLight ? '#333333' : '#eeeeee',
    border: isLight ? '#cccccc' : '#444444',
    highlight: 'rgba(251, 191, 36, 0.45)',
    title: isLight ? '#333333' : '#eeeeee',
    muted: isLight ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.55)',
    itemBg: isLight ? '#ffffff' : 'rgba(0, 0, 0, 0.5)',
    danger: isLight ? '#e55353' : '#ff6b6b',
    globalAccent: isLight ? '#fde68a' : '#eab308',
    globalAccentText: isLight ? '#422006' : '#fef9c3',
  };
}

export function mergeThemeColors(isLight: boolean, partial?: CustomThemeColors): CustomThemeColors {
  const d = defaultThemeColors(isLight);
  return { ...d, ...partial };
}

/** 将 customTheme 某一模式写入 --wm-* CSS 变量 */
export function buildCustomThemeCssVars(t: CustomThemeColors, isLight: boolean): Record<string, string> {
  const styles: Record<string, string> = {};

  if (t.primary) {
    styles['--wm-primary'] = t.primary;
    styles['--wm-primary-soft'] = `${t.primary}1f`;
  }
  if (t.bg) {
    styles['--wm-bg'] = t.bg;
    styles['--wm-input-bg'] = t.bg;
    styles['--wm-dock-bg'] = t.bg;
    styles['--wm-tab-bg'] = isLight ? '#e0e0e0' : 'rgba(0,0,0,0.5)';
  }
  if (t.text) {
    styles['--wm-text'] = t.text;
    styles['--wm-input-text'] = t.text;
    styles['--wm-hover'] = `${t.text}1a`;
    if (!t.muted) {
      styles['--wm-muted'] = `${t.text}8c`;
    }
  }
  if (t.border) {
    styles['--wm-border'] = t.border;
  }
  if (t.highlight) {
    styles['--wm-highlight'] = t.highlight;
  }
  if (t.title) {
    styles['--wm-title'] = t.title;
  }
  if (t.muted) {
    styles['--wm-muted'] = t.muted;
  }
  if (t.itemBg) {
    styles['--wm-item-bg'] = t.itemBg;
  }
  if (t.danger) {
    styles['--wm-danger'] = t.danger;
  }
  if (t.globalAccent) {
    styles['--wm-global-accent'] = t.globalAccent;
  }
  if (t.globalAccentText) {
    styles['--wm-global-accent-text'] = t.globalAccentText;
  }

  return styles;
}

export function colorPickerValue(value: string | undefined, fallback: string): string {
  const v = value ?? fallback;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  return fallback;
}
