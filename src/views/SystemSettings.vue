<script setup>
import { onMounted, ref } from 'vue'
import { getSettings, updateSettings } from '@/api/settings'
import {
  DAY_COUNT_DEFAULT,
  DAY_COUNT_MIN,
  SLOT_MINUTES_DEFAULT,
  SLOT_MINUTES_MIN,
  SLOT_MINUTES_STEP,
} from '@/config/schedule'

/** 营业开始整点 */
const startHour = ref(9)
/** 营业结束整点（不含） */
const endHour = ref(18)
/** 看板从今天起展示的列数，最少 7 */
const dayCount = ref(DAY_COUNT_DEFAULT)
/** 每格时间段（分钟），最低 30，且为 30 的倍数 */
const slotMinutes = ref(SLOT_MINUTES_DEFAULT)
/** 设置页可选的时间段档位 */
const SLOT_OPTIONS = [30, 60, 90, 120]
const loading = ref(false)
const saving = ref(false)
const errorText = ref('')

/** 打开页时带回当前营业设置。 */
async function loadSettings() {
  loading.value = true
  errorText.value = ''
  try {
    const data = await getSettings()
    startHour.value = data.startHour
    endHour.value = data.endHour
    dayCount.value = data.dayCount ?? DAY_COUNT_DEFAULT
    slotMinutes.value = data.slotMinutes ?? SLOT_MINUTES_DEFAULT
  } catch (error) {
    errorText.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

/**
 * 保存营业时段、看板列数与时间段；看板下次加载会按新设置画表。
 */
async function onSave() {
  errorText.value = ''
  saving.value = true
  try {
    const data = await updateSettings({
      startHour: Number(startHour.value),
      endHour: Number(endHour.value),
      dayCount: Number(dayCount.value),
      slotMinutes: Number(slotMinutes.value),
    })
    startHour.value = data.startHour
    endHour.value = data.endHour
    dayCount.value = data.dayCount
    slotMinutes.value = data.slotMinutes
  } catch (error) {
    errorText.value = error.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(loadSettings)
</script>

<template>
  <div class="system-settings">
    <h2 class="system-settings-title">系统设置</h2>
    <p class="system-settings-hint">修改后回到预约看板即可看到新的行列。</p>
    <!-- 加载失败 -->
    <p v-if="errorText" class="system-settings-error">{{ errorText }}</p>
    <p v-if="loading">加载中…</p>
    <form v-else class="system-settings-form" @submit.prevent="onSave">
      <label>
        开始整点
        <input v-model.number="startHour" type="number" min="0" max="23" />
      </label>
      <label>
        结束整点（不含该点）
        <input v-model.number="endHour" type="number" min="1" max="24" />
      </label>
      <label>
        时间段（每格分钟数，最低 {{ SLOT_MINUTES_MIN }}，步进 {{ SLOT_MINUTES_STEP }}）
        <select v-model.number="slotMinutes">
          <option v-for="item in SLOT_OPTIONS" :key="item" :value="item">
            {{ item }} 分钟
          </option>
        </select>
      </label>
      <label>
        看板列数（从今日起，最少 {{ DAY_COUNT_MIN }}）
        <input v-model.number="dayCount" type="number" :min="DAY_COUNT_MIN" step="1" />
      </label>
      <button type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
    </form>
  </div>
</template>

<style scoped>
/* 系统设置：营业时段、时间段与看板列数 */
.system-settings-title {
  margin: 0 0 8px;
  font-size: 20px;
}

.system-settings-hint,
.system-settings-error {
  font-size: 13px;
}

.system-settings-error {
  color: #c81e1e;
}

.system-settings-form {
  margin-top: 16px;
  max-width: 420px;
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.system-settings-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #52606d;
}

.system-settings-form input[type='number'],
.system-settings-form select {
  max-width: 160px;
  padding: 8px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
  font: inherit;
}

.system-settings-form button {
  width: fit-content;
  padding: 8px 16px;
  border: 0;
  border-radius: 4px;
  background: #1f4e79;
  color: #fff;
  cursor: pointer;
}
</style>
