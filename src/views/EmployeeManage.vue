<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createEmployee, deleteEmployee, getEmployees, updateEmployee } from '@/api/employees'
import { getBookings } from '@/api/booking'
import { getServices } from '@/api/services'
import { getSettings } from '@/api/settings'
import { employeePresence, formatClockFromMinutes, formatISODate, leaveOverlapsBooking, leaveRangesOverlap } from '@/utils/schedule'

/** 员工列表 */
const employees = ref([])
/** 进行中预约，用来判断此刻是否在忙 */
const bookings = ref([])
/** 营业起止整点，请假只能落在这个区间 */
const openHour = ref(9)
const closeHour = ref(18)
/** 项目（服务）目录，用来勾选可做项目 */
const services = ref([])
const loading = ref(false)
const loadError = ref('')
const actionError = ref('')
const saving = ref(false)

/** 当前编辑中的员工 id；空字符串表示新增 */
const editingId = ref('')
/** 表单：姓名 */
const formName = ref('')
/** 表单：可做项目 id 列表 */
const formServiceIds = ref([])
/** 表单：请假时段 */
const formLeaves = ref([])
/** 待加入的开始时间，YYYY-MM-DD HH:mm */
const leaveStartAt = ref('')
/** 待加入的结束时间，YYYY-MM-DD HH:mm */
const leaveEndAt = ref('')

/** 此刻状态文案。请假优先于进行中的预约。 */
const presenceLabel = { leave: '请假', busy: '在忙', free: '空闲' }

/** 同时拉员工、项目、预约和营业时间。 */
async function loadPage() {
  loading.value = true
  loadError.value = ''
  try {
    const [empData, serviceData, bookingData, nextSettings] = await Promise.all([
      getEmployees(),
      getServices(),
      getBookings(),
      getSettings(),
    ])
    employees.value = empData.list || []
    services.value = serviceData.list || []
    bookings.value = bookingData.list || []
    openHour.value = Number(nextSettings.startHour)
    closeHour.value = Number(nextSettings.endHour)
  } catch (error) {
    loadError.value = error.message || '加载失败'
  } finally {
    loading.value = false
  }
}

/** 清空表单进入新增。 */
function startCreate() {
  editingId.value = ''
  formName.value = ''
  formServiceIds.value = []
  formLeaves.value = []
  leaveStartAt.value = ''
  leaveEndAt.value = ''
  actionError.value = ''
}

/**
 * 填表进入编辑。
 * @param {{ id: string, name: string, serviceIds: string[], leaves?: object[] }} item
 */
function startEdit(item) {
  editingId.value = item.id
  formName.value = item.name
  formServiceIds.value = [...(item.serviceIds || [])]
  formLeaves.value = (item.leaves || []).map((leave) => ({ ...leave }))
  leaveStartAt.value = ''
  leaveEndAt.value = ''
  actionError.value = ''
}

/**
 * 列表上展示员工可做的项目名。
 * @param {{ serviceIds?: string[] }} item
 */
function projectNames(item) {
  const ids = item.serviceIds || []
  const names = ids
    .map((id) => services.value.find((s) => s.id === id)?.name)
    .filter(Boolean)
  return names.length ? names.join('、') : '未配置项目'
}

/**
 * 列表上的当前状态：请假、在忙或空闲。
 * @param {{ id: string, leaves?: object[] }} item
 */
function presenceText(item) {
  return presenceLabel[employeePresence(item, bookings.value)]
}

/**
 * 状态样式：请假、在忙、空闲各一色。
 * @param {{ id: string, leaves?: object[] }} item
 */
function presenceClass(item) {
  return `is-${employeePresence(item, bookings.value)}`
}

/**
 * 面板里的日期转成 Date。未选中时返回 null。
 * @param {Date | { toDate?: () => Date } | undefined} value
 */
