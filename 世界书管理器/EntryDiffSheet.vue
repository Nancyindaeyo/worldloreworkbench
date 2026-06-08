<template>
  <div class="wm-mobile-sheet" @click.self="emit('close')">
    <div class="wm-mobile-sheet-content wm-entry-diff-sheet">
      <header class="wm-mobile-sheet-header">
        <h3>条目变更 #{{ snapshot?.uid }}</h3>
        <div class="menu_button interactable wm-btn wm-btn-icon" @click="emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </div>
      </header>

      <div class="wm-mobile-sheet-body wm-entry-diff-body">
        <p v-if="snapshot" class="wm-entry-diff-meta">
          {{ snapshot.bookName }} · {{ savedAtLabel }}
        </p>
        <p v-if="!diff?.hasChanges" class="wm-empty">无记录或本次保存无变更</p>
        <template v-else>
          <section v-if="checkboxSections.length" class="wm-entry-diff-checkboxes">
            <div class="wm-entry-diff-checkbox-head">
              <span class="wm-entry-diff-checkbox-head-spacer"></span>
              <span>改前</span>
              <span>改后</span>
            </div>
            <div
              v-for="section in checkboxSections"
              :key="section.key"
              class="wm-entry-diff-checkbox-row"
              :class="{ 'wm-entry-diff-checkbox-row--changed': section.boolBefore !== section.boolAfter }"
            >
              <span class="wm-entry-diff-checkbox-name">{{ section.label }}</span>
              <label
                class="wm-diff-checkbox-cell"
                :class="{ 'wm-diff-checkbox-cell--changed': section.boolBefore !== section.boolAfter }"
              >
                <input type="checkbox" :checked="section.boolBefore" disabled tabindex="-1" />
              </label>
              <label
                class="wm-diff-checkbox-cell"
                :class="{ 'wm-diff-checkbox-cell--changed': section.boolBefore !== section.boolAfter }"
              >
                <input type="checkbox" :checked="section.boolAfter" disabled tabindex="-1" />
              </label>
            </div>
          </section>

          <section
            v-for="section in textSections"
            :key="section.key"
            class="wm-entry-diff-section"
            :class="{ 'wm-entry-diff-section--content': section.isContent }"
          >
            <h4 class="wm-entry-diff-section-title">{{ section.label }}</h4>
            <div class="wm-diff-preview-grid" :class="{ 'wm-diff-preview-grid--content': section.isContent }">
              <div class="wm-diff-preview-pane">
                <div class="wm-diff-preview-label">改前</div>
                <pre class="wm-diff-preview-pre" v-html="sectionLeftHtml(section)"></pre>
              </div>
              <div class="wm-diff-preview-pane">
                <div class="wm-diff-preview-label">改后</div>
                <pre class="wm-diff-preview-pre" v-html="sectionRightHtml(section)"></pre>
              </div>
            </div>
          </section>
        </template>
      </div>

      <footer class="wm-mobile-sheet-footer">
        <div
          v-if="snapshot && diff?.hasChanges"
          class="menu_button interactable wm-btn wm-btn-danger"
          @click="emit('restore')"
        >
          恢复改前
        </div>
        <div class="menu_button interactable wm-btn wm-btn-primary" style="flex: 1" @click="emit('close')">
          关闭
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { diffEntryDrafts, spansToHtml, type DiffSection } from './lib/entry-diff';
import type { EntrySaveSnapshot } from './store';

const props = defineProps<{
  snapshot: EntrySaveSnapshot | null;
}>();

const emit = defineEmits<{ close: []; restore: [] }>();

const diff = computed(() => {
  if (!props.snapshot) return null;
  return diffEntryDrafts(props.snapshot.before, props.snapshot.after);
});

const checkboxSections = computed(() => diff.value?.sections.filter(s => s.kind === 'checkbox') ?? []);

const textSections = computed(() => diff.value?.sections.filter(s => s.kind === 'text') ?? []);

function sectionLeftHtml(section: DiffSection): string {
  return spansToHtml(section.left);
}

function sectionRightHtml(section: DiffSection): string {
  return spansToHtml(section.right);
}

const savedAtLabel = computed(() => {
  if (!props.snapshot) return '';
  return new Date(props.snapshot.savedAt).toLocaleString('zh-CN', { hour12: false });
});
</script>
