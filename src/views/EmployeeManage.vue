<script setup>
import { onMounted, ref } from 'vue'
import { createEmployee, getEmployees, updateEmployee } from '@/api/employees'
import { getServices } from '@/api/services'

/** 员工列表 */
const employees = ref([])
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

/** 同时拉员工与项目。 */
async function loadPage() {
  loading.value = true
  loadError.value = ''
  try {
    const [empData, serviceData] = await Promise.all([getEmployees(), getServices()])
    employees.value = empData.list || []
    services.value = serviceData.list || []
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
  actionError.value = ''
}

/**
 * 填表进入编辑。
 * @param {{ id: string, name: string, serviceIds: string[] }} item
 */
function startEdit(item) {
  editingId.value = item.id
  formName.value = item.name
  formServiceIds.value = [...(item.serviceIds || [])]
  actionError.value = ''
}

/**
 * 勾选/取消某个可做项目。
 * @param {string} serviceId
 * @param {boolean} checked
 */
function toggleService(serviceId, checked) {
  if (checked) {
    if (!formServiceIds.value.includes(serviceId)) {
      formServiceIds.value = formServiceIds.value.concat(serviceId)
    }
    return
  }
  formServiceIds.value = formServiceIds.value.filter((id) => id !== serviceId)
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

/** 提交新增或保存。 */
async function onSubmit() {
  actionError.value = ''
  saving.value = true
  const payload = {
    name: formName.value.trim(),
    serviceIds: [...formServiceIds.value],
  }
  try {
    if (editingId.value) {
      await updateEmployee(editingId.value, payload)
    } else {
      await createEmployee(payload)
    }
    await loadPage()
    startCreate()
  } catch (error) {
    actionError.value = error.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadPage()
  startCreate()
})
</script>

<template>
  <div class="employee-manage">
    <h2 class="employee-manage-title">员工管理</h2>
    <p class="employee-manage-hint">为员工配置可做项目；预约时只能选对应项目且该时段空闲的员工。</p>

    <p v-if="loading">加载中…</p>
    <p v-else-if="loadError" class="employee-manage-error">{{ loadError }}</p>

    <div v-else class="employee-manage-body">
      <ul class="employee-manage-list">
        <li v-if="!employees.length" class="employee-manage-empty">暂无员工</li>
        <li
          v-for="item in employees"
          :key="item.id"
          class="employee-manage-item"
          :class="{ 'is-active': editingId === item.id }"
        >
          <button type="button" @click="startEdit(item)">
            <strong>{{ item.name }}</strong>
            <span>{{ projectNames(item) }}</span>
          </button>
        </li>
      </ul>

      <form class="employee-manage-form" @submit.prevent="onSubmit">
        <h3>{{ editingId ? '编辑员工' : '新增员工' }}</h3>
        <label>
          姓名
          <input v-model="formName" type="text" required />
        </label>
        <fieldset class="employee-manage-projects">
          <legend>可做项目</legend>
          <p v-if="!services.length" class="employee-manage-empty">请先在项目管理中添加项目</p>
          <label v-for="item in services" :key="item.id" class="employee-manage-check">
            <input
              type="checkbox"
              :checked="formServiceIds.includes(item.id)"
              @change="toggleService(item.id, $event.target.checked)"
            />
            {{ item.name }}
          </label>
        </fieldset>
        <p v-if="actionError" class="employee-manage-error">{{ actionError }}</p>
        <div class="employee-manage-actions">
          <button type="submit" :disabled="saving">
            {{ saving ? '保存中…' : editingId ? '保存修改' : '添加员工' }}
          </button>
          <button
            v-if="editingId"
            type="button"
            class="employee-manage-ghost"
            @click="startCreate"
          >
            改为新增
          </button>
        </div>
      </form>
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

.employee-manage-error {
  color: #c81e1e;
  font-size: 13px;
}

.employee-manage-empty {
  color: #7b8794;
  font-size: 13px;
  padding: 10px 12px;
}

.employee-manage-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.employee-manage-list {
  margin: 0;
  padding: 0;
  list-style: none;
  width: 280px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.employee-manage-item button {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 0;
  background: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.employee-manage-item button span {
  font-size: 12px;
  color: #7b8794;
}

.employee-manage-item.is-active button {
  background: #e6f2ff;
  color: #1f4e79;
}

.employee-manage-form {
  flex: 1;
  max-width: 420px;
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.employee-manage-form h3 {
  margin: 0;
  font-size: 15px;
}

.employee-manage-form > label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #52606d;
}

.employee-manage-form input[type='text'] {
  padding: 8px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
  font: inherit;
}

.employee-manage-projects {
  border: 1px solid #e4e7eb;
  border-radius: 4px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.employee-manage-check {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
  font-size: 13px;
  color: #52606d;
}

.employee-manage-actions {
  display: flex;
  gap: 8px;
}

.employee-manage-actions button {
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  background: #1f4e79;
  color: #fff;
  cursor: pointer;
}

.employee-manage-ghost {
  background: #e4e7eb !important;
  color: #1f2933 !important;
}
</style>
