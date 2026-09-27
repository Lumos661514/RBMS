<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getServices } from '@/api/services'
import { formatDurationText } from '@/utils/schedule'
import { serviceDescriptionText } from '@/utils/serviceText'

const router = useRouter()

/** 服务列表 */
const services = ref([])
const loading = ref(false)
const loadError = ref('')
/** 图片加载失败的项目 id，改显示占位 */
const brokenImages = ref({})

/** 拉取全部服务供展示。 */
async function loadServices() {
  loading.value = true
  loadError.value = ''
  brokenImages.value = {}
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

/**
 * 图片打不开时改占位，避免裂图。
 * @param {string} id
 */
function onImageError(id) {
  brokenImages.value = { ...brokenImages.value, [id]: true }
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
        <div class="service-intro-cover">
          <img
            v-if="item.imageUrl && !brokenImages[item.id]"
            :src="item.imageUrl"
            alt=""
            referrerpolicy="no-referrer"
            @error="onImageError(item.id)"
          />
          <span v-else class="service-intro-placeholder" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <rect x="8" y="12" width="32" height="26" rx="2" />
              <path d="M8 20h32" />
              <path d="M16 12V8M32 12V8" />
              <circle cx="24" cy="30" r="4" />
            </svg>
          </span>
        </div>
        <div class="service-intro-body">
          <h3>{{ item.name }}</h3>
          <p class="service-intro-meta">
            <span class="service-intro-price">¥{{ item.price }}</span>
            <span>时长 {{ formatDurationText(item.durationHours) }}</span>
          </p>
          <p v-if="serviceDescriptionText(item.description)" class="service-intro-desc">
            {{ serviceDescriptionText(item.description) }}
          </p>
        </div>
        <el-button class="service-intro-book" type="primary" @click="goBook(item.id)">
          预约
        </el-button>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* 项目介绍：账本格网。封面在上，没有图时用同一套线标占位。 */
.desk-catalog {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 16px;
  max-width: 1080px;
}

.desk-catalog-item {
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.service-intro-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 148px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  color: var(--color-primary);
}

.service-intro-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.service-intro-placeholder {
  display: flex;
}

.service-intro-placeholder svg {
  width: 48px;
  height: 48px;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.service-intro-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 8px;
}

.service-intro-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.service-intro-price {
  font-weight: 600;
  color: var(--color-primary);
}

.service-intro-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}

.service-intro-book {
  align-self: flex-start;
  margin: 8px 16px 16px;
}

@media (max-width: 720px) {
  .service-intro-book {
    align-self: stretch;
  }
}
</style>
