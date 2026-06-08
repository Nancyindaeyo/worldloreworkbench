import { z } from 'zod';

export const DEFAULT_FOLDER = '所有世界书';

export const TagDefSchema = z.object({
  color: z.string().default('#6366f1'),
});

export const BookMetaSchema = z.object({
  folder: z.string().default(DEFAULT_FOLDER),
  tags: z.array(z.string()).default([]),
  /** 置顶：在列表中固定排在非置顶项之前 */
  pinned: z.boolean().optional(),
  /** 管理器内最近操作时间（打开、编辑条目等），用于「按修改」排序 */
  lastTouchedAt: z.number().optional(),
  /** 导入酒馆时间：来自世界书 JSON extensions.wm_first_import_at 或文件 Last-Modified */
  firstImportAt: z.number().optional(),
});

const bookSortModeValues = [
  'import-asc',
  'import-desc',
  'modified-asc',
  'modified-desc',
  'name-asc',
  'name-desc',
  'binding-bound-first',
  'binding-unbound-first',
  'tags-group',
] as const;

export const FilterStateSchema = z.object({
  search: z.string().default(''),
  charBound: z.enum(['all', 'bound', 'unbound']).default('all'),
  globalOnly: z.boolean().default(false),
  currentCharOnly: z.boolean().default(false),
  selectedTags: z.array(z.string()).default([]),
  folder: z.string().nullable().default(null),
});

export const FolderMetaSchema = z.object({
  pinned: z.boolean().optional(),
  /** 文件夹关联的标签；筛选时与 tagMode 一起决定哪些世界书出现在该文件夹 */
  tags: z.array(z.string()).default([]),
  tagMode: z.enum(['and', 'or']).default('or'),
});

export const CustomThemeColorsSchema = z.object({
  primary: z.string().optional(),
  bg: z.string().optional(),
  text: z.string().optional(),
  border: z.string().optional(),
  highlight: z.string().optional(),
  /** 世界书名、条目名称等标题文字 */
  title: z.string().optional(),
  /** 预览、元信息、绑定说明等次要文字 */
  muted: z.string().optional(),
  /** 列表卡片底色 */
  itemBg: z.string().optional(),
  /** 删除、危险操作 */
  danger: z.string().optional(),
  /** 全局世界书：左边条与「全局」标签底色（默认淡黄） */
  globalAccent: z.string().optional(),
  /** 全局世界书：「全局」标签文字 */
  globalAccentText: z.string().optional(),
});

export const ThemePresetSchema = z.object({
  id: z.string(),
  mode: z.enum(['dark', 'light']),
  primary: z.string(),
  bg: z.string(),
  text: z.string(),
  border: z.string(),
  highlight: z.string().optional(),
  title: z.string().optional(),
  muted: z.string().optional(),
  itemBg: z.string().optional(),
  danger: z.string().optional(),
  globalAccent: z.string().optional(),
  globalAccentText: z.string().optional(),
});

export const CustomThemeSchema = z.object({
  dark: CustomThemeColorsSchema.default({}),
  light: CustomThemeColorsSchema.default({}),
}).default({ dark: {}, light: {} });

export const ManagerSettingsSchema = z
  .object({
    folders: z.array(z.string()).default([DEFAULT_FOLDER]),
    folderMeta: z.record(z.string(), FolderMetaSchema).default({}),
    tagDefs: z.record(z.string(), TagDefSchema).default({}),
    books: z.record(z.string(), BookMetaSchema).default({}),
    bookOrder: z.array(z.string()).default([]),
    filter: FilterStateSchema.prefault({}),
    customTheme: CustomThemeSchema,
    /** 用户保存的主题配色预设 */
    themePresets: z.array(ThemePresetSchema).default([]),
    /** 上次使用的快速排序方式（管理器内） */
    lastBookSortMode: z.enum(bookSortModeValues).optional(),
    /** 上次排序范围 */
    lastBookSortScope: z.enum(['visible', 'all']).optional(),
    /** 装插件后统一基准时间（首次为既有世界书批量标记导入日） */
    pluginBaselineAt: z.number().optional(),
    /** 是否已为装插件前已有的世界书写入 pluginBaselineAt 作为 firstImportAt */
    legacyBooksImportStamped: z.boolean().optional(),
  })
  .prefault({});

export type TagDef = z.infer<typeof TagDefSchema>;
export type BookMeta = z.infer<typeof BookMetaSchema>;
export type FilterState = z.infer<typeof FilterStateSchema>;
export type FolderMeta = z.infer<typeof FolderMetaSchema>;
export type CustomThemeColors = z.infer<typeof CustomThemeColorsSchema>;
export type ThemePreset = z.infer<typeof ThemePresetSchema>;
export type ManagerSettings = z.infer<typeof ManagerSettingsSchema>;

export function parseSettings(raw: unknown): ManagerSettings {
  const parsed = ManagerSettingsSchema.safeParse(raw ?? {});
  const s = parsed.success ? parsed.data : ManagerSettingsSchema.parse({});
  
  s.folders = (s.folders ?? []).map(f => f === '未分类' ? DEFAULT_FOLDER : f);
  if (!s.folders.includes(DEFAULT_FOLDER)) {
    s.folders = [DEFAULT_FOLDER, ...s.folders.filter(f => f !== DEFAULT_FOLDER)];
  }
  s.folders = [...new Set(s.folders)];

  if (s.books) {
    Object.keys(s.books).forEach(k => {
      const b = s.books[k];
      if (b && b.folder === '未分类') {
        b.folder = DEFAULT_FOLDER;
      }
    });
  }
  if (s.filter && s.filter.folder === '未分类') {
    s.filter.folder = DEFAULT_FOLDER;
  }

  s.filter = FilterStateSchema.parse(s.filter ?? {});

  if (s.lastBookSortMode === 'import-asc') s.lastBookSortMode = 'import-desc';
  else if (s.lastBookSortMode === 'modified-asc') s.lastBookSortMode = 'modified-desc';
  else if (s.lastBookSortMode === 'binding-bound-first' || s.lastBookSortMode === 'binding-unbound-first') {
    s.lastBookSortMode = 'name-asc';
  }

  return s;
}