function pickedDate(value) {
  if (!value) return null
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * 是否同一天。用来判断今天以前的时分要不要禁掉。
 * @param {Date} left
 * @param {Date} right
 */
function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

/**
 * 今天零点以前的日期不可选；当天若已过下班时间，整天也不可选。
 * @param {Date} date
 */
function disabledLeaveDate(date) {
  const today = new Date()
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (day < todayStart) return true
  if (day.getTime() === todayStart.getTime()) {
    const nowMinutes = today.getHours() * 60 + today.getMinutes()
    if (nowMinutes >= closeHour.value * 60) return true
  }
  return false
}

/**
 * 不在营业时间内、或今天已经过去的小时。开始不能选到下班整点。
 * @param {string} _role
 * @param {Date | { toDate?: () => Date }} comparingDate 面板当前选中的日期
 * @param {'start' | 'end'} kind
 */
function disabledLeaveHours(_role, comparingDate, kind) {
  const selected = pickedDate(comparingDate)
  const now = new Date()
  const today = selected ? isSameDay(selected, now) : false
  const blocked = []
  for (let hour = 0; hour < 24; hour += 1) {
    const outside =
      kind === 'start'
        ? hour < openHour.value || hour >= closeHour.value
        : hour < openHour.value || hour > closeHour.value
    if (outside || (today && hour < now.getHours())) blocked.push(hour)
  }
  return blocked
}

/** 开始时间的禁用小时。 */
function disabledStartHours(role, comparingDate) {
  return disabledLeaveHours(role, comparingDate, 'start')
}

/** 结束时间的禁用小时。 */
function disabledEndHours(role, comparingDate) {
  return disabledLeaveHours(role, comparingDate, 'end')
}

/**
 * 今天当前小时里已经过去的分钟；结束在下班整点只留 :00。
 * @param {number} hour
 * @param {string} _role
 * @param {Date | { toDate?: () => Date }} comparingDate
 * @param {'start' | 'end'} kind
 */
function disabledLeaveMinutes(hour, _role, comparingDate, kind) {
  const selected = pickedDate(comparingDate)
  const now = new Date()
  const today = selected ? isSameDay(selected, now) : false
  const blocked = []
  for (let minute = 0; minute < 60; minute += 1) {
    if (kind === 'end' && hour === closeHour.value && minute !== 0) {
      blocked.push(minute)
      continue
    }
    if (today && hour === now.getHours() && minute < now.getMinutes()) blocked.push(minute)
  }
  return blocked
}

/** 开始时间的禁用分钟。 */
function disabledStartMinutes(hour, role, comparingDate) {
  return disabledLeaveMinutes(hour, role, comparingDate, 'start')
}

/** 结束时间的禁用分钟。 */
function disabledEndMinutes(hour, role, comparingDate) {
  return disabledLeaveMinutes(hour, role, comparingDate, 'end')
}

/** 当前打开的请假时间弹层。 */
function visibleLeavePopper() {
  return [...document.querySelectorAll('.employee-manage-leave-popper')].find(
    (node) => getComputedStyle(node).display !== 'none',
  )
}

/**
 * 展开时分列。组件记住第一次聚焦后，再派发 focus 不会打开，所以直接调用它的 focus 回调。
 * @param {Element | undefined} root
 */
function showLeaveClock(root) {
  const input = root?.querySelector('.el-date-picker__editor-wrap:last-child input')
  const onFocus = input?.closest('.el-input')?.__vueParentComponent?.vnode?.props?.onFocus
  if (typeof onFocus === 'function') onFocus()
}

/**
 * 点在日历上会先关掉时分列，这次松开后立刻再打开。
 * 列被收起时高度变成 0，滚动会把时间写成 0:00。
 * @param {MouseEvent} event
 */
function keepLeaveClock(event) {
  const root = visibleLeavePopper()
  if (!root || !root.contains(event.target) || event.target.closest('.el-time-panel')) return
  showLeaveClock(root)
}

/** 面板打开时展开时分，并在点日历之后保持时分列。 */
function openLeaveClock(visible) {
  document.removeEventListener('mouseup', keepLeaveClock)
  if (!visible) return
  document.addEventListener('mouseup', keepLeaveClock)
  window.setTimeout(() => showLeaveClock(visibleLeavePopper()), 50)
}

/**
 * YYYY-MM-DD HH:mm 拆成日期和当天分钟。格式不对返回 null。
 * @param {string} value
 */
function parseLeaveAt(value) {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const hours = Number(match[2])
  const minutes = Number(match[3])
  if (hours > 23 || minutes > 59) return null
  return { date: match[1], minutes: hours * 60 + minutes }
}

/** 把当前填写的时段加入表单，保存时才提交。 */
function addLeave() {
  actionError.value = ''
  const start = parseLeaveAt(leaveStartAt.value)
  const end = parseLeaveAt(leaveEndAt.value)
  const open = openHour.value * 60
  const close = closeHour.value * 60
  if (!start || !end) {
    actionError.value = '请选择开始和结束时间'
    return
  }
  const now = new Date()
  const today = formatISODate(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  if (start.date < today || (start.date === today && start.minutes < nowMinutes)) {
    actionError.value = '不能选择已经过去的时间'
    return
  }
  const endsAfter = end.date > start.date || (end.date === start.date && end.minutes > start.minutes)
  if (!endsAfter) {
    actionError.value = '结束时间必须晚于开始时间'
    return
  }
  if (start.minutes < open || start.minutes >= close || end.minutes < open || end.minutes > close) {
    actionError.value = `请假须在 ${formatClockFromMinutes(open)}–${formatClockFromMinutes(close)} 内`
    return
  }
  const next = {
    date: start.date,
    endDate: end.date,
    startMinutes: start.minutes,
    endMinutes: end.minutes,
  }
  if (formLeaves.value.some((leave) => leaveRangesOverlap(leave, next))) {
    actionError.value = '请假时段不能重叠'
    return
  }
  if (editingId.value && leaveOverlapsBooking(next, bookings.value, editingId.value)) {
    actionError.value = '该时段已有预约，不能请假'
    return
  }
  formLeaves.value = formLeaves.value.concat(next)
  leaveStartAt.value = ''
  leaveEndAt.value = ''
}

/**
 * 去掉一条请假。
 * @param {number} index
 */
function removeLeave(index) {
  formLeaves.value = formLeaves.value.filter((_, i) => i !== index)
}

/** 提交新增或保存。 */
async function onSubmit() {
  actionError.value = ''
  saving.value = true
  const payload = {
    name: formName.value.trim(),
    serviceIds: [...formServiceIds.value],
    leaves: formLeaves.value.map((leave) => ({
      id: leave.id,
      date: leave.date,
      endDate: leave.endDate || leave.date,
      startMinutes: leave.startMinutes,
      endMinutes: leave.endMinutes,
    })),
  }
  try {
    if (editingId.value) {
      await updateEmployee(editingId.value, payload)
    } else {
      await createEmployee(payload)
    }
    await loadPage()
    startCreate()
    ElMessage.success('已保存')
  } catch (error) {
    actionError.value = error.message || '保存失败'
  } finally {
    saving.value = false
  }
}

/**
 * 删除当前正在编辑的员工。可做项目和请假一并去掉，已有预约仍保留当时姓名。
 */
async function onDelete() {
  if (!editingId.value) return
  try {
    await ElMessageBox.confirm('删除后看板和下拉不再显示该员工，已有预约仍保留当时姓名。', '删除员工', {
      type: 'warning',
    })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }
  actionError.value = ''
  saving.value = true
  try {
    await deleteEmployee(editingId.value)
    await loadPage()
    startCreate()
    ElMessage.success('已删除')
  } catch (error) {
    actionError.value = error.message || '删除失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadPage()
  startCreate()
})

onUnmounted(() => {
  document.removeEventListener('mouseup', keepLeaveClock)
})
</script>

<template>
  <div class="employee-manage">
    <h2 class="employee-manage-title">员工管理</h2>
    <p class="employee-manage-hint">
      为员工配置可做项目，并按营业时间内的时段请假。已有预约的时段不能请假，请假重叠的格子不计入容量。删除员工后，已有预约仍保留当时姓名。
    </p>

    <el-skeleton v-if="loading" :rows="4" animated />
    <el-alert v-else-if="loadError" :title="loadError" type="error" :closable="false" show-icon />

    <div v-else class="employee-manage-body">
      <el-menu class="employee-manage-list" :default-active="editingId">
        <el-menu-item v-if="!employees.length" index="empty" disabled>暂无员工</el-menu-item>
        <el-menu-item v-for="item in employees" :key="item.id" :index="item.id" @click="startEdit(item)">
          <span>
            <strong>{{ item.name }}</strong>
            <em :class="presenceClass(item)">{{ presenceText(item) }}</em>
            <em>{{ projectNames(item) }}</em>
          </span>
        </el-menu-item>
      </el-menu>

      <el-card class="employee-manage-form" shadow="never">
        <h3>{{ editingId ? '编辑员工' : '新增员工' }}</h3>
        <el-form label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="姓名">
            <el-input v-model="formName" />
          </el-form-item>
          <el-form-item label="可做项目">
            <el-checkbox-group v-model="formServiceIds">
              <el-checkbox v-for="item in services" :key="item.id" :value="item.id">
                {{ item.name }}
              </el-checkbox>
            </el-checkbox-group>
            <p v-if="!services.length" class="employee-manage-empty">请先在项目管理中添加项目</p>
          </el-form-item>
          <el-form-item label="请假">
            <p v-if="!formLeaves.length" class="employee-manage-empty">未设置，默认各时段可约</p>
            <!-- 已加入、保存时一并提交 -->
            <div v-else class="employee-manage-leaves">
              <div
                v-for="(leave, index) in formLeaves"
                :key="`${leave.date}-${leave.startMinutes}-${index}`"
                class="employee-manage-leave-row"
              >
                <span>
                  {{ leave.date }} {{ formatClockFromMinutes(leave.startMinutes) }}
                  –
                  {{ leave.endDate || leave.date }} {{ formatClockFromMinutes(leave.endMinutes) }}
                </span>
                <el-button link type="danger" @click="removeLeave(index)">移除</el-button>
              </div>
            </div>
            <!-- 开始、结束各一个框；点开后日历和时分在同一个面板 -->
            <div class="employee-manage-leave-add">
              <el-date-picker
                v-model="leaveStartAt"
                type="datetime"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DD HH:mm"
                placeholder="开始时间"
                popper-class="employee-manage-leave-popper"
                :automatic-dropdown="false"
                :editable="false"
                :disabled-date="disabledLeaveDate"
                :disabled-hours="disabledStartHours"
                :disabled-minutes="disabledStartMinutes"
                @visible-change="openLeaveClock"
              />
              <el-date-picker
                v-model="leaveEndAt"
                type="datetime"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DD HH:mm"
                placeholder="结束时间"
                popper-class="employee-manage-leave-popper"
                :automatic-dropdown="false"
                :editable="false"
                :disabled-date="disabledLeaveDate"
                :disabled-hours="disabledEndHours"
                :disabled-minutes="disabledEndMinutes"
                @visible-change="openLeaveClock"
              />
              <el-button @click="addLeave">加入</el-button>
            </div>
          </el-form-item>
          <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
          <div class="employee-manage-actions">
            <el-button type="primary" native-type="submit" :loading="saving">
              {{ editingId ? '保存修改' : '添加员工' }}
            </el-button>
            <el-button v-if="editingId" @click="startCreate">改为新增</el-button>
            <!-- 只有正在编辑已有员工时才能删，新增表单不出现 -->
            <el-button v-if="editingId" type="danger" :loading="saving" @click="onDelete">删除员工</el-button>
          </div>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
/* 员工管理：左侧列表 + 右侧表单 */
.employee-manage-title {
  margin: 0 0 8px;
  font-size: 20px;
}

.employee-manage-hint {
  margin: 0 0 16px;
  color: #616e7c;
  font-size: 13px;
}

.employee-manage-empty {
  margin: 0;
  color: #7b8794;
  font-size: 13px;
}

.employee-manage-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.employee-manage-list {
  width: 280px;
  flex-shrink: 0;
  overflow: hidden;
  border-right: none;
}

/* 菜单项默认 56px 行高，会把姓名顶出格子；改为随摘要行撑开 */
.employee-manage-list :deep(.el-menu-item) {
  height: auto;
  line-height: 1.4;
  /* 组件默认不换行，长姓名会撑出列宽盖住表单 */
  white-space: normal !important;
  overflow: hidden;
  align-items: flex-start;
  padding: 10px 16px;
}

/* 长姓名默认把格子撑宽，会盖住右侧表单；限制在列宽内换行 */
.employee-manage-list :deep(.el-menu-item span) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
}

/* 选中的员工用底色标出，只改字色不够明显 */
.employee-manage-list :deep(.el-menu-item.is-active) {
  background: #e7eef5;
}

.employee-manage-list strong {
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.employee-manage-list em {
  display: block;
  font-style: normal;
  font-size: 12px;
  line-height: 1.4;
  color: #7b8794;
  overflow-wrap: anywhere;
}

/* 当前状态：请假、在忙、空闲 */
.employee-manage-list em.is-leave {
  color: #9b1c1c;
}

.employee-manage-list em.is-busy {
  color: #ad6800;
}

.employee-manage-list em.is-free {
  color: #0e7c3a;
}

.employee-manage-form {
  flex: 1;
  max-width: 640px;
}

.employee-manage-form h3 {
  margin: 0 0 12px;
  font-size: 15px;
}

.employee-manage-leaves {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.employee-manage-leave-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.employee-manage-leave-add {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.employee-manage-leave-add :deep(.el-date-editor) {
  width: 200px;
}

/* 日历在左、时分在右；弹层宽度跟着两列走，避免时分被裁掉 */
:global(.employee-manage-leave-popper .el-date-picker) {
  width: max-content;
}

:global(.employee-manage-leave-popper .el-picker-panel__body) {
  display: grid;
  grid-template-columns: auto auto;
}

:global(.employee-manage-leave-popper .el-date-picker__header) {
  grid-column: 1;
  grid-row: 1;
}

:global(.employee-manage-leave-popper .el-picker-panel__content) {
  grid-column: 1;
  grid-row: 2;
}

:global(.employee-manage-leave-popper .el-date-picker__time-header) {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: stretch;
  border-bottom: none;
  padding: 0;
  margin: 0;
}

:global(.employee-manage-leave-popper .el-date-picker__editor-wrap:first-child) {
  display: none;
}

:global(.employee-manage-leave-popper .el-date-picker__editor-wrap:last-child .el-input) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

:global(.employee-manage-leave-popper .el-time-panel) {
  position: static;
  margin: 0;
  box-shadow: none;
  border: none;
  border-left: 1px solid var(--el-datepicker-inner-border-color, #e4e7ed);
}

:global(.employee-manage-leave-popper .el-time-panel__footer) {
  display: none;
}

.employee-manage-actions {
  display: flex;
  gap: 8px;
}
</style>
