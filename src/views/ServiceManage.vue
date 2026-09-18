<script setup>
import { onMounted, ref } from 'vue'
import { createService, deleteService, getServices, updateService } from '@/api/services'

/** 服务列表 */
const services = ref([])
const loading = ref(false)
const loadError = ref('')
const actionError = ref('')
const saving = ref(false)

/** 当前编辑中的服务 id；空字符串表示新增模式 */
const editingId = ref('')
/** 表单：名称 */
const formName = ref('')
/** 表单：价格 */
const formPrice = ref(0)
/** 表单：时长（小时） */
const formDuration = ref(0.5)
/** 表单：简介 */
const formDescription = ref('')

/**
 * 时长展示：支持半小时。
 * @param {number} hours
 */
function durationText(hours) {
  const minutes = Math.round(Number(hours) * 60)
  if (minutes % 60 === 0) return `${minutes / 60} 小时`
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

/** 拉取服务列表。 */
async function loadServices() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await getServices()
    services.value = data.list || []
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
  formPrice.value = 0
  formDuration.value = 0.5
  formDescription.value = ''
  actionError.value = ''
}

/**
 * 把某条服务填进表单进入编辑。
 * @param {{ id: string, name: string, price: number, durationHours: number, description: string }} item
 */
function startEdit(item) {
  editingId.value = item.id
  formName.value = item.name
  formPrice.value = item.price
  formDuration.value = item.durationHours
  formDescription.value = item.description
  actionError.value = ''
}

/** 提交新增或保存修改。 */
async function onSubmit() {
  actionError.value = ''
  saving.value = true
  const payload = {
    name: formName.value.trim(),
    price: Number(formPrice.value),
    durationHours: Number(formDuration.value),
    description: formDescription.value.trim(),
  }
  try {
    if (editingId.value) {
      await updateService(editingId.value, payload)
    } else {
      await createService(payload)
    }
    await loadServices()
    startCreate()
  } catch (error) {
    actionError.value = error.message || '保存失败'
  } finally {
    saving.value = false
  }
}

/**
 * 删除当前正在编辑的项目；已有预约记录仍保留当时名称。
 */
async function onDelete() {
  if (!editingId.value) return
  actionError.value = ''
  saving.value = true
  try {
    await deleteService(editingId.value)
    await loadServices()
    startCreate()
  } catch (error) {
    actionError.value = error.message || '删除失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadServices()
  startCreate()
})
</script>

<template>
  <div class="service-manage">
    <h2 class="service-manage-title">项目管理</h2>
    <p class="service-manage-hint">可新增、修改或删除服务；变更会同步到项目介绍与预约下拉。已产生的预约记录仍保留当时的项目名称。</p>

    <p v-if="loading">加载中…</p>
    <p v-else-if="loadError" class="service-manage-error">{{ loadError }}</p>

    <div v-else class="service-manage-body">
      <ul class="service-manage-list">
        <li v-if="!services.length" class="service-manage-empty">暂无服务</li>
        <li
          v-for="item in services"
          :key="item.id"
          class="service-manage-item"
          :class="{ 'is-active': editingId === item.id }"
        >
          <button type="button" @click="startEdit(item)">
            <strong>{{ item.name }}</strong>
            <span>¥{{ item.price }} · {{ durationText(item.durationHours) }}</span>
          </button>
        </li>
      </ul>

      <form class="service-manage-form" @submit.prevent="onSubmit">
        <h3>{{ editingId ? '编辑服务' : '新增服务' }}</h3>
        <label>
          名称
          <input v-model="formName" type="text" required />
        </label>
        <label>
          价格（元）
          <input v-model.number="formPrice" type="number" min="0" step="1" required />
        </label>
        <label>
          时长（小时，最低 0.5，步进 0.5）
          <input v-model.number="formDuration" type="number" min="0.5" step="0.5" required />
        </label>
        <label>
          简单介绍
          <textarea v-model="formDescription" rows="3" required />
        </label>
        <p v-if="actionError" class="service-manage-error">{{ actionError }}</p>
        <div class="service-manage-actions">
          <button type="submit" :disabled="saving">
            {{ saving ? '保存中…' : editingId ? '保存修改' : '添加服务' }}
          </button>
          <button v-if="editingId" type="button" class="service-manage-ghost" @click="startCreate">
            改为新增
          </button>
          <button
            v-if="editingId"
            type="button"
            class="service-manage-danger"
            :disabled="saving"
            @click="onDelete"
          >
            删除项目
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* 项目管理：左侧列表 + 右侧表单 */
.service-manage-title {
  margin: 0 0 8px;
  font-size: 20px;
}

.service-manage-hint {
  margin: 0 0 16px;
  color: #616e7c;
  font-size: 13px;
}

.service-manage-error {
  color: #c81e1e;
  font-size: 13px;
}

.service-manage-empty {
  color: #7b8794;
  font-size: 13px;
  padding: 10px 12px;
}

.service-manage-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.service-manage-list {
  margin: 0;
  padding: 0;
  list-style: none;
  width: 260px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.service-manage-item button {
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

.service-manage-item button span {
  font-size: 12px;
  color: #7b8794;
}

.service-manage-item.is-active button {
  background: #e6f2ff;
  color: #1f4e79;
}

.service-manage-form {
  flex: 1;
  max-width: 420px;
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.service-manage-form h3 {
  margin: 0;
  font-size: 15px;
}

.service-manage-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #52606d;
}

.service-manage-form input,
.service-manage-form textarea {
  padding: 8px;
  border: 1px solid #cbd2d9;
  border-radius: 4px;
  font: inherit;
}

.service-manage-actions {
  display: flex;
  gap: 8px;
}

.service-manage-actions button {
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  background: #1f4e79;
  color: #fff;
  cursor: pointer;
}

.service-manage-ghost {
  background: #e4e7eb !important;
  color: #1f2933 !important;
}

.service-manage-danger {
  background: #c81e1e !important;
}
</style>
