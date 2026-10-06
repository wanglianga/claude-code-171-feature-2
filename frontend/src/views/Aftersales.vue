<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>售后工单</span>
          <div>
            <el-radio-group v-model="filter" size="small" @change="load">
              <el-radio-button value="">全部</el-radio-button>
              <el-radio-button value="pending">待处理</el-radio-button>
              <el-radio-button value="resolved">已解决</el-radio-button>
              <el-radio-button value="rejected">已拒绝</el-radio-button>
            </el-radio-group>
            <el-button size="small" type="primary" style="margin-left: 8px" :icon="Plus" @click="openCreate">新建工单</el-button>
            <el-button size="small" type="danger" style="margin-left: 8px" @click="$router.push('/defect-alerts')">坏果预警中心</el-button>
          </div>
        </div>
      </template>
      <el-table :data="list" size="small" v-loading="loading">
        <el-table-column prop="ticketNo" label="工单号" width="160" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === '坏果' ? 'danger' : row.type === '口味不符' ? 'warning' : 'info'" effect="plain">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="订单/客户" min-width="140">
          <template #default="{ row }">
            <div>{{ row.order?.orderNo }}</div>
            <div class="sub">{{ row.order?.customerName }} · {{ row.order?.city }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="问题描述" min-width="180" show-overflow-tooltip />
        <el-table-column label="拍照证据" width="80">
          <template #default="{ row }">
            <el-image v-if="row.evidencePhotos" :src="row.evidencePhotos.split(',')[0]" :preview-src-list="row.evidencePhotos.split(',')" fit="cover" class="thumb" />
            <span v-else class="sub">无</span>
          </template>
        </el-table-column>
        <el-table-column label="优先" width="70">
          <template #default="{ row }">
            <el-tag v-if="row.priorityFlag" size="small" type="danger" effect="dark">优先</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="退款" width="80">
          <template #default="{ row }">¥{{ row.refundAmount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="{ pending: 'warning', resolved: 'success', rejected: 'info' }[row.status]">
              {{ { pending: '待处理', resolved: '已解决', rejected: '已拒绝' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending' && canHandle">
              <el-button size="small" link type="success" @click="openResolve(row)">处理</el-button>
            </template>
            <el-button v-if="row.status === 'resolved'" size="small" link type="primary" @click="openFeedback(row)">反向决策</el-button>
            <el-button size="small" link type="primary" @click="$router.push(`/chain/${row.batchId}`)">链路</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top: 14px">
      <template #header><span>售后反向决策记录（回流选品/主播/预售/品牌）</span></template>
      <el-table :data="feedbackList" size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="决策类型" width="140">
          <template #default="{ row }">
            <el-tag size="small" :type="decisionTag(row.decisionType)">{{ decisionText(row.decisionType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="decision" label="决策内容" min-width="260" show-overflow-tooltip />
        <el-table-column label="批次" width="80">
          <template #default="{ row }">
            <el-button v-if="row.batchId" link type="primary" size="small" @click="$router.push(`/chain/${row.batchId}`)">链路</el-button>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新建工单 -->
    <el-dialog v-model="createDlg" title="新建售后工单" width="480px">
      <el-form label-width="90px">
        <el-form-item label="关联订单" required>
          <el-select v-model="createForm.orderId" filterable remote :remote-method="searchOrders" placeholder="输入订单号搜索" style="width: 100%">
            <el-option v-for="o in orderOptions" :key="o.id" :value="o.id" :label="`${o.orderNo} · ${o.customerName} · ¥${o.amount}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="售后类型" required>
          <el-select v-model="createForm.type" style="width: 100%">
            <el-option v-for="t in ['坏果', '少发', '物流延误', '地址错误', '用户拒收', '口味不符']" :key="t" :value="t" :label="t" />
          </el-select>
        </el-form-item>
        <template v-if="createForm.type === '坏果'">
          <el-form-item label="坏果表象" required>
            <el-select v-model="createForm.defectSymptom" style="width: 100%" placeholder="区分压伤/过熟/霉变等，用于责任归因">
              <el-option v-for="s in ['压伤软烂', '磕碰伤', '过熟软烂', '霉变', '冻伤', '脱水发皱']" :key="s" :value="s" :label="s" />
            </el-select>
          </el-form-item>
          <el-form-item label="拍照证据">
            <el-select v-model="createForm.evidenceKey" style="width: 100%" placeholder="模拟用户上传照片（可选）" clearable>
              <el-option value="user-crush.svg" label="压伤/磕碰开箱照" />
              <el-option value="user-overripe.svg" label="过熟软烂流汁照" />
            </el-select>
            <el-image v-if="createForm.evidenceKey" :src="`/api/evidence/${createForm.evidenceKey}`" fit="cover" class="evidence-preview" />
          </el-form-item>
        </template>
        <el-form-item label="问题描述" required><el-input v-model="createForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="退款金额"><el-input-number v-model="createForm.refundAmount" :min="0" :precision="2" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">提交工单</el-button>
      </template>
    </el-dialog>

    <!-- 处理工单 -->
    <el-dialog v-model="resolveDlg" :title="`处理工单 ${current?.ticketNo || ''}`" width="440px">
      <el-alert v-if="current?.type === '坏果'" type="warning" :closable="false" style="margin-bottom: 10px"
        title="坏果工单处理后将重算批次坏果率，达到 5% 自动形成坏果预警、冻结同批次剩余库存并生成客服优先队列" />
      <el-form label-width="90px">
        <el-form-item label="处理结果">
          <el-radio-group v-model="resolveForm.status">
            <el-radio value="resolved">退款解决</el-radio>
            <el-radio value="rejected">拒绝</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="resolveForm.status === 'resolved'" label="退款金额">
          <el-input-number v-model="resolveForm.refundAmount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="处理说明"><el-input v-model="resolveForm.resolution" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveDlg = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="resolve">提交处理</el-button>
      </template>
    </el-dialog>

    <!-- 反向决策 -->
    <el-dialog v-model="feedbackDlg" title="售后反向决策（影响下一场直播）" width="480px">
      <el-alert type="info" :closable="false" title="决策将回流到选品、主播口径、预售量与县域公共品牌管理" style="margin-bottom: 12px" />
      <el-form label-width="90px">
        <el-form-item label="决策类型" required>
          <el-select v-model="feedbackForm.decisionType" style="width: 100%">
            <el-option value="continue_farmer" label="继续选择该农户" />
            <el-option value="drop_farmer" label="暂停该农户排播" />
            <el-option value="adjust_anchor" label="调整主播口径" />
            <el-option value="reduce_presale" label="降低下一场预售量" />
            <el-option value="brand_notice" label="发布县域品牌风险说明" />
          </el-select>
        </el-form-item>
        <el-form-item label="决策内容" required>
          <el-input v-model="feedbackForm.decision" type="textarea" :rows="3" placeholder="如：苹果下一场预售量由200下调至180" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="feedbackDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="feedback">提交决策</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const canHandle = computed(() => ['aftersales', 'admin'].includes(auth.role));

const list = ref([]);
const feedbackList = ref([]);
const filter = ref('');
const loading = ref(false);
const saving = ref(false);
const createDlg = ref(false);
const resolveDlg = ref(false);
const feedbackDlg = ref(false);
const current = ref(null);
const orderOptions = ref([]);

const createForm = reactive({ orderId: null, type: '坏果', description: '', refundAmount: 0, defectSymptom: '压伤软烂', evidenceKey: '' });
const resolveForm = reactive({ status: 'resolved', refundAmount: 0, resolution: '' });
const feedbackForm = reactive({ decisionType: 'reduce_presale', decision: '' });

function decisionText(t) {
  return { continue_farmer: '继续选择该农户', drop_farmer: '暂停该农户排播', adjust_anchor: '调整主播口径', reduce_presale: '降低预售量', brand_notice: '品牌风险说明' }[t] || t;
}
function decisionTag(t) {
  return { continue_farmer: 'success', drop_farmer: 'danger', adjust_anchor: 'warning', reduce_presale: 'warning', brand_notice: 'danger' }[t] || 'info';
}
function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 16) : ''; }

async function load() {
  loading.value = true;
  try {
    list.value = await request.get('/aftersales', { params: filter.value ? { status: filter.value } : {} });
    feedbackList.value = await request.get('/aftersales/feedback/list');
  } finally { loading.value = false; }
}

async function searchOrders(kw) {
  orderOptions.value = await request.get('/orders');
}

function openCreate() {
  searchOrders();
  Object.assign(createForm, { orderId: null, type: '坏果', description: '', refundAmount: 0, defectSymptom: '压伤软烂', evidenceKey: '' });
  createDlg.value = true;
}
async function create() {
  if (!createForm.orderId || !createForm.description) return ElMessage.warning('请选择订单并填写描述');
  if (createForm.type === '坏果' && !createForm.defectSymptom) return ElMessage.warning('请选择坏果表象');
  saving.value = true;
  try {
    const payload = { ...createForm, evidenceKey: undefined, evidencePhotos: createForm.evidenceKey ? `/api/evidence/${createForm.evidenceKey}` : undefined };
    await request.post('/aftersales', payload);
    ElMessage.success('工单已创建');
    createDlg.value = false;
    load();
  } finally { saving.value = false; }
}

function openResolve(row) {
  current.value = row;
  resolveForm.status = 'resolved';
  resolveForm.refundAmount = Number(row.refundAmount) || 0;
  resolveForm.resolution = '';
  resolveDlg.value = true;
}
async function resolve() {
  saving.value = true;
  try {
    await request.post(`/aftersales/${current.value.id}/resolve`, resolveForm);
    ElMessage.success('工单已处理');
    resolveDlg.value = false;
    load();
  } finally { saving.value = false; }
}

function openFeedback(row) {
  current.value = row;
  feedbackForm.decision = '';
  feedbackDlg.value = true;
}
async function feedback() {
  if (!feedbackForm.decision) return ElMessage.warning('请填写决策内容');
  saving.value = true;
  try {
    await request.post(`/aftersales/${current.value.id}/feedback`, feedbackForm);
    ElMessage.success('反向决策已记录' + (feedbackForm.decisionType === 'brand_notice' ? '，品牌公告草稿已生成' : ''));
    feedbackDlg.value = false;
    load();
  } finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.sub { font-size: 12px; color: #909399; }
.thumb { width: 56px; height: 42px; border-radius: 4px; }
.evidence-preview { width: 160px; margin-top: 6px; border-radius: 6px; border: 1px solid #ebeef5; }
</style>
