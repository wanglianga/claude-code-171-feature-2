<template>
  <div>
    <el-alert
      v-if="canViewRisks && overview.openDefectAlerts > 0"
      type="error" show-icon :closable="false" style="margin-bottom: 12px"
      @click="$router.push('/defect-alerts')"
    >
      <template #title>
        <span style="cursor: pointer; font-weight: 600">
          有 {{ overview.openDefectAlerts }} 条坏果率异常预警：同批次剩余库存已冻结，请客服优先跟进同城/同线/同包装用户、质检尽快复盘定责 →
        </span>
      </template>
    </el-alert>
    <el-row :gutter="14">
      <el-col :span="4" v-for="c in cards" :key="c.label">
        <el-card shadow="hover" class="kpi">
          <div class="kpi-icon" :style="{ background: c.color }"><el-icon :size="22"><component :is="c.icon" /></el-icon></div>
          <div>
            <div class="kpi-num">{{ c.value }}</div>
            <div class="kpi-label">{{ c.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="14" style="margin-top: 14px">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-head">
              <span>开放中的链路风险</span>
              <el-button v-if="canViewRisks" link type="primary" @click="$router.push('/risks')">进入风险中心</el-button>
            </div>
          </template>
          <el-table :data="risks" size="small" max-height="330">
            <el-table-column label="级别" width="80">
              <template #default="{ row }">
                <el-tag :type="row.level === 'critical' ? 'danger' : row.level === 'warning' ? 'warning' : 'info'" size="small">
                  {{ row.level === 'critical' ? '严重' : row.level === 'warning' ? '预警' : '提示' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="150">
              <template #default="{ row }">{{ riskTypes[row.type] || row.type }}</template>
            </el-table-column>
            <el-table-column prop="message" label="内容" show-overflow-tooltip />
            <el-table-column label="批次" width="90">
              <template #default="{ row }">
                <el-button v-if="row.batchId" link type="primary" size="small" @click="$router.push(`/chain/${row.batchId}`)">链路</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!risks.length" description="暂无开放风险" :image-size="60" />
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header><span>进行中的直播</span></template>
          <div v-for="l in liveList" :key="l.id" class="live-item">
            <div>
              <div class="live-title">{{ l.title }}</div>
              <div class="live-sub">{{ l.anchorName }} · 销量 {{ l.actualSales }}/{{ l.estimatedSales }}</div>
            </div>
            <el-tag :type="l.status === 'live' ? 'danger' : 'info'" size="small">{{ statusText(l.status) }}</el-tag>
          </div>
          <el-empty v-if="!liveList.length" description="暂无进行中直播" :image-size="60" />
        </el-card>
        <el-card shadow="never" style="margin-top: 14px">
          <template #header><span>批次链路速查</span></template>
          <el-select v-model="chainBatch" placeholder="选择批次查看全链路" style="width: 100%" @change="goChain">
            <el-option v-for="b in batches" :key="b.id" :value="b.id" :label="`${b.batchNo} · ${b.product?.name || ''}`" />
          </el-select>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const overview = ref({});
const risks = ref([]);
const riskTypes = ref({});
const liveList = ref([]);
const batches = ref([]);
const chainBatch = ref(null);

const canViewRisks = computed(() => ['admin', 'operator', 'warehouse', 'aftersales'].includes(auth.role));

const cards = computed(() => [
  { label: '商品总数', value: overview.value.productCount ?? '-', icon: 'Goods', color: '#67c23a' },
  { label: '供货批次', value: overview.value.batchCount ?? '-', icon: 'Box', color: '#409eff' },
  { label: '直播中', value: overview.value.liveCount ?? '-', icon: 'VideoCamera', color: '#f56c6c' },
  { label: '订单 / GMV', value: overview.value.orderCount != null ? `${overview.value.orderCount} / ¥${overview.value.gmv}` : '-', icon: 'Tickets', color: '#e6a23c' },
  { label: '待发货', value: overview.value.pendingTasks ?? '-', icon: 'Van', color: '#909399' },
  { label: '开放风险', value: overview.value.openRisks ?? '-', icon: 'Warning', color: '#f78989' },
]);

function statusText(s) {
  return { planned: '已排期', locked: '已锁库', live: '直播中', ended: '已结束', cancelled: '已取消' }[s] || s;
}

function goChain(id) {
  if (id) router.push(`/chain/${id}`);
}

onMounted(async () => {
  overview.value = await request.get('/analytics/overview');
  if (canViewRisks.value) {
    risks.value = await request.get('/risks', { params: { status: 'open' } });
    riskTypes.value = await request.get('/risks/types');
  }
  if (['admin', 'operator'].includes(auth.role)) {
    liveList.value = (await request.get('/livestreams')).filter((l) => ['live', 'locked', 'planned'].includes(l.status)).slice(0, 5);
  }
  batches.value = await request.get('/batches');
});
</script>

<style scoped>
.kpi { display: flex; align-items: center; }
.kpi :deep(.el-card__body) { display: flex; align-items: center; gap: 12px; padding: 16px; }
.kpi-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; }
.kpi-num { font-size: 18px; font-weight: 700; color: #303133; }
.kpi-label { font-size: 12px; color: #909399; margin-top: 2px; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.live-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f0f2f5; }
.live-item:last-child { border-bottom: none; }
.live-title { font-weight: 600; font-size: 14px; }
.live-sub { font-size: 12px; color: #909399; margin-top: 2px; }
</style>
