<template>
  <div class="wm-mobile-sheet wm-batch-edit-sheet-wrapper" @click.self="emit('close')">
    <div class="wm-mobile-sheet-content wm-batch-edit-sheet">
      <header class="wm-mobile-sheet-header">
        <h3>批量修改 (已选 {{ count }} 个)</h3>
        <div class="menu_button interactable wm-btn wm-btn-icon" @click="emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </div>
      </header>
      
      <div class="wm-mobile-sheet-body">
        <p class="wm-batch-hint">💡 直接在此修改您想要调整的设置。修改过的设置组将自动应用，未修改的属性将保持原有设定不变。</p>
        
        <div class="wm-edit-compact-grid">
          <!-- 1. 基础属性 -->
          <section class="wm-edit-section">
            <div class="wm-edit-section-title">
              <span class="wm-batch-section-name">
                <i class="fa-solid fa-power-off"></i> 启用状态
              </span>
              <span v-if="touched.enabled" class="wm-touch-indicator">已修改</span>
            </div>
            <div class="wm-edit-row">
              <label class="wm-check-label">
                <input v-model="fields.enabled" type="checkbox" @change="touched.enabled = true" />
                <span>启用该条目</span>
              </label>
            </div>
          </section>

          <!-- 2. 激活设置 -->
          <section class="wm-edit-section">
            <div class="wm-edit-section-title">
              <span class="wm-batch-section-name">
                <i class="fa-solid fa-bolt"></i> 激活策略
              </span>
              <span v-if="touched.activation" class="wm-touch-indicator">已修改</span>
            </div>
            <div class="wm-edit-row">
              <label class="wm-edit-field">
                <span class="wm-edit-label">策略</span>
                <select v-model="fields.strategyType" class="text_pole" @change="touched.activation = true">
                  <option value="constant">🔵 蓝灯 · 常量</option>
                  <option value="selective">🟢 绿灯 · 可选</option>
                  <option value="vectorized">🔗 向量化</option>
                </select>
              </label>
            </div>
          </section>

          <!-- 3. 插入位置 -->
          <section class="wm-edit-section">
            <div class="wm-edit-section-title">
              <span class="wm-batch-section-name">
                <i class="fa-solid fa-map-pin"></i> 插入位置
              </span>
              <span v-if="touched.position" class="wm-touch-indicator">已修改</span>
            </div>
            <div class="wm-edit-row wm-edit-row--position">
              <label class="wm-edit-field">
                <span class="wm-edit-label">位置</span>
                <select v-model="fields.positionType" class="text_pole" @change="touched.position = true">
                  <option v-for="opt in POSITION_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </label>
              <label v-if="fields.positionType === 'at_depth'" class="wm-edit-field">
                <span class="wm-edit-label">身份</span>
                <select v-model="fields.positionRole" class="text_pole" @change="touched.position = true">
                  <option value="system">system</option>
                  <option value="assistant">assistant</option>
                  <option value="user">user</option>
                </select>
              </label>
              <label v-if="fields.positionType === 'at_depth'" class="wm-edit-field">
                <span class="wm-edit-label">深度</span>
                <input
                  v-model.number="fields.positionDepth"
                  type="number"
                  min="0"
                  class="text_pole"
                  @input="touched.position = true"
                />
              </label>
              <label class="wm-edit-field wm-edit-field--narrow">
                <span class="wm-edit-label">顺序</span>
                <input v-model.number="fields.positionOrder" type="number" class="text_pole" @input="touched.position = true" />
              </label>
            </div>
          </section>

          <!-- 4. 递归设置 -->
          <section class="wm-edit-section">
            <div class="wm-edit-section-title">
              <span class="wm-batch-section-name">
                <i class="fa-solid fa-arrows-spin"></i> 递归特性
              </span>
              <span v-if="touched.recursion" class="wm-touch-indicator">已修改</span>
            </div>
            <div class="wm-edit-row wm-edit-row--checks">
              <label class="wm-check-label wm-check-label--compact">
                <input v-model="fields.preventIncoming" type="checkbox" @change="touched.recursion = true" />
                <span>不可递归</span>
              </label>
              <label class="wm-check-label wm-check-label--compact">
                <input v-model="fields.preventOutgoing" type="checkbox" @change="touched.recursion = true" />
                <span>防止进一步递归</span>
              </label>
            </div>
          </section>

          <!-- 5. 文本查找与替换/删除 (分步式，查找高亮和替换删除拆分) -->
          <section class="wm-edit-section wm-edit-section--replace">
            <div class="wm-edit-section-title">
              <span class="wm-batch-section-name">
                <i class="fa-solid fa-magnifying-glass"></i> 第一步：输入查找文本
              </span>
              <span v-if="replaceForm.findText.trim()" class="wm-touch-indicator">已输入</span>
            </div>
            <div class="wm-replace-box" style="margin-bottom: 12px;">
              <div class="wm-edit-row">
                <label class="wm-edit-field">
                  <span class="wm-edit-label">要查找的字词 (列表中会进行实时高亮)</span>
                  <input v-model="replaceForm.findText" type="text" class="text_pole" placeholder="例如：极其" />
                </label>
              </div>
            </div>

            <div v-if="replaceForm.findText.trim()" class="wm-batch-replace-step2" style="animation: fadeIn 0.2s ease;">
              <div class="wm-edit-section-title">
                <span class="wm-batch-section-name">
                  <i class="fa-solid fa-wand-magic-sparkles"></i> 第二步：执行替换与删除
                </span>
              </div>
              <div class="wm-replace-box">
                <div class="wm-edit-row">
                  <label class="wm-edit-field">
                    <span class="wm-edit-label">替换为 (留空即为直接删除)</span>
                    <input v-model="replaceForm.replaceText" type="text" class="text_pole" placeholder="例如：非常（留空即删除「极其」）" />
                  </label>
                </div>
                <div class="wm-edit-row wm-edit-row--checks" style="margin-top: 8px; flex-wrap: wrap;">
                  <span class="wm-edit-label" style="display: block; margin-right: 12px; align-self: center;">应用于：</span>
                  <label class="wm-check-label wm-check-label--compact">
                    <input v-model="replaceForm.targetContent" type="checkbox" />
                    <span>正文内容</span>
                  </label>
                  <label class="wm-check-label wm-check-label--compact">
                    <input v-model="replaceForm.targetName" type="checkbox" />
                    <span>条目名称</span>
                  </label>
                  <label class="wm-check-label wm-check-label--compact">
                    <input v-model="replaceForm.targetKeys" type="checkbox" />
                    <span>关键字</span>
                  </label>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      
      <footer class="wm-mobile-sheet-footer">
        <div class="menu_button interactable wm-btn" style="flex: 1" @click="emit('close')">取消</div>
        <div class="menu_button interactable wm-btn wm-btn-primary" style="flex: 1" @click="applyBatch">保存修改</div>
      </footer>
    </div>

    <!-- 确认修改弹窗：绝对定位覆盖整个 sheet，避免 fixed + flex 导致右下角错位 -->
    <div v-if="showConfirm" class="wm-batch-confirm-overlay" @click.self="showConfirm = false">
      <div class="wm-batch-confirm-dialog" @click.stop>
        <header class="wm-batch-confirm-header">
          <h4>📋 确认批量修改内容</h4>
        </header>
        <div class="wm-batch-confirm-body">
            <p class="wm-confirm-intro">系统将对选中的 <strong>{{ count }}</strong> 个世界书条目批量应用以下更改：</p>
            <div class="wm-confirm-changes-list">
              <div v-if="touched.enabled" class="wm-confirm-item">
                <span class="wm-confirm-dot">🔹</span>
                <span class="wm-confirm-label">启用状态：</span>
                <span class="wm-confirm-val">{{ fields.enabled ? '🟢 启用条目' : '🔴 禁用条目' }}</span>
              </div>
            <div v-if="touched.activation" class="wm-confirm-item">
              <span class="wm-confirm-dot">🔹</span>
              <span class="wm-confirm-label">激活策略：</span>
              <span class="wm-confirm-val">
                {{ fields.strategyType === 'constant' ? '🔵 常量' : fields.strategyType === 'selective' ? '🟢 可选' : '🔗 向量化' }}
              </span>
            </div>
            <div v-if="touched.position" class="wm-confirm-item">
              <span class="wm-confirm-dot">🔹</span>
              <span class="wm-confirm-label">插入位置：</span>
              <span class="wm-confirm-val">
                {{ getPositionLabel(fields.positionType) }}
                <template v-if="fields.positionType === 'at_depth'"> | 深度: {{ fields.positionDepth }}</template>
                | 顺序: {{ fields.positionOrder }}
              </span>
            </div>
              <div v-if="touched.recursion" class="wm-confirm-item">
                <span class="wm-confirm-dot">🔹</span>
                <span class="wm-confirm-label">递归设置：</span>
                <span class="wm-confirm-val">
                  不可递归: {{ fields.preventIncoming ? '是' : '否' }} | 防止进一步递归: {{ fields.preventOutgoing ? '是' : '否' }}
                </span>
              </div>
              <div v-if="replaceForm.findText.trim()" class="wm-confirm-item">
                <span class="wm-confirm-dot">🔍</span>
                <span class="wm-confirm-label">查找替换：</span>
                <span class="wm-confirm-val">
                  将「<strong class="wm-val-highlight">{{ replaceForm.findText }}</strong>」替换为「<strong class="wm-val-highlight">{{ replaceForm.replaceText || '(删除文本)' }}</strong>」
                  <br/>
                  <span class="wm-confirm-sub">
                    (应用于:
                    {{ [
                      replaceForm.targetContent ? '正文' : '',
                      replaceForm.targetName ? '标题' : '',
                      replaceForm.targetKeys ? '关键字' : ''
                    ].filter(Boolean).join('、') }}
                    )
                  </span>
                </span>
              </div>
            </div>
          </div>
        <footer class="wm-batch-confirm-footer">
          <div class="menu_button interactable wm-btn" @click="showConfirm = false">返回修改</div>
          <div class="menu_button interactable wm-btn wm-btn-primary" @click="confirmAndSave">确认并应用</div>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { POSITION_OPTIONS } from './lib/entry-edit';
