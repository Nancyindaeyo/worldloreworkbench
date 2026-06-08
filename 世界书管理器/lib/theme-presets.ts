import type { CustomThemeColors, ThemePreset } from '../schema';

export const BUILTIN_DARK_PRESETS: CustomThemeColors[] = [
  { primary: '#0066cc', bg: '#1a1a1a', text: '#eeeeee', border: '#444444' },
  { primary: '#10b981', bg: '#111827', text: '#f3f4f6', border: '#374151' },
  { primary: '#8b5cf6', bg: '#1e1b4b', text: '#e9d5ff', border: '#312e81' },
  { primary: '#ec4899', bg: '#1c1917', text: '#fbcfe8', border: '#44403c' },
  { primary: '#f59e0b', bg: '#1c1917', text: '#fef3c7', border: '#44403c' },
];

export const BUILTIN_LIGHT_PRESETS: CustomThemeColors[] = [
  { primary: '#0066cc', bg: '#f5f5f5', text: '#333333', border: '#cccccc' },
  { primary: '#059669', bg: '#f0fdf4', text: '#065f46', border: '#bbf7d0' },
  { primary: '#7c3aed', bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe' },
  { primary: '#db2777', bg: '#fff1f2', text: '#9d174d', border: '#fecdd3' },
  { primary: '#d97706', bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
];

export type PresetListItem = CustomThemeColors & {
  id: string;
  mode: 'dark' | 'light';
  builtin?: boolean;
};

export function listPresetsForMode(mode: 'dark' | 'light', saved: ThemePreset[]): PresetListItem[] {
  const builtins = (mode === 'light' ? BUILTIN_LIGHT_PRESETS : BUILTIN_DARK_PRESETS).map((p, i) => ({
    ...p,
    id: `builtin-${mode}-${i}`,
    mode,
    builtin: true,
  }));
  const user = saved.filter(p => p.mode === mode);
  return [...builtins, ...user];
}

export function presetSwatchStyle(p: CustomThemeColors): Record<string, string> {
  return {
    '--wm-preset-bg': p.bg ?? '#1a1a1a',
    '--wm-preset-border': p.border ?? '#444444',
    '--wm-preset-primary': p.primary ?? '#0066cc',
  };
}
