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
      <el-table :data="list" size="small" v-loading="loading" max-height="620" row-key="id">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand">
              <div class="expand-line"><b>物流线路：</b>{{ row.logisticsRoute || '—' }}</div>
              <div class="expand-line">
                <b>温度：</b>到货城市 {{ row.arrivalCityTemp != null ? row.arrivalCityTemp + '℃' : '—' }}
                ｜运输峰值 {{ row.transitMaxTemp != null ? row.transitMaxTemp + '℃' : '—' }}
                <el-tag v-if="tempAbnormal(row)" size="small" type="danger">途中超温</el-tag>
                ｜包装 {{ row.packagingType || '—' }}
              </div>
              <div class="expand-line"><b>随单承诺：</b>{{ row.promiseText || '—' }}</div>
              <div class="photo-line">
                <div class="photo-box"><div class="photo-label">出库照片</div>
                  <el-image v-if="row.outboundPhoto" :src="row.outboundPhoto" :preview-src-list="[row.outboundPhoto]" fit="cover" class="photo" />
                  <span v-else class="sub">未拍摄</span>
                </div>
                <div class="photo-box"><div class="photo-label">到货照片</div>
                  <el-image v-if="row.arrivalPhoto" :src="row.arrivalPhoto" :preview-src-list="[row.arrivalPhoto, row.outboundPhoto].filter(Boolean)" fit="cover" class="photo" />
                  <span v-else class="sub">未回传</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="taskNo" label="任务号" width="160" />
        <el-table-column label="订单/客户" min-width="130">
          <template #default="{ row }">
            <div>{{ row.order?.orderNo }}</div>
            <div class="sub">{{ row.order?.customerName }} · {{ row.order?.city }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="warehouseName" label="发货仓" width="110" />
        <el-table-column label="温区" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.tempZone === '常温' ? 'info' : row.tempZone === '冷藏' ? 'primary' : 'warning'" effect="plain">{{ row.tempZone }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="到货温度" width="90">
          <template #default="{ row }">
            <span v-if="row.arrivalCityTemp != null" :style="{ color: row.arrivalCityTemp >= 30 ? '#f56c6c' : '#303133' }">{{ row.arrivalCityTemp }}℃</span>
            <span v-else class="sub">—</span>
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
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', shipped: 'primary', in_transit: 'primary', delivered: 'success', exception: 'danger' }[row.status]">
              {{ { pending: '待发货', shipped: '已发货', in_transit: '运输中', delivered: '已送达', exception: '异常' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" link type="primary" @click="act(row, 'ship')">发货</el-button>
            <el-button v-if="row.status === 'pending'" size="small" link type="primary" @click="openPhoto(row, 'ship')">拍照发货</el-button>
            <el-button v-if="['shipped', 'in_transit'].includes(row.status)" size="small" link type="success" @click="act(row, 'deliver')">送达</el-button>
            <el-button v-if="['shipped', 'in_transit'].includes(row.status)" size="small" link type="success" @click="openPhoto(row, 'deliver')">回传到货</el-button>
            <el-button v-if="row.coldChainVehicle && !row.vehicleLate && ['pending', 'shipped'].includes(row.status)" size="small" link type="warning" @click="late(row)">冷链晚到</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 出库/到货拍照 -->
    <el-dialog v-model="photoDlg.show" :title="photoDlg.action === 'ship' ? `出库抽检拍照 - ${photoDlg.taskNo}` : `到货回传 - ${photoDlg.taskNo}`" width="420px">
      <el-form label-width="92px">
        <el-form-item :label="photoDlg.action === 'ship' ? '出库照片' : '到货照片'">
          <el-select v-model="photoDlg.photo" style="width: 100%" placeholder="选择模拟拍照结果">
            <el-option v-if="photoDlg.action === 'ship'" value="/api/evidence/outbound-apple.svg" label="出库完好·苹果装箱照" />
            <el-option v-if="photoDlg.action === 'ship'" value="/api/evidence/outbound-strawberry.svg" label="出库完好·草莓泡沫托照" />
            <el-option v-if="photoDlg.action === 'deliver'" value="/api/evidence/arrival-crush.svg" label="到货压伤·箱体塌陷" />
            <el-option v-if="photoDlg.action === 'deliver'" value="/api/evidence/arrival-overripe.svg" label="到货过熟·盒完好果软烂" />
          </el-select>
          <el-image v-if="photoDlg.photo" :src="photoDlg.photo" fit="cover" class="photo-preview" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="photoDlg.show = false">取消</el-button>
        <el-button :type="photoDlg.action === 'ship' ? 'primary' : 'success'" :loading="saving" @click="submitPhoto">确认</el-button>
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
const saving = ref(false);
const photoDlg = reactive({ show: false, action: 'ship', taskId: null, taskNo: '', photo: '' });

function tempAbnormal(row) {
  if (row.transitMaxTemp == null) return false;
  if (row.tempZone === '冷藏') return row.transitMaxTemp > 10;
  if (row.tempZone === '冷冻') return row.transitMaxTemp > -10;
  return row.transitMaxTemp > 35;
}

async function load() {
  loading.value = true;
  try {
    list.value = await request.get('/shipping/tasks', { params: filter.value ? { status: filter.value } : {} });
  } finally { loading.value = false; }
}

async function act(row, action) {
  try {
    await request.post(`/shipping/tasks/${row.id}/${action}`, {});
    ElMessage.success(action === 'ship' ? '已发货' : '已送达');
    load();
  } catch { /* 拦截器已提示（如批次冻结） */ }
}

function openPhoto(row, action) {
  Object.assign(photoDlg, { show: true, action, taskId: row.id, taskNo: row.taskNo, photo: '' });
}
async function submitPhoto() {
  saving.value = true;
  try {
    const body = photoDlg.action === 'ship'
      ? { outboundPhoto: photoDlg.photo || undefined }
      : { arrivalPhoto: photoDlg.photo || undefined };
    await request.post(`/shipping/tasks/${photoDlg.taskId}/${photoDlg.action}`, body);
    ElMessage.success(photoDlg.action === 'ship' ? '已拍照发货' : '到货信息已回传');
    photoDlg.show = false;
    load();
  } finally { saving.value = false; }
}

async function late(row) {
  const { value } = await ElMessageBox.prompt('晚到原因（如高速管制、车辆故障）', '冷链车晚到上报', { inputValue: '高速临时管制' });
  await request.post(`/shipping/tasks/${row.id}/vehicle-late`, { note: value });
  ElMessage.warning('已上报，链路风险事件已生成');
  load();
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.sub { font-size: 12px; color: #909399; }
.expand { padding: 6px 20px; background: #fafbfc; }
.expand-line { font-size: 13px; color: #606266; padding: 3px 0; }
.photo-line { display: flex; gap: 24px; margin-top: 8px; }
.photo-label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.photo { width: 180px; height: 135px; border-radius: 6px; border: 1px solid #ebeef5; }
.photo-preview { width: 220px; margin-top: 8px; border-radius: 6px; border: 1px solid #ebeef5; }
</style>
