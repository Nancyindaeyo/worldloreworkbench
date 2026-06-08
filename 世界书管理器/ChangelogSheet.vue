<template>
  <div class="wm-mobile-sheet" @click.self="emit('close')">
    <div class="wm-mobile-sheet-body wm-changelog-sheet" @click.stop>
      <div class="wm-sheet-head">
        <h3 class="wm-sheet-title">更新日志</h3>
        <span class="wm-changelog-version">v{{ version }}</span>
        <div class="menu_button interactable wm-btn" @click="emit('close')">关闭</div>
      </div>
      <div class="wm-changelog-scroll">
        <section v-for="entry in entries" :key="entry.version" class="wm-changelog-block">
          <header class="wm-changelog-block-head">
            <span class="wm-changelog-block-ver">v{{ entry.version }}</span>
            <span v-if="entry.title" class="wm-changelog-block-title">{{ entry.title }}</span>
            <span class="wm-changelog-block-date">{{ entry.date }}</span>
          </header>
          <ul class="wm-changelog-list">
            <li v-for="(item, i) in entry.items" :key="entry.version + '-' + i">{{ item }}</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CHANGELOG, WB_MANAGER_VERSION, type ChangelogEntry } from './lib/changelog';

withDefaults(
  defineProps<{
    version?: string;
    entries?: ChangelogEntry[];
  }>(),
  {
    version: WB_MANAGER_VERSION,
    entries: () => CHANGELOG,
  },
);

const emit = defineEmits<{ close: [] }>();
</script>

<style scoped lang="scss">
.wm-changelog-sheet {
  max-height: min(85vh, 640px);
  display: flex;
  flex-direction: column;
}

.wm-sheet-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  .wm-sheet-title {
    flex: 1;
    margin: 0;
  }
}

.wm-changelog-version {
  font-size: 0.72rem;
  color: var(--wm-muted);
  font-family: ui-monospace, monospace;
}

.wm-changelog-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 8px;
  padding-right: 4px;
}

.wm-changelog-block {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.wm-changelog-block-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--wm-border);
}

.wm-changelog-block-ver {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--wm-primary);
}

.wm-changelog-block-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--wm-title);
}

.wm-changelog-block-date {
  font-size: 0.72rem;
  color: var(--wm-muted);
  margin-left: auto;
}

.wm-changelog-list {
  margin: 0;
  padding-left: 1.15rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--wm-text);

  li + li {
    margin-top: 6px;
  }
}
</style>
