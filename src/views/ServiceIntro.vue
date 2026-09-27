<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getServices } from '@/api/services'

const router = useRouter()

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
    <h2 class="page-title">项目介绍</h2>
    <p class="page-hint">点击预约后选择日期与员工。</p>
    <el-skeleton v-if="loading" :rows="3" animated />
    <div v-else-if="loadError" class="page-load-error">
      <el-alert :title="loadError" type="error" :closable="false" show-icon />
      <el-button type="primary" @click="loadServices">重试</el-button>
    </div>
    <el-empty v-else-if="!services.length" description="暂无服务，请管理员在项目管理中添加。" />
    <div v-else class="desk-catalog">
      <article v-for="item in services" :key="item.id" class="desk-catalog-item">
        <h3>{{ item.name }}</h3>
        <p class="service-intro-meta">
          价格：¥{{ item.price }} ｜ 时长：{{ durationText(item.durationHours) }}
        </p>
        <p class="service-intro-desc">{{ item.description }}</p>
        <!-- 带上该项目进入向导选日期 -->
        <el-button class="service-intro-book" type="primary" @click="goBook(item.id)">
          预约
        </el-button>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* 项目介绍：账本格网，不用 el-card 套壳 */
.service-intro-meta {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.service-intro-desc {
  margin: 0;
  flex: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}

.service-intro-book {
  align-self: flex-start;
  margin-top: 4px;
}
</style>
