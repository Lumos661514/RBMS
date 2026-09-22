<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
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
    ElMessage.success('已保存')
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
    <el-alert v-if="errorText" :title="errorText" type="error" :closable="false" show-icon />
    <el-skeleton v-if="loading" :rows="4" animated />
    <el-card v-else class="system-settings-form" shadow="never">
      <el-form label-position="top" @submit.prevent="onSave">
        <el-form-item label="开始整点">
          <el-input-number v-model="startHour" :min="0" :max="23" />
        </el-form-item>
        <el-form-item label="结束整点（不含该点）">
          <el-input-number v-model="endHour" :min="1" :max="24" />
        </el-form-item>
        <el-form-item :label="`时间段（每格分钟数，最低 ${SLOT_MINUTES_MIN}，步进 ${SLOT_MINUTES_STEP}）`">
          <el-select v-model="slotMinutes" style="width: 160px">
            <el-option v-for="item in SLOT_OPTIONS" :key="item" :label="`${item} 分钟`" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item :label="`看板列数（从今日起，最少 ${DAY_COUNT_MIN}）`">
          <el-input-number v-model="dayCount" :min="DAY_COUNT_MIN" :step="1" />
        </el-form-item>
        <el-button type="primary" native-type="submit" :loading="saving">保存</el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
/* 系统设置：营业时段、时间段与看板列数 */
.system-settings-title {
  margin: 0 0 8px;
  font-size: 20px;
}

.system-settings-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: #616e7c;
}

.system-settings-form {
  max-width: 420px;
}
</style>
