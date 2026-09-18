<script setup>
import { onMounted, ref } from 'vue'
import { getServices } from '@/api/services'

/** 服务列表 */
const services = ref([])
const loading = ref(false)
const loadError = ref('')

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

/** 拉取全部服务供展示。 */
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

onMounted(loadServices)
</script>

<template>
  <div class="service-intro">
    <h2 class="service-intro-title">项目介绍</h2>
    <p class="service-intro-hint">以下为当前可预约的服务项目。</p>
    <p v-if="loading">加载中…</p>
    <p v-else-if="loadError" class="service-intro-error">{{ loadError }}</p>
    <p v-else-if="!services.length" class="service-intro-empty">暂无服务，请管理员在项目管理中添加。</p>
    <ul v-else class="service-intro-list">
      <li v-for="item in services" :key="item.id" class="service-intro-card">
        <h3>{{ item.name }}</h3>
        <p class="service-intro-meta">
          价格：¥{{ item.price }} ｜ 时长：{{ durationText(item.durationHours) }}
        </p>
        <p class="service-intro-desc">{{ item.description }}</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 项目介绍：服务卡片列表 */
.service-intro-title {
  margin: 0 0 8px;
  font-size: 20px;
}

.service-intro-hint,
.service-intro-empty {
  margin: 0 0 16px;
  color: #616e7c;
  font-size: 13px;
}

.service-intro-error {
  color: #c81e1e;
}

.service-intro-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.service-intro-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 18px;
  border: 1px solid #e4e7eb;
}

.service-intro-card h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: #1f4e79;
}

.service-intro-meta {
  margin: 0 0 8px;
  font-size: 13px;
  color: #52606d;
}

.service-intro-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #3e4c59;
}
</style>
