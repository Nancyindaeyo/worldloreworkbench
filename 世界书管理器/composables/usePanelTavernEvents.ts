import _ from 'lodash';
import { onMounted, onUnmounted } from 'vue';
import { createCharWorldbookSyncHandlers, snapshotCharacterWorldbooksForEditor } from '../lib/char-worldbook-sync';
import { safeWorldbookNames } from '../lib/tavern-safe';
import { restampWbModalAutocomplete } from '../lib/tavern-autocomplete';
import { getTavernDocument } from '../lib/tavern-autocomplete';
import type { useWorldbookManagerStore } from '../store';

type Store = ReturnType<typeof useWorldbookManagerStore>;

export function usePanelTavernEvents(
  store: Store,
  opts: {
    wmRootRef: { value: HTMLElement | null };
    onPanelReady: () => void | Promise<void>;
  },
) {
  const eventStops: { stop: () => void }[] = [];
  let refreshDebounce: ReturnType<typeof setTimeout> | null = null;
  let entriesReloadDebounce: ReturnType<typeof setTimeout> | null = null;
  let bindingRefreshDebounce: ReturnType<typeof setTimeout> | null = null;

  function scheduleRefresh() {
    if (refreshDebounce) clearTimeout(refreshDebounce);
    refreshDebounce = setTimeout(() => {
      if (store.isExternalRefreshPaused()) return;
      void store.refreshFromTavern();
    }, 400);
  }

  function scheduleBindingRefresh() {
    if (bindingRefreshDebounce) clearTimeout(bindingRefreshDebounce);
    bindingRefreshDebounce = setTimeout(() => {
      if (store.isExternalRefreshPaused()) return;
      void store.refreshBindings({ deepScan: false, mode: 'refresh', silent: true });
    }, 400);
  }

  const charWorldbookSync = createCharWorldbookSyncHandlers({
    getBindingIndex: () => store.bindingIndex,
    applyDeletedBookByName: name => store.applyDeletedBookByName(name),
    scheduleBindingRefresh,
    safeWorldbookNames,
  });

  async function runBindingRefresh() {
    if (store.bindingChecking) return;
    try {
      await store.refreshBindings({ deepScan: true, mode: 'refresh' });
    } catch (e) {
      console.error('[世界书管理器] 刷新绑定失败', e);
    }
  }

  onMounted(async () => {
    const modal =
      getTavernDocument().getElementById('wb-manager-modal') ??
      opts.wmRootRef.value?.closest('#wb-manager-modal') ??
      null;
    if (modal) {
      const restamp = _.debounce(() => restampWbModalAutocomplete(), 120);
      const stampObserver = new MutationObserver(() => restamp());
      stampObserver.observe(modal, { childList: true, subtree: true });
      eventStops.push({ stop: () => stampObserver.disconnect() });
    }

    const flushOnPanelClose = () => void store.flushPendingRefresh();
    window.addEventListener('wb-manager-panel-close', flushOnPanelClose);
    eventStops.push({ stop: () => window.removeEventListener('wb-manager-panel-close', flushOnPanelClose) });

    try {
      await store.refreshAll({ loadStats: false });
      await opts.onPanelReady();
    } catch (e) {
      console.error('[世界书管理器] 初始化失败', e);
      toastr.error('加载世界书列表失败');
    }

    eventStops.push(
      eventOn(tavern_events.WORLDINFO_UPDATED, scheduleRefresh),
      eventOn(tavern_events.WORLDINFO_ENTRIES_LOADED, () => {
        if (!store.selectedBook || store.isExternalRefreshPaused()) return;
        if (entriesReloadDebounce) clearTimeout(entriesReloadDebounce);
        entriesReloadDebounce = setTimeout(() => {
          if (store.isExternalRefreshPaused()) return;
          void store.loadEntries(store.selectedBook!, { silent: true, preserveSelection: true });
        }, 400);
      }),
      eventOn(tavern_events.SETTINGS_UPDATED, scheduleRefresh),
      eventOn(tavern_events.CHAT_CHANGED, scheduleBindingRefresh),
      eventOn(tavern_events.CHARACTER_EDITOR_OPENED, chid => void snapshotCharacterWorldbooksForEditor(chid)),
      eventOn(tavern_events.CHARACTER_EDITED, r => void charWorldbookSync.handleCharacterEdited(r)),
      eventOn(tavern_events.CHARACTER_RENAMED, scheduleBindingRefresh),
      eventOn(tavern_events.CHARACTER_DELETED, r => void charWorldbookSync.handleCharacterDeleted(r)),
    );
  });

  onUnmounted(() => {
    eventStops.forEach(h => h.stop());
    if (entriesReloadDebounce) clearTimeout(entriesReloadDebounce);
    if (bindingRefreshDebounce) clearTimeout(bindingRefreshDebounce);
    if (refreshDebounce) clearTimeout(refreshDebounce);
  });

  return { runBindingRefresh, charWorldbookSync };
}
