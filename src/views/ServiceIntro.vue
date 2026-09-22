<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getServices } from '@/api/services'

const route = useRoute()
const router = useRouter()

/** 服务列表 */
const services = ref([])
const loading = ref(false)
const loadError = ref('')
/** 顾客介绍页可带项目进向导；后台介绍页只展示 */
const canQuickBook = computed(() => route.path === '/book')

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

/**
 * 跳到预约向导并预选该项目。
 * @param {string} id
 */
function goBook(id) {
  router.push({ path: '/book/schedule', query: { service: id } })
}

onMounted(loadServices)
</script>

<template>
  <div class="service-intro">
    <h2 class="service-intro-title">项目介绍</h2>
    <p class="service-intro-hint">
      {{ canQuickBook ? '点击预约后选择日期与员工。' : '以下为当前可预约的服务项目。' }}
    </p>
    <el-skeleton v-if="loading" :rows="3" animated />
    <el-alert v-else-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
    <el-empty v-else-if="!services.length" description="暂无服务，请管理员在项目管理中添加。" />
    <el-row v-else :gutter="16">
      <el-col v-for="item in services" :key="item.id" :xs="24" :sm="12" :md="8">
        <el-card class="service-intro-card" shadow="never">
          <h3>{{ item.name }}</h3>
          <p class="service-intro-meta">
            价格：¥{{ item.price }} ｜ 时长：{{ durationText(item.durationHours) }}
          </p>
          <p class="service-intro-desc">{{ item.description }}</p>
          <!-- 顾客端：带上该项目进入向导选日期 -->
          <el-button
            v-if="canQuickBook"
            class="service-intro-book"
            type="primary"
            @click="goBook(item.id)"
          >
            预约
          </el-button>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
/* 项目介绍：服务卡片列表 */
.service-intro-title {
  margin: 0 0 8px;
  font-size: 20px;
}

.service-intro-hint {
  margin: 0 0 16px;
  color: #616e7c;
  font-size: 13px;
}

.service-intro-card {
  margin-bottom: 16px;
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

.service-intro-book {
  margin-top: 12px;
}
</style>
