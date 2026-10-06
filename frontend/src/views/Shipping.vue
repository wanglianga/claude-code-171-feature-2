<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>发货任务（按订单·批次·仓库·温区·承诺生成）</span>
          <el-radio-group v-model="filter" size="small" @change="load">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="pending">待发货</el-radio-button>
            <el-radio-button value="shipped">已发货</el-radio-button>
            <el-radio-button value="delivered">已送达</el-radio-button>
            <el-radio-button value="exception">异常</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table :data="list" size="small" v-loading="loading" max-height="620">
        <el-table-column prop="taskNo" label="任务号" width="160" />
        <el-table-column label="订单/客户" min-width="130">
          <template #default="{ row }">
            <div>{{ row.order?.orderNo }}</div>
            <div class="sub">{{ row.order?.customerName }} · {{ row.order?.city }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="warehouseName" label="发货仓" width="100" />
        <el-table-column label="线路/出库照" min-width="140">
          <template #default="{ row }">
            <div>{{ row.logisticsRoute || '未分配' }}</div>
            <div class="sub">
              <el-icon v-if="row.outboundPhoto" color="#67c23a"><Camera /></el-icon>
              {{ row.outboundPhoto ? '已拍出库照' : '未拍出库照' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="温区" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.tempZone === '常温' ? 'info' : row.tempZone === '冷藏' ? 'primary' : 'warning'" effect="plain">{{ row.tempZone }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="承运/车辆" min-width="130">
          <template #default="{ row }">
            <div>{{ row.carrier }}</div>
            <div class="sub" :style="{ color: row.vehicleLate ? '#f56c6c' : '#909399' }">
              {{ row.coldChainVehicle || '普通货运' }}{{ row.vehicleLate ? '（晚到）' : '' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="promiseText" label="随单承诺" min-width="140" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', shipped: 'primary', in_transit: 'primary', delivered: 'success', exception: 'danger' }[row.status]">
              {{ { pending: '待发货', shipped: '已发货', in_transit: '运输中', delivered: '已送达', exception: '异常' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" link type="primary" @click="act(row, 'ship')">发货</el-button>
            <el-button v-if="['shipped', 'in_transit'].includes(row.status)" size="small" link type="success" @click="act(row, 'deliver')">送达</el-button>
            <el-button v-if="row.coldChainVehicle && !row.vehicleLate && ['pending', 'shipped'].includes(row.status)" size="small" link type="warning" @click="late(row)">冷链晚到</el-button>
            <el-button size="small" link type="primary" @click="openEvidence(row)">出库照/温区</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 出库证据登记 -->
    <el-dialog v-model="evidenceDlg" title="出库照片 · 物流线路 · 运输温区" width="460px">
      <el-alert type="info" :closable="false" title="坏果复盘时将用此出库照片与用户到货照片、运输温区比对定责" style="margin-bottom: 12px" />
      <el-form label-width="100px">
        <el-form-item label="物流线路">
          <el-input v-model="evidence.logisticsRoute" placeholder="如：华中冷链C线" />
        </el-form-item>
        <el-form-item label="出库装车照">
          <el-input v-model="evidence.outboundPhoto" type="textarea" :rows="2" placeholder="照片地址，如 OSS/outbound/T001.jpg" />
        </el-form-item>
        <el-form-item label="途中最高温℃">
          <el-input-number v-model="evidence.transitMaxTemp" :min="-20" :max="50" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="evidenceDlg = false">取消</el-button>
        <el-button type="primary" @click="saveEvidence">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '../api/request';

const list = ref([]);
const filter = ref('');
const loading = ref(false);
const evidenceDlg = ref(false);
const current = ref(null);
const evidence = reactive({ logisticsRoute: '', outboundPhoto: '', transitMaxTemp: 4 });

async function load() {
  loading.value = true;
  try {
    list.value = await request.get('/shipping/tasks', { params: filter.value ? { status: filter.value } : {} });
  } finally { loading.value = false; }
}

async function act(row, action) {
  await request.post(`/shipping/tasks/${row.id}/${action}`);
  ElMessage.success(action === 'ship' ? '已发货' : '已送达');
  load();
}

async function late(row) {
  const { value } = await ElMessageBox.prompt('晚到原因（如高速管制、车辆故障）', '冷链车晚到上报', { inputValue: '高速临时管制' });
  await request.post(`/shipping/tasks/${row.id}/vehicle-late`, { note: value });
  ElMessage.warning('已上报，链路风险事件已生成');
  load();
}

function openEvidence(row) {
  current.value = row;
  evidence.logisticsRoute = row.logisticsRoute || '';
  evidence.outboundPhoto = row.outboundPhoto || '';
  evidence.transitMaxTemp = row.transitMaxTemp != null ? row.transitMaxTemp : 4;
  evidenceDlg.value = true;
}
async function saveEvidence() {
  await request.post(`/shipping/tasks/${current.value.id}/outbound-evidence`, evidence);
  ElMessage.success('出库证据已登记');
  evidenceDlg.value = false;
  load();
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.sub { font-size: 12px; color: #909399; }
</style>
