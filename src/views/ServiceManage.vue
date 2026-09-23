<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
    ElMessage.success('已保存')
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
  try {
    await ElMessageBox.confirm('删除后介绍页和下拉不再显示该项目，已有预约仍保留当时名称。', '删除项目', {
      type: 'warning',
    })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }
  actionError.value = ''
  saving.value = true
  try {
    await deleteService(editingId.value)
    await loadServices()
    startCreate()
    ElMessage.success('已删除')
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
    <p class="service-manage-hint">可新增、修改或删除服务；时长须为当前时间格的整数倍。变更会同步到项目介绍与预约。已产生的预约记录仍保留当时的项目名称。</p>

    <el-skeleton v-if="loading" :rows="4" animated />
    <el-alert v-else-if="loadError" :title="loadError" type="error" :closable="false" show-icon />

    <div v-else class="service-manage-body">
      <el-menu class="service-manage-list" :default-active="editingId">
        <el-menu-item v-if="!services.length" index="empty" disabled>暂无服务</el-menu-item>
        <el-menu-item v-for="item in services" :key="item.id" :index="item.id" @click="startEdit(item)">
          <span>
            <strong>{{ item.name }}</strong>
            <em>¥{{ item.price }} · {{ durationText(item.durationHours) }}</em>
          </span>
        </el-menu-item>
      </el-menu>

      <el-card class="service-manage-form" shadow="never">
        <h3>{{ editingId ? '编辑服务' : '新增服务' }}</h3>
        <el-form label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="名称">
            <el-input v-model="formName" />
          </el-form-item>
          <el-form-item label="价格（元）">
            <el-input-number v-model="formPrice" :min="0" :step="1" />
          </el-form-item>
          <el-form-item label="时长（小时，最低 0.5，步进 0.5）">
            <el-input-number v-model="formDuration" :min="0.5" :step="0.5" />
          </el-form-item>
          <el-form-item label="简单介绍">
            <el-input v-model="formDescription" type="textarea" :rows="3" />
          </el-form-item>
          <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
          <div class="service-manage-actions">
            <el-button type="primary" native-type="submit" :loading="saving">
              {{ editingId ? '保存修改' : '添加服务' }}
            </el-button>
            <el-button v-if="editingId" @click="startCreate">改为新增</el-button>
            <el-button v-if="editingId" type="danger" :loading="saving" @click="onDelete">删除项目</el-button>
          </div>
        </el-form>
      </el-card>
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

.service-manage-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.service-manage-list {
  width: 260px;
  flex-shrink: 0;
  overflow: hidden;
  border-right: none;
}

/* 菜单项默认 56px 行高，会把名称顶出格子；改为随两行文案撑开 */
.service-manage-list :deep(.el-menu-item) {
  height: auto;
  line-height: 1.4;
  /* 组件默认不换行，长名称会撑出列宽盖住表单 */
  white-space: normal !important;
  overflow: hidden;
  align-items: flex-start;
  padding: 10px 16px;
}

/* 长名称默认把格子撑宽，会盖住右侧表单；限制在列宽内换行 */
.service-manage-list :deep(.el-menu-item span) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
}

/* 选中的项目用底色标出，只改字色不够明显 */
.service-manage-list :deep(.el-menu-item.is-active) {
  background: #e7eef5;
}

.service-manage-list strong {
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.service-manage-list em {
  display: block;
  font-style: normal;
  font-size: 12px;
  line-height: 1.4;
  color: #7b8794;
  overflow-wrap: anywhere;
}

.service-manage-form {
  flex: 1;
  max-width: 420px;
}

.service-manage-form h3 {
  margin: 0 0 12px;
  font-size: 15px;
}

.service-manage-actions {
  display: flex;
  gap: 8px;
}
</style>
