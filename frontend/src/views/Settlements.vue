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
        <el-table-column label="售后退款总额" width="110">
          <template #default="{ row }">¥{{ row.refundAmount }}</template>
        </el-table-column>
        <el-table-column label="农户承担(扣赔付)" width="130">
          <template #default="{ row }">
            <span style="color: #f56c6c">-¥{{ row.farmerDeduction ?? row.refundAmount }}</span>
            <div class="sub">采摘成熟度过高等</div>
          </template>
        </el-table-column>
        <el-table-column label="平台/物流承担" width="120">
          <template #default="{ row }">
            <span class="sub">¥{{ platformBorne(row) }}</span>
            <div class="sub">包装/温区等</div>
          </template>
        </el-table-column>
        <el-table-column label="实付农户" width="110">
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

function platformBorne(row) {
  const total = Number(row.refundAmount || 0);
  const farmer = Number(row.farmerDeduction != null ? row.farmerDeduction : row.refundAmount || 0);
  return Math.max(0, total - farmer).toFixed(2);
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
</style>
