<script setup>
import { onMounted, ref } from 'vue'
import { getSettings, updateSettings } from '@/api/settings'
import { WEEKDAY_LABELS } from '@/config/schedule'

/** 勾选营业日时按周一到周日排列 */
const WEEK_OPTIONS = [1, 2, 3, 4, 5, 6, 0]

/** 营业开始整点 */
const startHour = ref(9)
/** 营业结束整点（不含） */
const endHour = ref(18)
/** 营业的星期 0–6 */
const weekDays = ref([1, 2, 3, 4, 5, 6])
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
    weekDays.value = [...data.weekDays]
  } catch (error) {
    errorText.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

/**
 * 勾选或取消某个营业日。
 * @param {number} day
 * @param {boolean} checked
 */
function toggleDay(day, checked) {
  if (checked) {
    if (!weekDays.value.includes(day)) weekDays.value = weekDays.value.concat(day)
    return
  }
  weekDays.value = weekDays.value.filter((item) => item !== day)
}

/**
 * 保存营业时段；看板下次加载会按新设置画表。
 */
async function onSave() {
  errorText.value = ''
  saving.value = true
  try {
    const data = await updateSettings({
      startHour: Number(startHour.value),
      endHour: Number(endHour.value),
      weekDays: weekDays.value,
    })
    startHour.value = data.startHour
    endHour.value = data.endHour
    weekDays.value = [...data.weekDays]
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
      <fieldset class="system-settings-days">
        <legend>营业日</legend>
        <label v-for="day in WEEK_OPTIONS" :key="day" class="system-settings-day">
          <input
            type="checkbox"
            :checked="weekDays.includes(day)"
            @change="toggleDay(day, $event.target.checked)"
          />
          {{ WEEKDAY_LABELS[day] }}
        </label>
      </fieldset>
      <button type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
    </form>
  </div>
</template>

<style scoped>
/* 系统设置：营业时段与星期 */
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

.system-settings-form input[type='number'] {
  max-width: 120px;
  padding: 8px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
}

.system-settings-days {
  border: 1px solid #e4e7eb;
  border-radius: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 8px 12px;
}

.system-settings-day {
  flex-direction: row !important;
  align-items: center;
  gap: 6px !important;
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
