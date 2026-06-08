<template>
  <div ref="wmRootRef" class="wm-root" :class="rootClasses" :style="customStyleVars">
    <header class="wm-header">
      <div class="wm-header-leading">
        <h2 class="wm-title">
          <i class="fa-solid fa-book-open"></i>
          世界书工作台
        </h2>
        <div class="wm-header-count-row">
          <span class="wm-count">
            显示 {{ store.filteredBooks.length }} / 共 {{ totalBookCount }} 本
            <span v-if="store.refreshing" class="wm-header-sync wm-book-meta"> · 同步中…</span>
          </span>
          <div class="wm-header-actions wm-header-actions--compact">
            <button
              v-if="undoAvailable"
              type="button"
              class="menu_button interactable wm-btn wm-btn-icon wm-btn-undo"
              title="撤销上一步可撤销操作"
              v-tap="() => void triggerUndo()"
            >
              <i class="fa-solid fa-rotate-left"></i>
            </button>
            <button
              type="button"
              class="menu_button interactable wm-btn wm-btn-icon"
              title="更新日志"
              v-tap="() => (showChangelogSheet = true)"
            >
              <i class="fa-solid fa-clock-rotate-left"></i>
            </button>
            <button
              type="button"
              class="menu_button interactable wm-btn wm-btn-icon"
              title="主题配色（日/夜间与自定义颜色）"
              v-tap="() => (showThemeCustomSheet = true)"
            >
              <i class="fa-solid fa-palette"></i>
            </button>
            <button type="button" class="menu_button interactable wm-btn wm-btn-icon" title="关闭" v-tap="handleClose">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      </div>
    </header>

    <div v-show="mobilePane === 'books'" class="wm-mobile-folders">
      <div class="wm-mobile-folders-scroll">
        <div
          v-for="folder in store.sortedFolders"
          :key="'mf-' + folder"
          class="wm-folder-item wm-folder-item--compact"
          :class="{ active: store.settings.filter.folder === folder }"
          @click="onMobileFolderClick(folder)"
        >
          {{ folder }}
          <span
            v-if="folder !== store.DEFAULT_FOLDER && store.getFolderMeta(folder).tags.length"
            class="wm-folder-mode-sm"
            >{{ store.getFolderMeta(folder).tagMode === 'and' ? '·且' : '·或' }}</span
          >
        </div>
        <button
          type="button"
          class="menu_button interactable wm-btn wm-btn-folder-add"
          title="新建分类文件夹"
          v-tap="openNewFolderForm"
        >
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
    </div>

    <div class="wm-body">
      <div class="wm-main-col">
        <div v-if="mobilePane === 'books'" class="wm-mobile-search-row">
          <div class="wm-search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input v-model="searchInput" type="text" class="text_pole" placeholder="搜索世界书…" />
          </div>
          <div class="menu_button interactable wm-btn wm-btn-filter" title="排序" @click="showBookSortSheet = true">
            <i class="fa-solid fa-arrow-down-wide-short"></i>
          </div>
          <div
            class="menu_button interactable wm-btn wm-btn-filter"
            title="分类标签配色：修改各分类文件夹的标签颜色"
            @click="openTagManage()"
          >
            <i class="fa-solid fa-tags"></i>
          </div>
        </div>

        <div v-if="mobilePane === 'books'" class="wm-filter-tabs-row">
          <div
            v-for="mode in ['all', 'bound', 'unbound']"
            :key="mode"
            class="wm-filter-tab-btn"
            :class="{ active: store.settings.filter.charBound === mode }"
            @click="store.settings.filter.charBound = mode"
          >
            {{ mode === 'all' ? '全部' : mode === 'bound' ? '已绑定' : '未绑定' }}
          </div>
          <div
            class="wm-filter-tab-btn wm-filter-tab-btn--toggle"
            :class="{ active: store.settings.filter.globalOnly }"
            @click="store.settings.filter.globalOnly = !store.settings.filter.globalOnly"
            title="仅显示全局开启的世界书"
          >
            仅全局
          </div>
          <div
            v-if="store.hasChat"
            class="wm-filter-tab-btn wm-filter-tab-btn--toggle"
            :class="{ active: store.settings.filter.currentCharOnly }"
            @click="store.settings.filter.currentCharOnly = !store.settings.filter.currentCharOnly"
            title="仅显示绑定在当前角色卡/聊天的世界书"
          >
            仅当前
          </div>
          <div
            class="wm-filter-refresh-btn"
            :class="{ spinning: store.bindingChecking, 'wm-filter-refresh-btn--warn': bindingScanWarningsList.length > 0 }"
            :title="bindingRefreshButtonTitle"
            @click="void runBindingRefresh()"
          >
            <i class="fa-solid fa-arrows-rotate"></i>
          </div>
        </div>

        <div v-if="mobilePane === 'books' && store.bindingChecking" class="wm-filter-progress-row">
          <div class="wm-filter-progress-bar">
            <div class="wm-filter-progress-fill" :style="{ width: `${bindingProgressPercent}%` }"></div>
          </div>
          <span class="wm-filter-progress-text"
            >{{ store.bindingProgress.label || '同步中…' }} {{ bindingProgressPercent }}%</span
          >
        </div>
        <p
          v-if="mobilePane === 'books' && !store.bindingChecking && bindingScanWarningsList.length"
          class="wm-binding-hint wm-binding-hint--warn"
        >
          <i class="fa-solid fa-triangle-exclamation"></i>
          {{ bindingScanWarningsList[0] }}
          <button type="button" class="wm-binding-hint-action" @click="void runBindingRefresh()">重新扫描</button>
        </p>
        <p v-else-if="mobilePane === 'books' && !store.bindingChecking && bindingLastRefreshText" class="wm-binding-hint">
          {{ bindingLastRefreshText }}
        </p>
        <p v-if="mobilePane === 'books'" class="wm-mobile-books-hint">
          <template v-if="isNarrow">点按勾选 · 双击或 → 进入条目 · 点多本即多选</template>
          <template v-else>点按勾选 · 双击或 → 进入条目 · 勾选框/左侧把手可拖拽排序</template>
        </p>

        <div v-show="mobilePane === 'books'" class="wm-books-pane">
          <BookVirtualList
            v-if="!showTagManageSheet && !showBatchTagSheet"
            :key="bookListVirtualKey"
            :books="store.filteredBooks"
            :selected-book="store.selectedBook"
            :selected-books="store.selectedBooks"
            :tag-colors="store.settings.tagDefs"
            :touch-select="isNarrow"
            :show-checkboxes="!isNarrow"
            :search-query="store.settings.filter.search ?? ''"
            @select="selectBookForView"
            @toggle-select="store.toggleBookSelection"
            @toggle-pin="store.toggleBookPin"
            @drop="onBookDrop"
            @drag-start="name => (store.dragBookName = name)"
            @ensure-stats="onVisibleBooksStats"
          />
        </div>

        <div v-show="mobilePane === 'entries'" class="wm-entries-pane">
          <div class="wm-entries-toolbar wm-entries-toolbar--sub">
            <div class="wm-entries-title-wrap">
              <span class="wm-entries-title">{{ store.selectedBook || '请选择世界书' }}</span>
              <button
                v-if="store.selectedBook"
                type="button"
                class="menu_button interactable wm-btn wm-btn-icon wm-entries-rename"
                title="重命名世界书"
                @click="openRenameBookSheet(store.selectedBook!)"
              >
                <i class="fa-solid fa-pen"></i>
              </button>
              <button
                v-if="store.selectedBook"
                type="button"
                class="menu_button interactable wm-btn wm-btn-icon wm-entries-rename"
                title="刷新本书绑定（已绑定则跳过）"
                :class="{ disabled: store.bindingChecking }"
                @click="void refreshCurrentBookBinding()"
              >
                <i class="fa-solid fa-link"></i>
              </button>
              <span
                v-if="store.selectedBook && store.currentBookTokenStats"
                class="wm-entries-inline-stat"
                :title="`${TOKEN_COUNT_HINT}\n全书正文: ${formatTokenCount(store.currentBookTokenStats.total)} tk\n启用条目: ${formatTokenCount(store.currentBookTokenStats.enabled)} tk`"
              >
                · {{ formatTokenCount(store.currentBookTokenStats.total) }} tk / 启用
                {{ formatTokenCount(store.currentBookTokenStats.enabled) }}
              </span>
            </div>
            <div
              class="menu_button interactable wm-btn wm-btn-icon wm-entries-back"
              title="返回世界书列表"
              @click="mobilePane = 'books'"
            >
              <i class="fa-solid fa-arrow-left"></i>
            </div>
          </div>
          <div v-if="!store.selectedBook" class="wm-empty wm-empty--fill">请选择世界书查看条目</div>
          <template v-else>
            <div class="wm-entries-search-row">
              <div class="wm-search-box">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input
                  v-model="entrySearchInput"
                  type="text"
                  class="text_pole"
                  placeholder="在当前书内搜索名称/关键字/内容..."
                />
              </div>
            </div>
            <div class="wm-entries-toolbar wm-entries-toolbar--wrap">
              <div
                class="menu_button interactable wm-btn"
                title="按插入位置与 order 模拟已启用条目的大致排列（不算关键字/概率触发）"
                @click="openInjectionOrderSheet"
              >
                <i class="fa-solid fa-list-ol"></i> 注入顺序
              </div>
              <div class="menu_button interactable wm-btn" @click="store.selectAllEntries()">全选</div>
              <div class="menu_button interactable wm-btn" @click="store.invertEntrySelection()">反选</div>
              <div
                class="menu_button interactable wm-btn"
                :class="{ disabled: store.selectedEntryCount === 0 }"
                @click="store.clearEntrySelection()"
              >
                取消勾选
              </div>
              <div
                class="menu_button interactable wm-btn wm-btn-primary"
                :class="{ disabled: store.selectedEntryCount < 2 }"
                @click="store.selectedEntryCount >= 2 && openBatchEdit()"
              >
                批量修改 ({{ store.selectedEntryCount }})
              </div>
              <div
                class="menu_button interactable wm-btn wm-btn-danger"
                :class="{ disabled: store.selectedEntryCount === 0 }"
                @click="store.selectedEntryCount && openDeleteEntriesSheet()"
              >
                删除 ({{ store.selectedEntryCount }})
              </div>
              <select v-model="transferTarget" class="text_pole wm-filter-select wm-transfer-target-select">
                <option value="">选择目标世界书…</option>
                <option v-for="n in otherBookNames" :key="n" :value="n">{{ n }}</option>
              </select>
              <div
                class="menu_button interactable wm-btn"
                :class="{ disabled: !canTransferEntries }"
                title="复制到目标世界书（本书保留，条目可重复）"
                @click="canTransferEntries && doTransfer('copy')"
              >
                复制到…
              </div>
              <div
                class="menu_button interactable wm-btn"
                :class="{ disabled: !canTransferEntries }"
                title="移动到目标世界书（从本书移除）"
                @click="canTransferEntries && doTransfer('move')"
              >
                移动到…
              </div>
              <div v-if="store.selectedEntryCount > 0" class="wm-insert-below-wrap">
                <div
                  class="menu_button interactable wm-btn wm-btn-primary"
                  @click="showInsertBelowMenu = !showInsertBelowMenu"
                >
                  <i class="fa-solid fa-arrow-down"></i>
                  插入到…下方 ({{ store.selectedEntryCount }})
                </div>
                <select
                  v-if="showInsertBelowMenu"
                  class="text_pole wm-filter-select wm-insert-below-select"
                  @change="onInsertBelowChange"
                >
                  <option value="">选择目标条目</option>
                  <option v-for="(e, i) in store.entries" :key="'ins-' + e.uid + '-' + i" :value="e.uid">
                    {{ entryInsertLabel(e, i) }}
                  </option>
                </select>
              </div>
            </div>
            <div v-if="store.entryLoading" class="wm-empty">加载条目…</div>
            <EntryVirtualList
              v-else
              :entries="store.filteredEntries"
              :touch-select="isNarrow"
              :is-selected="store.isEntrySelected"
              :entry-row-class="entryRowClass"
              :search-query="entrySearchInput"
              :entry-tokens="store.entryTokenByUid"
              :has-entry-diff="store.hasEntrySaveSnapshot"
              @toggle-uid="store.toggleEntryUid"
              @edit="toggleEdit"
              @show-diff="openEntryDiff"
              @entry-drag-start="onEntryDragStart"
              @entry-drag-end="onEntryDragEnd"
              @entry-drag-over="onEntryDragOver"
              @entry-drag-leave="onEntryDragLeave"
              @entry-drop="onEntryDrop"
              @scroll-drag-over="onEntriesScrollDragOver"
              @scroll-drag-leave="stopEntryDragScroll"
              @scroll-drop="stopEntryDragScroll"
            />
          </template>
        </div>
      </div>
    </div>

    <div v-if="mobilePane === 'books' && store.selectedBooks.size > 0" class="wm-batch-dock">
      <span class="wm-batch-dock-label">已选 {{ store.selectedBooks.size }} 本世界书</span>
      <div class="menu_button interactable wm-btn" @click="store.clearBookSelection()">取消</div>
      <div class="menu_button interactable wm-btn wm-btn-primary" @click="showFabMenu = !showFabMenu">
        <i class="fa-solid fa-bolt"></i> 批量操作
      </div>
    </div>

    <div v-if="showFabMenu" class="wm-fab-backdrop" @click="showFabMenu = false"></div>
    <div v-if="showFabMenu" class="wm-fab-menu">
      <div class="wm-fab-menu-title">批量操作（已选 {{ store.selectedBooks.size }} 本）</div>

      <div class="wm-fab-group-label"><i class="fa-solid fa-square-check"></i> 选择与勾选</div>
      <div class="wm-fab-btn-row">
        <button type="button" @click="fabAction(() => store.selectUnboundChar())">勾选未绑定</button>
        <button type="button" @click="fabAction(() => store.selectAllVisible())">全选</button>
        <button type="button" @click="fabAction(() => store.invertBookSelection())">反选</button>
      </div>

      <div class="wm-fab-group-label"><i class="fa-solid fa-folder-open"></i> 分类与归档</div>
      <div class="wm-fab-folder-row">
        <select
          class="text_pole wm-filter-select wm-batch-folder-select-inside"
          @change="onBatchMoveFolderInside($event)"
        >
          <option value="">📁 批量移至分类文件夹...</option>
          <option value="__NEW_FOLDER__">➕ 新建分类文件夹并移动过去...</option>
          <option v-for="f in store.sortedFolders" :key="'dock-inside-' + f" :value="f">{{ f }}</option>
        </select>
      </div>

      <div class="wm-fab-group-label"><i class="fa-solid fa-link"></i> 角色卡绑定</div>
      <div class="wm-fab-btn-row">
        <button
          type="button"
          @click="
            fabAction(() => {
              showCharBindSheet = true;
            })
          "
        >
          🔗 绑定角色卡/当前聊天...
        </button>
        <button type="button" @click="fabAction(() => void store.refreshBindingsForSelectedBooks())">
          <i class="fa-solid fa-arrows-rotate"></i> 刷新绑定（仅未绑定）
        </button>
      </div>

      <div class="wm-fab-group-label"><i class="fa-solid fa-earth-asia"></i> 全局世界书</div>
      <div class="wm-fab-btn-row">
        <button type="button" @click="fabAction(() => void store.setSelectedBooksGlobalEnabled(true))">
          设为全局
        </button>
        <button type="button" @click="fabAction(() => void store.setSelectedBooksGlobalEnabled(false))">
          取消全局
        </button>
      </div>

      <div class="wm-fab-group-label"><i class="fa-solid fa-gears"></i> 书籍维护</div>
      <div class="wm-fab-btn-row">
        <button type="button" @click="fabAction(openCopyBookSheet)">
          <i class="fa-solid fa-clone"></i> 复制世界书
        </button>
        <button
          type="button"
          @click="
            fabAction(() => {
              showBookInsertSheet = true;
            })
          "
        >
          <i class="fa-solid fa-arrow-down-short-wide"></i> 插入到特定书下方...
        </button>
        <button type="button" class="wm-fab-menu-pin" @click="fabAction(() => store.togglePinSelectedBooks())">
          <i class="fa-solid fa-thumbtack"></i> {{ fabPinActionLabel }}
        </button>
      </div>

      <div class="wm-fab-group-label text-danger"><i class="fa-solid fa-circle-exclamation"></i> 危险操作</div>
      <div class="wm-fab-btn-row">
        <button type="button" class="wm-fab-menu-danger" @click="fabAction(openDeleteBooksSheet)">
          <i class="fa-solid fa-trash-can"></i> 删除选中的世界书
        </button>
      </div>
    </div>

    <div v-if="showDeleteBooksSheet" class="wm-mobile-sheet" @click.self="showDeleteBooksSheet = false">
      <div class="wm-mobile-sheet-body wm-delete-sheet" @click.stop>
        <div class="wm-sheet-head">
          <h3 class="wm-sheet-title">删除世界书</h3>
        </div>
        <p class="wm-delete-warn">确定删除以下 {{ deleteBooksPreview.length }} 本世界书？此操作不可撤销。</p>
        <div class="wm-delete-list">
          <div v-for="item in deleteBooksPreview" :key="item.name" class="wm-delete-item">
            <div class="wm-delete-book-name">{{ item.name }}</div>
            <div v-if="item.globalEnabled" class="wm-delete-hint">仍全局开启</div>
            <div v-if="item.charBound" class="wm-delete-bind-box">
              <div class="wm-delete-bind-label">绑定角色卡：</div>
              <div v-for="(line, i) in item.characterLines" :key="item.name + '-' + i" class="wm-delete-bind-line">
                {{ line }}
              </div>
            </div>
            <div v-else class="wm-delete-hint muted">未绑定角色卡</div>
          </div>
        </div>
        <div class="wm-toolbar-row">
          <div class="menu_button interactable wm-btn" style="flex: 1" @click="showDeleteBooksSheet = false">取消</div>
          <div class="menu_button interactable wm-btn wm-btn-danger" style="flex: 1" @click="confirmDeleteBooks">
            确认删除
          </div>
        </div>
      </div>
    </div>

    <div v-if="showNameInputSheet" class="wm-mobile-sheet" @click.self="showNameInputSheet = false">
      <div class="wm-mobile-sheet-body" @click.stop>
        <h3 class="wm-sheet-title">{{ nameInputMode === 'copy' ? '复制世界书' : '重命名世界书' }}</h3>
        <p v-if="nameInputMode === 'copy'" class="wm-sort-hint">复制「{{ nameInputSource }}」为：</p>
        <p v-else class="wm-sort-hint">将「{{ nameInputSource }}」重命名为：</p>
        <input
          v-model="nameInputValue"
          class="text_pole"
          :placeholder="nameInputMode === 'copy' ? '新世界书名称' : '新名称'"
          @keyup.enter="void confirmNameInput()"
        />
        <div class="wm-toolbar-row">
          <div class="menu_button interactable wm-btn" style="flex: 1" @click="showNameInputSheet = false">取消</div>
          <div class="menu_button interactable wm-btn wm-btn-primary" style="flex: 1" @click="void confirmNameInput()">
            确定
          </div>
        </div>
      </div>
    </div>

    <div v-if="showDeleteEntriesSheet" class="wm-mobile-sheet" @click.self="showDeleteEntriesSheet = false">
      <div class="wm-mobile-sheet-body wm-delete-sheet" @click.stop>
        <h3 class="wm-sheet-title">删除条目</h3>
        <p class="wm-delete-warn">
          确定删除 {{ store.selectedEntryCount }} 个条目？删除后可点击通知或面板「撤销」撤回（进行其他操作前有效）。
        </p>
        <div class="wm-toolbar-row">
          <div class="menu_button interactable wm-btn" style="flex: 1" @click="showDeleteEntriesSheet = false">
            取消
          </div>
          <div
            class="menu_button interactable wm-btn wm-btn-danger"
            style="flex: 1"
            @click="void confirmDeleteEntries()"
          >
            确认删除
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="editingUid !== null && store.selectedBook"
      class="wm-mobile-sheet wm-entry-edit-sheet"
      @click.self="closeEntryEdit"
    >
      <div class="wm-mobile-sheet-body wm-entry-edit-sheet-body" @click.stop>
        <div class="wm-sheet-head">
          <h3 class="wm-sheet-title">编辑条目 #{{ editingUid }}</h3>
        </div>
        <div class="wm-entry-edit-sheet-scroll">
          <EntryEditForm v-model:draft="editDraft" mobile hide-actions :autosave="persistEditDraft" />
        </div>
        <div class="wm-entry-edit-sheet-footer">
          <div class="menu_button interactable wm-btn" @click="closeEntryEdit">取消</div>
          <div class="menu_button interactable wm-btn wm-btn-primary" @click="saveEditFromSheet">保存</div>
        </div>
      </div>
    </div>

    <div v-if="showBookSortSheet" class="wm-mobile-sheet" @click.self="showBookSortSheet = false">
      <div class="wm-mobile-sheet-body wm-sort-sheet" @click.stop>
        <div class="wm-sheet-head">
          <h3 class="wm-sheet-title">排序</h3>
          <div class="menu_button interactable wm-btn" @click="showBookSortSheet = false">关闭</div>
        </div>
        <p class="wm-sort-hint">
          「新加入」按记录时间把最新世界书排到上方；装插件前旧书首次排序时会以启用工作台当日为基准。排序仅保存在工作台内，筛选栏的「已绑定 / 未绑定」可配合使用。
        </p>
        <div class="wm-sort-options">
          <button
            v-for="opt in BOOK_SORT_OPTIONS"
            :key="opt.value"
            type="button"
            class="menu_button interactable wm-btn wm-sort-opt"
            @click="applyBookSort(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showBookInsertSheet" class="wm-mobile-sheet" @click.self="showBookInsertSheet = false">
      <div class="wm-mobile-sheet-body" @click.stop>
        <div class="wm-sheet-head">
          <h3 class="wm-sheet-title">插入到…下方</h3>
          <div class="menu_button interactable wm-btn" @click="showBookInsertSheet = false">关闭</div>
        </div>
        <p class="wm-sort-hint">已选 {{ store.selectedBooks.size }} 本，点选锚点世界书：</p>
        <div class="wm-insert-book-list">
          <button
            v-for="book in store.filteredBooks"
            :key="'insb-' + book.name"
            type="button"
            class="menu_button interactable wm-btn wm-insert-book-btn"
            @click="onBookInsertPick(book.name)"
          >
            {{ book.name }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showTagManageSheet" class="wm-mobile-sheet" @click.self="showTagManageSheet = false">
      <div class="wm-mobile-sheet-body wm-tag-manage-sheet" @click.stop>
        <div class="wm-sheet-head">
          <h3 class="wm-sheet-title">分类标签配色管理</h3>
          <div class="menu_button interactable wm-btn" @click="showTagManageSheet = false">完成</div>
        </div>
        <p class="wm-sort-hint">在此处为各个分类文件夹标签自定义颜色，修改后在世界书卡片上会同步更新对应颜色的标签。</p>
        <div class="wm-tag-manager" style="margin-top: 12px">
          <div v-if="tagManageTags.length === 0" class="wm-empty wm-empty--compact">暂无自定义分类文件夹</div>
          <div v-for="tag in tagManageTags" :key="'tm-' + tag" class="wm-tag-manage-row">
            <input
              type="color"
              :value="store.settings.tagDefs[tag]?.color ?? '#10b981'"
              :title="`修改「${tag}」颜色`"
              @input="store.upsertTag(tag, ($event.target as HTMLInputElement).value)"
            />
            <span class="wm-tag-chip wm-tag-chip--preview" :style="tagPreviewStyle(tag)">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showBatchTagSheet" class="wm-mobile-sheet" @click.self="showBatchTagSheet = false">
      <div class="wm-mobile-sheet-body" @click.stop>
        <div class="wm-sheet-head">
          <h3 class="wm-sheet-title">批量标签 · {{ store.selectedBooks.size }} 本</h3>
          <div class="menu_button interactable wm-btn" @click="showBatchTagSheet = false">完成</div>
        </div>
        <div class="wm-tags-row">
          <button
            v-for="tag in store.allTags"
            :key="'bs-' + tag"
            type="button"
            class="wm-tag-chip"
            :class="{ inactive: !batchTags.includes(tag) }"
            :style="tagChipStyleForList(tag, batchTags)"
            @click="toggleBatchTag(tag)"
          >
            {{ tag }}
          </button>
        </div>
        <div class="wm-toolbar-row">
          <div
            class="menu_button interactable wm-btn wm-btn-primary"
            style="flex: 1"
            @click="applyBatchAddTagsAndClose"
          >
            添加标签
          </div>
          <div class="menu_button interactable wm-btn" style="flex: 1" @click="applyBatchRemoveTagsAndClose">
            移除标签
          </div>
        </div>
      </div>
    </div>

    <div v-if="showFolderForm" class="wm-mobile-sheet" @click.self="cancelFolderForm">
      <div class="wm-mobile-sheet-body" @click.stop>
        <h3 class="wm-sheet-title">{{ folderForm.editing ? '编辑文件夹' : '新建文件夹' }}</h3>
        <input v-model="folderForm.name" class="text_pole" placeholder="文件夹名称" style="margin-bottom: 12px" />
        <p v-if="folderFormDeleteConfirm" class="wm-delete-warn">
          确定删除文件夹「{{ folderForm.originalName }}」？其中的世界书将归入「{{ store.DEFAULT_FOLDER }}」。
        </p>
        <div v-if="folderFormDeleteConfirm" class="wm-toolbar-row">
          <div class="menu_button interactable wm-btn" style="flex: 1" @click="folderFormDeleteConfirm = false">
            取消
          </div>
          <div class="menu_button interactable wm-btn wm-btn-danger" style="flex: 1" @click="confirmDeleteFolder">
            确认删除
          </div>
        </div>
        <template v-else>
          <div v-if="folderForm.editing" class="wm-toolbar-row">
            <div
              class="menu_button interactable wm-btn wm-btn-danger"
              style="flex: 1"
              @click="folderFormDeleteConfirm = true"
            >
              <i class="fa-solid fa-trash-can"></i> 删除文件夹
            </div>
          </div>
          <div class="wm-toolbar-row">
            <div class="menu_button interactable wm-btn wm-btn-primary" style="flex: 1" @click="submitFolderForm">
              保存
            </div>
            <div class="menu_button interactable wm-btn" @click="cancelFolderForm">取消</div>
          </div>
        </template>
      </div>
    </div>

    <CharBindSheet
      v-if="showCharBindSheet"
      :book-names="charBindBookNames"
      @close="showCharBindSheet = false"
      @applied="onCharBindApplied"
    />

    <BatchEditSheet
      v-if="showBatchEditSheet"
      :count="store.selectedEntryCount"
      @close="showBatchEditSheet = false"
      @save="saveBatchEdit"
    />

    <EntryDiffSheet
      v-if="showEntryDiffSheet"
      :snapshot="entryDiffSnapshot"
      @close="closeEntryDiff"
      @restore="restoreEntryDiff"
    />

    <InjectionOrderSheet
      v-if="showInjectionOrderSheet && store.selectedBook"
      :entries="injectionEntriesSnapshot"
      @close="showInjectionOrderSheet = false"
    />

    <ChangelogSheet v-if="showChangelogSheet" @close="showChangelogSheet = false" />

    <ThemeCustomSheet
      v-if="showThemeCustomSheet"
      :is-light="isLightMode"
      :custom-theme="store.settings.customTheme"
      :theme-presets="store.settings.themePresets ?? []"
      @close="showThemeCustomSheet = false"
      @update:custom-theme="val => (store.settings.customTheme = val as typeof store.settings.customTheme)"
      @update:theme-presets="val => (store.settings.themePresets = val)"
      @update:is-light="onThemeLightChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, toRaw, watch } from 'vue';
import _ from 'lodash';
import { confirmRenameWorldbookWithPopup } from './lib/char-worldbook-sync';
import { usePanelTavernEvents } from './composables/usePanelTavernEvents';
import { tagChipStyleForList as tagChipStyleFromLib } from './lib/tag-chip-style';
import { buildCustomThemeCssVars } from './lib/theme-vars';
import { safeWorldbookNames, useWorldbookManagerStore } from './store';
import BookVirtualList from './BookVirtualList.vue';
import EntryEditForm from './EntryEditForm.vue';
import EntryVirtualList from './EntryVirtualList.vue';
import BatchEditSheet from './BatchEditSheet.vue';
import CharBindSheet from './CharBindSheet.vue';
import ChangelogSheet from './ChangelogSheet.vue';
import ThemeCustomSheet from './ThemeCustomSheet.vue';
import InjectionOrderSheet from './InjectionOrderSheet.vue';
import EntryDiffSheet from './EntryDiffSheet.vue';
import {
  entryDepthLabel,
  entryKeysPreview,
  entryLampClass,
  entryLampTitle,
  entryPositionLabel,
} from './lib/entry-display';
import { entryToEditDraft, type EntryEditDraft } from './lib/entry-edit';
import { refDebounced } from '@vueuse/core';
import { undoAvailable, triggerUndo } from './lib/undo';
import { applyThemeToModal, getStoredTheme, setStoredTheme } from './lib/theme';
import { usePanelMobileLayout } from './lib/use-panel-layout';
import { BOOK_SORT_OPTIONS, type BookSortMode } from './lib/book-sort';
import { bindingScanWarnings, summarizeBindingScan } from './lib/binding-scan';
import {
  blurWithin,
  restampWbModalAutocomplete,
  suppressStaleTavernAutocomplete,
} from './lib/tavern-autocomplete';
import { formatTokenCount, TOKEN_COUNT_HINT } from './lib/token-count';

const props = defineProps<{ onClose?: () => void }>();
const store = useWorldbookManagerStore();
const wmRootRef = ref<HTMLElement | null>(null);
const { isNarrow } = usePanelMobileLayout(wmRootRef);
const isLightMode = ref(getStoredTheme() === 'light');
const mobilePane = ref<'books' | 'entries'>('books');

function syncThemeToModal() {
  applyThemeToModal(isLightMode.value);
}

function onThemeLightChange(light: boolean) {
  isLightMode.value = light;
  setStoredTheme(light ? 'light' : 'dark');
  syncThemeToModal();
}
const showBatchTagSheet = ref(false);
const showCharBindSheet = ref(false);

const charBindBookNames = computed(() => [...store.selectedBooks]);
const showFabMenu = ref(false);

const fabPosition = ref({ x: 0, y: 0 });
let isDraggingFab = false;
let startDragX = 0;
let startDragY = 0;
let startFabX = 0;
let startFabY = 0;
let dragMoveCount = 0;

function onFabPointerDown(e: PointerEvent) {
  isDraggingFab = true;
  startDragX = e.clientX;
  startDragY = e.clientY;
  startFabX = fabPosition.value.x;
  startFabY = fabPosition.value.y;
  dragMoveCount = 0;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onFabPointerMove(e: PointerEvent) {
  if (!isDraggingFab) return;
  const dx = e.clientX - startDragX;
  const dy = e.clientY - startDragY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
    dragMoveCount++;
  }
  fabPosition.value = {
    x: startFabX + dx,
    y: startFabY + dy,
  };
}

function onFabPointerUp(e: PointerEvent) {
  if (!isDraggingFab) return;
  isDraggingFab = false;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
}

function onFabClick(e: MouseEvent) {
  if (dragMoveCount > 2) {
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  showFabMenu.value = !showFabMenu.value;
}
const showDeleteBooksSheet = ref(false);
const showDeleteEntriesSheet = ref(false);
const showNameInputSheet = ref(false);
const nameInputMode = ref<'copy' | 'rename'>('copy');
const nameInputValue = ref('');
const nameInputSource = ref('');
const showBatchEditSheet = ref(false);
const showChangelogSheet = ref(false);
const showThemeCustomSheet = ref(false);
const showInjectionOrderSheet = ref(false);
const showEntryDiffSheet = ref(false);
const entryDiffUid = ref<number | null>(null);
const injectionEntriesSnapshot = ref<WorldbookEntry[]>([]);

const entryDiffSnapshot = computed(() =>
  entryDiffUid.value != null ? store.getEntrySaveSnapshot(entryDiffUid.value) : null,
);

function openEntryDiff(uid: number) {
  if (!store.hasEntrySaveSnapshot(uid)) return;
  entryDiffUid.value = uid;
  showEntryDiffSheet.value = true;
}

function closeEntryDiff() {
  showEntryDiffSheet.value = false;
}

async function restoreEntryDiff() {
  if (entryDiffUid.value == null) return;
  const uid = entryDiffUid.value;
  const ok = await store.restoreEntryFromSnapshot(uid);
  if (!ok) return;
  if (editingUid.value === uid) {
    const e = store.entries.find(x => x.uid === uid);
    if (e) {
      editDraft.value = entryToEditDraft(e);
      editBaselineDraft.value = _.cloneDeep(editDraft.value);
    }
  }
  entryDiffUid.value = null;
  showEntryDiffSheet.value = false;
}

function openInjectionOrderSheet() {
  showInjectionOrderSheet.value = true;
  try {
    injectionEntriesSnapshot.value = _.cloneDeep(toRaw(store.entries));
  } catch (e) {
    console.error('[世界书管理器] 注入顺序快照失败', e);
    injectionEntriesSnapshot.value = store.entries.slice();
  }
}

function openBatchEdit() {
  showBatchEditSheet.value = true;
}

async function saveBatchEdit(data: any) {
  await store.batchEditSelectedEntries(data);
  showBatchEditSheet.value = false;
}

async function onCharBindApplied() {
  store.markRefreshDirty({ binding: true });
  await store.refreshIncremental({ binding: true });
}

function handleClose() {
  blurWithin(wmRootRef.value);
  suppressStaleTavernAutocomplete();
  props.onClose?.();
}

const customStyleVars = computed(() => {
  const isLight = isLightMode.value;
  const t = store.settings.customTheme?.[isLight ? 'light' : 'dark'] ?? {};
  return buildCustomThemeCssVars(t, isLight);
});

const deleteBooksPreview = computed(() => (showDeleteBooksSheet.value ? store.getDeleteBooksPreview() : []));

const showTagManageSheet = ref(false);
const tagManageTags = ref<string[]>([]);
const tagManageBindingReady = ref(false);
const newTagName = ref('');
const newTagColor = ref('#6366f1');
const batchTags = ref<string[]>([]);
const showFolderForm = ref(false);
const folderFormDeleteConfirm = ref(false);

const folderForm = ref({
  editing: false,
  originalName: '',
  name: '',
  tags: [] as string[],
  tagMode: 'or' as 'or' | 'and',
  newTag: '',
});
const transferTarget = ref('');
const editingUid = ref<number | null>(null);
const dragOverEntryUid = ref<number | null>(null);
const dragOverBefore = ref(true);
const showInsertBelowMenu = ref(false);
const showBookSortSheet = ref(false);
const showBookInsertSheet = ref(false);

const searchInput = ref(store.settings.filter.search ?? '');
const debouncedSearch = refDebounced(searchInput, 280);
/** 筛选立即跟输入框同步，避免清空后仍按旧关键词过滤 */
watch(
  searchInput,
  q => {
    if (store.settings.filter.search !== q) store.settings.filter.search = q;
  },
  { flush: 'sync' },
);
/** 防抖仅用于按需加载「匹配条目」所需的条目名索引 */
watch(debouncedSearch, q => {
  const trimmed = q.trim();
  if (!trimmed) return;
  void store.ensureBookEntryNamesForNames(store.filteredBooks.map(b => b.name));
});
watch(
  () => store.settings.filter.search,
  q => {
    if (q !== searchInput.value) searchInput.value = q ?? '';
  },
);
const bookListVirtualKey = computed(
  () => `${store.settings.filter.search ?? ''}\x1f${store.filteredBooks.length}\x1f${store.settings.filter.folder ?? ''}`,
);

const entrySearchInput = ref(store.entrySearchQuery);
const debouncedEntrySearch = refDebounced(entrySearchInput, 250);
watch(debouncedEntrySearch, q => {
  store.entrySearchQuery = q;
});
watch(
  () => store.entrySearchQuery,
  q => {
    if (q !== entrySearchInput.value) entrySearchInput.value = q ?? '';
  },
);

let entryDragScrollTimer: ReturnType<typeof setInterval> | null = null;
function emptyEntryEditDraft(): EntryEditDraft {
  return entryToEditDraft({
    uid: 0,
    name: '',
    enabled: true,
    content: '',
    strategy: {
      type: 'selective',
      keys: [],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: { type: 'after_character_definition', role: 'system', depth: 0, order: 100 },
    probability: 100,
    recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
    effect: { sticky: null, cooldown: null, delay: null },
  });
}

const editDraft = ref<EntryEditDraft>(emptyEntryEditDraft());
const editBaselineDraft = ref<EntryEditDraft | null>(null);

const otherBookNames = computed(() => safeWorldbookNames().filter(n => n !== store.selectedBook));

const canTransferEntries = computed(
  () => store.selectedEntryCount > 0 && !!transferTarget.value.trim(),
);

const totalBookCount = computed(() => safeWorldbookNames().length);

function entryRowClass(entry: WorldbookEntry) {
  return {
    'is-checked': store.isEntrySelected(entry.uid),
    'is-disabled': !entry.enabled,
    'drag-over-before': dragOverEntryUid.value === entry.uid && dragOverBefore.value,
    'drag-over-after': dragOverEntryUid.value === entry.uid && !dragOverBefore.value,
    'is-dragging': store.dragEntryUid === entry.uid,
  };
}

watch(
  () => store.selectedEntryCount,
  n => {
    if (n === 0) showInsertBelowMenu.value = false;
  },
);

const fabPinTargetNames = computed(() => {
  const names = [...store.selectedBooks];
  if (names.length === 0 && store.selectedBook) return [store.selectedBook];
  return names;
});

const fabPinActionLabel = computed(() => {
  const names = fabPinTargetNames.value;
  if (names.length === 0) return '置顶';
  const allPinned = names.every(n => !!store.settings.books[n]?.pinned);
  return allPinned ? '取消置顶' : '置顶';
});

const rootClasses = computed(() => ({
  'wm-root--mobile': true,
  'wm-root--narrow': isNarrow.value,
  'wm-pane-entries': mobilePane.value === 'entries',
  'wm-has-batch-dock': mobilePane.value === 'books' && store.selectedBooks.size > 0,
}));

const activeFilterCount = computed(() => {
  const f = store.settings.filter;
  let n = 0;
  if (f.search?.trim()) n++;
  if (f.charBound !== 'all') n++;
  if (f.globalOnly) n++;
  if (f.currentCharOnly) n++;
  if (f.selectedTags?.length) n++;
  if (f.folder) n++;
  return n;
});

const bindingProgressPercent = computed(() => {
  if (!store.bindingChecking) return 0;
  const p = store.bindingProgress;
  const total = Math.max(p.total, 1);
  const raw = Math.round((p.current / total) * 100);
  if (p.current <= 0) return 6;
  return Math.min(100, Math.max(raw, 6));
});

const bindingProgressIndeterminate = computed(() => store.bindingChecking && store.bindingProgress.current <= 0);

const bindingRefreshLabel = computed(() => {
  if (store.bindingChecking) return '刷新中…';
  return '刷新绑定';
});

const bindingScanSummary = computed(() => {
  const report = store.bindingScanReport;
  if (!report) return '';
  return summarizeBindingScan(report);
});

const bindingScanWarningsList = computed(() => {
  const report = store.bindingScanReport;
  if (!report) return [];
  return bindingScanWarnings(report);
});

const bindingLastRefreshText = computed(() => {
  const at = store.bindingLastRefreshedAt;
  if (!at) return '';
  const time = new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return `绑定已同步 · ${time}${bindingScanWarningsList.value.length ? '（存在异常，建议重新扫描）' : ''}`;
});

const bindingRefreshButtonTitle = computed(() => {
  if (store.bindingChecking) return '正在刷新绑定…';
  if (bindingScanWarningsList.value.length) return `${bindingScanWarningsList.value[0]} · 点击深扫全部`;
  return '深扫全部角色卡与聊天 Lore 绑定';
});

function refreshCurrentBookBinding() {
  if (!store.selectedBook || store.bindingChecking) return;
  void store.refreshBindings({
    onlyBooks: [store.selectedBook],
    includeBound: false,
    deepScan: false,
  });
}

let refreshDebounce: ReturnType<typeof setTimeout> | null = null;
let pendingEventRefresh = false;
const autoRefreshSuspendCount = ref(0);

function suspendAutoRefresh() {
  autoRefreshSuspendCount.value += 1;
  store.setExternalRefreshPaused(true);
}

function resumeAutoRefresh() {
  autoRefreshSuspendCount.value = Math.max(0, autoRefreshSuspendCount.value - 1);
  if (autoRefreshSuspendCount.value === 0) {
    store.setExternalRefreshPaused(false);
  }
  if (autoRefreshSuspendCount.value === 0 && pendingEventRefresh) {
    pendingEventRefresh = false;
    scheduleRefresh();
  }
}

function tagChipStyle(tag: string) {
  return tagChipStyleForList(tag, store.settings.filter.selectedTags);
}

function tagChipStyleForList(tag: string, activeList: string[]) {
  const color = store.settings.tagDefs[tag]?.color ?? '#6366f1';
  return tagChipStyleFromLib(color, activeList.includes(tag));
}

function toggleFolderFilter(folder: string) {
  store.settings.filter.folder = store.settings.filter.folder === folder ? null : folder;
}

/** 移动端：再点已选中的自定义文件夹可编辑 */
function onMobileFolderClick(folder: string) {
  if (folder !== store.DEFAULT_FOLDER && store.settings.filter.folder === folder) {
    openFolderEditor(folder);
    return;
  }
  toggleFolderFilter(folder);
}

function selectBookForView(name: string) {
  store.selectBook(name);
  mobilePane.value = 'entries';
}

function onVisibleBooksStats(names: string[]) {
  void store.ensureBookStatsForNames(names);
}

function toggleBatchTag(tag: string) {
  if (batchTags.value.includes(tag)) batchTags.value = batchTags.value.filter(t => t !== tag);
  else batchTags.value = [...batchTags.value, tag];
}

function applyBatchAddTags() {
  store.addTagsToSelectedBooks(batchTags.value);
}

function applyBatchRemoveTags() {
  store.removeTagsFromSelectedBooks(batchTags.value);
}

function applyBatchAddTagsAndClose() {
  applyBatchAddTags();
  showBatchTagSheet.value = false;
}

function applyBatchRemoveTagsAndClose() {
  applyBatchRemoveTags();
  showBatchTagSheet.value = false;
}

function fabAction(fn: () => void) {
  fn();
  showFabMenu.value = false;
}

function openDeleteBooksSheet() {
  if (store.selectedBooks.size === 0) {
    toastr.warning('请先勾选世界书');
    return;
  }
  showFabMenu.value = false;
  showDeleteBooksSheet.value = true;
}

async function confirmDeleteBooks() {
  await store.deleteSelectedBooksConfirmed();
  showDeleteBooksSheet.value = false;
}

function openCopyBookSheet() {
  const name = store.selectedBook ?? [...store.selectedBooks][0];
  if (!name) {
    toastr.warning('请先选择一本世界书');
    return;
  }
  nameInputMode.value = 'copy';
  nameInputSource.value = name;
  nameInputValue.value = `${name} 副本`;
  showNameInputSheet.value = true;
}

function openRenameBookSheet(explicitName?: string) {
  const name = explicitName ?? store.selectedBook ?? [...store.selectedBooks][0];
  if (!name) {
    toastr.warning('请先选择一本世界书');
    return;
  }
  nameInputMode.value = 'rename';
  nameInputSource.value = name;
  nameInputValue.value = name;
  showNameInputSheet.value = true;
}

async function confirmNameInput() {
  if (nameInputMode.value === 'copy') {
    const ok = await store.copyBookToName(nameInputValue.value);
    if (ok) showNameInputSheet.value = false;
    return;
  }

  const oldName = nameInputSource.value;
  const newName = nameInputValue.value.trim();
  if (!newName || newName === oldName) {
    toastr.warning('请输入不同于原名称的新名称');
    return;
  }

  const boundSnapshot = [...(store.bindingIndex.get(oldName)?.characters ?? [])];
  showNameInputSheet.value = false;

  const confirmed = await confirmRenameWorldbookWithPopup(oldName, newName, store.bindingIndex);
  if (!confirmed) return;

  await store.renameBookToName(newName, oldName, boundSnapshot);
}

function openDeleteEntriesSheet() {
  if (store.selectedEntryCount === 0) return;
  showDeleteEntriesSheet.value = true;
}

async function confirmDeleteEntries() {
  await store.deleteSelectedEntriesConfirmed();
  showDeleteEntriesSheet.value = false;
}

function entryInsertLabel(entry: WorldbookEntry, index: number) {
  const name = entry.name?.trim() || '（无标题）';
  return `${index + 1}. ${name}  #${entry.uid}`;
}

function onInsertBelowChange(ev: Event) {
  const el = ev.target as HTMLSelectElement;
  const raw = el.value;
  if (!raw) return;
  void store.moveSelectedEntriesBelowAnchor(Number(raw));
  el.value = '';
  showInsertBelowMenu.value = false;
}

function stopEntryDragScroll() {
  if (entryDragScrollTimer) clearInterval(entryDragScrollTimer);
  entryDragScrollTimer = null;
}

function onEntriesScrollDragOver(ev: DragEvent) {
  const el = ev.currentTarget as HTMLElement | null;
  if (!el || store.dragEntryUid == null) return;
  const rect = el.getBoundingClientRect();
  const edge = 56;
  const y = ev.clientY;
  stopEntryDragScroll();
  if (y < rect.top + edge) {
    entryDragScrollTimer = setInterval(() => {
      el.scrollTop -= 14;
    }, 16);
  } else if (y > rect.bottom - edge) {
    entryDragScrollTimer = setInterval(() => {
      el.scrollTop += 14;
    }, 16);
  }
}

function onEntryDragStart(uid: number, ev: DragEvent) {
  store.dragEntryUid = uid;
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', String(uid));
  }
}

function onEntryDragEnd() {
  store.dragEntryUid = null;
  dragOverEntryUid.value = null;
  stopEntryDragScroll();
}

function onEntryDragOver(targetUid: number, ev: DragEvent) {
  const from = store.dragEntryUid;
  if (from == null || from === targetUid) return;
  dragOverEntryUid.value = targetUid;
  const el = ev.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  dragOverBefore.value = ev.clientY < rect.top + rect.height / 2;
}

function onEntryDragLeave() {
  dragOverEntryUid.value = null;
}

function onEntryDrop(targetUid: number) {
  const from = store.dragEntryUid;
  if (from == null || from === targetUid) {
    onEntryDragEnd();
    return;
  }
  const list = store.entries;
  let toIdx = list.findIndex(e => e.uid === targetUid);
  if (toIdx < 0) {
    onEntryDragEnd();
    return;
  }
  if (!dragOverBefore.value) toIdx += 1;
  void store.reorderEntryToIndex(from, toIdx);
  onEntryDragEnd();
}

function onBatchMoveFolder(ev: Event) {
  const el = ev.target as HTMLSelectElement;
  const val = el.value;
  if (!val) return;
  el.value = '';

  if (val === '__NEW_FOLDER__') {
    void SillyTavern.callGenericPopup('请输入新建分类文件夹名称：', SillyTavern.POPUP_TYPE.INPUT, '', {
      okButton: '创建并移动',
      cancelButton: '取消',
    }).then(res => {
      if (typeof res !== 'string') return; // 用户取消
      const trimmed = res.trim();
      if (!trimmed) {
        toastr.warning('文件夹名称不能为空');
        return;
      }
      if (trimmed === store.DEFAULT_FOLDER) {
        toastr.warning('不能使用系统保留文件夹名称');
        return;
      }
      if (store.settings.folders.includes(trimmed)) {
        store.moveSelectedBooksToFolder(trimmed);
        return;
      }
      if (store.addFolder(trimmed)) {
        store.moveSelectedBooksToFolder(trimmed);
      } else {
        toastr.error('新建文件夹失败');
      }
    });
  } else {
    store.moveSelectedBooksToFolder(val);
  }
}

function onBatchMoveFolderInside(ev: Event) {
  onBatchMoveFolder(ev);
  showFabMenu.value = false;
}

function openNewFolderForm() {
  folderFormDeleteConfirm.value = false;
  folderForm.value = { editing: false, originalName: '', name: '', tags: [], tagMode: 'or', newTag: '' };
  showFolderForm.value = true;
}

function openFolderEditor(folder: string) {
  folderFormDeleteConfirm.value = false;
  const fm = store.getFolderMeta(folder);
  folderForm.value = {
    editing: true,
    originalName: folder,
    name: folder,
    tags: [...(fm.tags ?? [])],
    tagMode: fm.tagMode ?? 'or',
    newTag: '',
  };
  showFolderForm.value = true;
}

function toggleFolderFormTag(tag: string) {
  const tags = folderForm.value.tags;
  folderForm.value.tags = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
}

function addTagToFolderForm() {
  const t = folderForm.value.newTag.trim();
  if (!t) return;
  store.upsertTag(t, '#6366f1');
  if (!folderForm.value.tags.includes(t)) folderForm.value.tags.push(t);
  folderForm.value.newTag = '';
}

function submitFolderForm() {
  const name = folderForm.value.name.trim();
  if (!name || name === store.DEFAULT_FOLDER) {
    toastr.warning('请输入有效的文件夹名称');
    return;
  }
  const meta = { tags: [...folderForm.value.tags], tagMode: folderForm.value.tagMode };
  if (folderForm.value.editing) {
    const old = folderForm.value.originalName;
    if (name !== old && store.settings.folders.includes(name)) {
      toastr.warning('文件夹名称已存在');
      return;
    }
    if (name !== old) {
      const idx = store.settings.folders.indexOf(old);
      if (idx >= 0) store.settings.folders[idx] = name;
      const oldMeta = store.settings.folderMeta[old];
      delete store.settings.folderMeta[old];
      store.settings.folderMeta[name] = { ...oldMeta, ...meta };
      Object.values(store.settings.books).forEach(b => {
        if (b.folder === old) b.folder = name;
      });
      if (store.settings.filter.folder === old) store.settings.filter.folder = name;
    } else {
      store.updateFolderMeta(name, meta);
    }
    toastr.success(`已更新文件夹「${name}」`);
  } else {
    if (!store.addFolder(name, meta)) {
      toastr.warning('文件夹已存在或名称无效');
      return;
    }
    toastr.success(`已创建文件夹「${name}」`);
  }
  folderFormDeleteConfirm.value = false;
  showFolderForm.value = false;
}

function cancelFolderForm() {
  folderFormDeleteConfirm.value = false;
  showFolderForm.value = false;
}

function confirmDeleteFolder() {
  const name = folderForm.value.originalName;
  if (!name || name === store.DEFAULT_FOLDER) return;
  store.removeFolder(name);
  folderFormDeleteConfirm.value = false;
  showFolderForm.value = false;
  toastr.success(`已删除文件夹「${name}」`);
}

function scheduleRefresh() {
  if (autoRefreshSuspendCount.value > 0) {
    pendingEventRefresh = true;
    return;
  }
  if (refreshDebounce) clearTimeout(refreshDebounce);
  refreshDebounce = setTimeout(() => void store.refreshFromTavern(), 350);
}

function removeTagFromManage(tag: string) {
  store.removeTagDef(tag);
  tagManageTags.value = tagManageTags.value.filter(t => t !== tag);
}

function addTag() {
  if (!newTagName.value.trim()) return;
  const name = newTagName.value.trim();
  store.upsertTag(name, newTagColor.value);
  if (!tagManageTags.value.includes(name)) {
    tagManageTags.value = [...tagManageTags.value, name].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }
  newTagName.value = '';
  toastr.success('已添加标签');
}

watch(showTagManageSheet, open => {
  if (open) {
    suspendAutoRefresh();
    tagManageTags.value = store.settings.folders
      .filter(f => f !== store.DEFAULT_FOLDER)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  } else {
    resumeAutoRefresh();
  }
});

watch(showBatchTagSheet, open => {
  if (open) suspendAutoRefresh();
  else resumeAutoRefresh();
});

function tagPreviewStyle(tag: string) {
  const color = store.settings.tagDefs[tag]?.color ?? '#10b981';
  return {
    backgroundColor: color,
    borderColor: color,
    color: '#ffffff',
  };
}

function openTagManage() {
  showTagManageSheet.value = true;
}

function onBookDrop(targetName: string) {
  const from = store.dragBookName;
  if (from) store.reorderBooks(from, targetName);
  store.dragBookName = null;
}

async function applyBookSort(mode: BookSortMode) {
  await store.sortBooks(mode, 'visible');
  showBookSortSheet.value = false;
}

function onBookInsertPick(anchorName: string) {
  showBookInsertSheet.value = false;
  store.moveSelectedBooksBelowAnchor(anchorName);
}

function onFolderDragStart(name: string) {
  store.dragFolderName = name;
}

function onFolderDrop(targetName: string) {
  const from = store.dragFolderName;
  if (from && from !== store.DEFAULT_FOLDER && targetName !== store.DEFAULT_FOLDER)
    store.reorderFolders(from, targetName);
  store.dragFolderName = null;
}

function toggleEdit(uid: number) {
  if (editingUid.value === uid) {
    closeEntryEdit();
    return;
  }
  const e = store.entries.find(x => x.uid === uid);
  if (!e) return;
  store.clearEntrySaveSnapshot(uid);
  editingUid.value = uid;
  editDraft.value = entryToEditDraft(e);
  editBaselineDraft.value = _.cloneDeep(editDraft.value);
}

function closeEntryEdit() {
  blurWithin(wmRootRef.value);
  suppressStaleTavernAutocomplete();
  editingUid.value = null;
  editBaselineDraft.value = null;
}

async function saveEditFromSheet() {
  if (editingUid.value === null) return;
  await saveEdit(editingUid.value);
  closeEntryEdit();
}

async function persistEditDraft() {
  if (editingUid.value === null) return;
  await store.saveEntry(editingUid.value, editDraft.value, { silent: true });
  const e = store.entries.find(x => x.uid === editingUid.value);
  if (e) editDraft.value = entryToEditDraft(e);
}

async function saveEdit(uid: number) {
  await store.saveEntry(uid, editDraft.value, {
    diffBefore: editBaselineDraft.value ?? undefined,
  });
  editingUid.value = null;
  editBaselineDraft.value = null;
}

async function doTransfer(mode: 'copy' | 'move') {
  if (!transferTarget.value) {
    toastr.warning('请选择目标世界书');
    return;
  }
  await store.transferSelectedEntries(transferTarget.value, mode);
}

const { runBindingRefresh } = usePanelTavernEvents(store, {
  wmRootRef,
  onPanelReady: () => {
    syncThemeToModal();
    restampWbModalAutocomplete();
  },
});

onUnmounted(() => {
  stopEntryDragScroll();
});
</script>