import toastr from 'toastr';

const props = defineProps<{
  count: number;
}>();

const emit = defineEmits<{
  close: [];
  save: [data: any];
}>();

const touched = ref({
  enabled: false,
  activation: false,
  position: false,
  recursion: false,
});

const fields = ref({
  enabled: true,
  strategyType: 'selective' as 'constant' | 'selective' | 'vectorized',
  positionType: 'after_character_definition' as any,
  positionRole: 'system' as 'system' | 'assistant' | 'user',
  positionDepth: 0,
  positionOrder: 100,
  preventIncoming: false,
  preventOutgoing: false,
});

const replaceForm = ref({
  findText: '',
  replaceText: '',
  targetContent: true,
  targetName: false,
  targetKeys: false,
});

const showConfirm = ref(false);

function getPositionLabel(type: string) {
  const found = POSITION_OPTIONS.find(o => o.value === type);
  return found ? found.label : type;
}

function applyBatch() {
  const hasTouched = touched.value.enabled || touched.value.activation || touched.value.position || touched.value.recursion;
  const hasReplace = replaceForm.value.findText.trim().length > 0;
  
  if (!hasTouched && !hasReplace) {
    toastr.warning('您没有修改任何属性，也未填写查找替换文本');
    return;
  }
  
  showConfirm.value = true;
}

