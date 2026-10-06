<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>农户结算单{{ isFarmer ? '（我的结算）' : '' }}</span>
          <el-tag v-if="!isFarmer" type="info" size="small">按 直播场次 × 批次 汇总：供货价 × 销量 − 售后扣减</el-tag>
        </div>
      </template>
      <el-table :data="list" size="small" v-loading="loading">
        <el-table-column prop="id" label="单号" width="70">
          <template #default="{ row }">#{{ row.id }}</template>
        </el-table-column>
        <el-table-column label="农户" width="130">
          <template #default="{ row }">{{ farmerMap[row.farmerId] || row.farmerId }}</template>
        </el-table-column>
        <el-table-column label="批次" width="170">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="$router.push(`/chain/${row.batchId}`)">{{ batchMap[row.batchId] || row.batchId }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="场次" min-width="140">
          <template #default="{ row }">{{ liveMap[row.livestreamId]?.title || row.livestreamId }}</template>
        </el-table-column>
        <el-table-column prop="orderCount" label="订单数" width="80" />
        <el-table-column label="应收(供货价)" width="110">
          <template #default="{ row }">¥{{ row.grossAmount }}</template>
        </el-table-column>
        <el-table-column label="售后扣减合计" width="100">
          <template #default="{ row }"><span style="color: #f56c6c">-¥{{ row.refundAmount }}</span></template>
        </el-table-column>
        <el-table-column label="其中·农户扣赔" width="110">
          <template #default="{ row }">
            <el-tooltip content="坏果定责为农户采摘成熟度过高（或多方责任农户份额）时，结算扣除的坏果赔付" placement="top">
              <span :style="{ color: Number(row.farmerBorneDeduction) > 0 ? '#f56c6c' : '#909399' }">-¥{{ row.farmerBorneDeduction || 0 }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="其中·平台承担" width="110">
          <template #default="{ row }">
            <el-tooltip content="坏果定责为包装承压/物流温区时由平台承担，不扣农户" placement="top">
              <span :style="{ color: Number(row.platformBorne) > 0 ? '#e6a23c' : '#909399' }">¥{{ row.platformBorne || 0 }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="实付" width="110">
          <template #default="{ row }"><b style="color: #67c23a">¥{{ row.netAmount }}</b></template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'settled' ? 'success' : 'warning'">{{ row.status === 'settled' ? '已结算' : '待结算' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="!isFarmer" label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" link type="success" @click="pay(row)">打款</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!list.length" description="暂无结算单：直播结束后由运营在「直播排期」生成" :image-size="80" />
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const isFarmer = computed(() => auth.role === 'farmer');
const list = ref([]);
const farmerMap = ref({});
const batchMap = ref({});
const liveMap = ref({});
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    list.value = await request.get('/settlements');
    const farmers = await request.get('/farmers');
    farmerMap.value = Object.fromEntries(farmers.map((f) => [f.id, f.name]));
    const batches = await request.get('/batches');
    batchMap.value = Object.fromEntries(batches.map((b) => [b.id, b.batchNo]));
    const lives = await request.get('/livestreams');
    liveMap.value = Object.fromEntries(lives.map((l) => [l.id, l]));
  } finally { loading.value = false; }
}

async function pay(row) {
  await request.post(`/settlements/${row.id}/pay`);
  ElMessage.success('已打款');
  load();
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
</style>
