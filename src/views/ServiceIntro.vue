<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getServices } from '@/api/services'
import { formatDurationText } from '@/utils/schedule'
import { serviceCover } from '@/utils/serviceCover'
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
        <div
          class="service-intro-cover"
          :style="{
            '--cover-accent': serviceCover(item.id).accent,
            '--cover-wash': serviceCover(item.id).wash,
          }"
        >
          <img
            v-if="item.imageUrl && !brokenImages[item.id]"
            :src="item.imageUrl"
            alt=""
            referrerpolicy="no-referrer"
            @error="onImageError(item.id)"
          />
          <span v-else class="service-intro-placeholder" aria-hidden="true">
            <svg v-if="serviceCover(item.id).mark === 'bars'" viewBox="0 0 48 48" fill="none">
              <path d="M12 16h24M12 24h16M12 32h20" />
            </svg>
            <svg v-else-if="serviceCover(item.id).mark === 'ring'" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="11" />
              <circle cx="24" cy="24" r="3.5" />
            </svg>
            <svg v-else-if="serviceCover(item.id).mark === 'diamond'" viewBox="0 0 48 48" fill="none">
              <path d="M24 10l12 14-12 14L12 24z" />
            </svg>
            <svg v-else viewBox="0 0 48 48" fill="none">
              <path d="M14 14h20v20H14zM14 24h20M24 14v20" />
            </svg>
          </span>
        </div>
        <div class="service-intro-body">
          <h3>{{ item.name }}</h3>
          <p class="service-intro-price">¥{{ item.price }}</p>
          <p class="service-intro-duration">时长 {{ formatDurationText(item.durationHours) }}</p>
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
/* 项目介绍：封面按项目换标记和色块，价格单独成行。 */
.desk-catalog {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 16px;
  width: 100%;
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
  background: linear-gradient(
    160deg,
    var(--cover-wash, #d7e4e2),
    color-mix(in srgb, var(--cover-accent, var(--color-primary)) 22%, var(--cover-wash, #d7e4e2))
  );
  color: var(--cover-accent, var(--color-primary));
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
  gap: 6px;
  padding: 16px 16px 8px;
}

.service-intro-body h3 {
  font-size: 20px;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.service-intro-price {
  margin: 4px 0 0;
  font-size: 26px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--color-text);
}

.service-intro-duration {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.service-intro-desc {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.55;
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