function confirmAndSave() {
  const data: any = {
    fields: {},
  };
  
  if (touched.value.enabled) {
    data.fields.enabled = fields.value.enabled;
  }
  if (touched.value.activation) {
    data.fields.strategyType = fields.value.strategyType;
  }
  if (touched.value.position) {
    data.fields.positionType = fields.value.positionType;
    data.fields.positionRole = fields.value.positionRole;
    data.fields.positionDepth = fields.value.positionDepth;
    data.fields.positionOrder = fields.value.positionOrder;
  }
  if (touched.value.recursion) {
    data.fields.preventIncoming = fields.value.preventIncoming;
    data.fields.preventOutgoing = fields.value.preventOutgoing;
  }
  
  if (replaceForm.value.findText.trim()) {
    data.replace = {
      findText: replaceForm.value.findText,
      replaceText: replaceForm.value.replaceText,
      targetContent: replaceForm.value.targetContent,
      targetName: replaceForm.value.targetName,
      targetKeys: replaceForm.value.targetKeys,
    };
  }
  
  showConfirm.value = false;
  emit('save', data);
}
</script>

<style scoped>
.wm-batch-hint {
  color: var(--wm-muted);
  font-size: 13px;
  margin-bottom: 12px;
  background: var(--wm-surface-dim);
  padding: 8px 12px;
  border-radius: 4px;
}
.wm-batch-section-name {
  font-weight: bold;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.wm-touch-indicator {
  font-size: 11px;
  background: var(--wm-primary-soft);
  color: var(--wm-primary);
  border: 1px solid var(--wm-primary);
  padding: 1px 6px;
  border-radius: 9999px;
  font-weight: normal;
}
.wm-replace-box {
  background: var(--wm-surface-dim);
  padding: 12px;
  border-radius: 4px;
  border: 1px solid var(--wm-border);
}
</style>