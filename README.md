# 世界书工作台 (World Lore Workbench)

在 SillyTavern 中集中管理全部世界书：虚拟文件夹、标签、筛选排序、条目编辑与批量操作。

## 安装

### 前提

请先安装 [酒馆助手 (JS-Slash-Runner)](https://github.com/n0vi028/JS-Slash-Runner)，版本 **4.8.19+**。

### 扩展管理器安装（推荐）

1. SillyTavern → **扩展** → **Install Extension**
2. 粘贴：`https://github.com/Nancyindaeyo/worldloreworkbench`
3. 刷新页面 → 启用 **世界书工作台**

扩展由 **bootstrap 直载** `index.js`，**不会**在酒馆助手脚本树中注册条目（直载失败时会临时回退为脚本注册）。

若你以前用过「世界书管理器」脚本，首次启用扩展时会自动把 `wb_manager` 设置迁移到扩展变量。

## 使用

- 酒馆右上角 **魔法棒** → **世界书工作台**（书本图标）

## 本仓库文件说明

| 文件 | 说明 |
| --- | --- |
| `manifest.json` | SillyTavern 扩展清单 |
| `bootstrap.js` | 扩展入口、生命周期 hooks |
| `index.js` | 打包后的功能 bundle |
| `changelog.json` | 更新说明（面板/远程可读） |
| `README.md` | 本文件 |

源码与维护文档在 monorepo 的 `src/世界书工作台-ext/`、`docs/worldlore-workbench/`，**不会**被 ST 执行。

## 卸载

在扩展列表删除「世界书工作台」→ 自动移除脚本树回退条目并清理 DOM。扩展变量中的设置不会自动删除。

## 更新

可在扩展列表手动更新。发版前维护者需在 monorepo 执行 `pnpm build:worldlore-workbench` 并提交本目录的 `index.js`。

## 维护

开发者文档见 monorepo **`docs/worldlore-workbench/`**。
