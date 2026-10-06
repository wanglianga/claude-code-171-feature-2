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
        <el-table-column label="坏果证据" width="120">
          <template #default="{ row }">
            <template v-if="row.type === '坏果'">
              <el-tag v-if="row.damageForm" size="small" type="danger" effect="plain">{{ row.damageForm }}</el-tag>
              <div class="sub">{{ row.arrivalTemp != null ? `${row.arrivalTemp}℃` : '' }}{{ row.photoEvidence ? ' · 有照片' : '' }}</div>
            </template>
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
        <el-form-item label="问题描述" required><el-input v-model="createForm.description" type="textarea" :rows="2" /></el-form-item>
        <template v-if="createForm.type === '坏果'">
          <el-form-item label="损伤形态">
            <el-select v-model="createForm.damageForm" style="width: 100%" placeholder="选择到货果损形态">
              <el-option v-for="d in ['磕碰压伤', '过熟软烂', '霉变异味', '失水皱缩', '整箱完好']" :key="d" :value="d" :label="d" />
            </el-select>
          </el-form-item>
          <el-form-item label="坏果数量"><el-input-number v-model="createForm.defectQty" :min="0" style="width: 100%" /></el-form-item>
          <el-form-item label="到货气温℃"><el-input-number v-model="createForm.arrivalTemp" :min="-20" :max="50" style="width: 100%" /></el-form-item>
          <el-form-item label="拍照证据">
            <el-input v-model="createForm.photoEvidence" type="textarea" :rows="2" placeholder="用户上传照片地址，多张用英文逗号分隔（演示可填 OSS/arrival/xx.jpg）" />
          </el-form-item>
        </template>
        <el-form-item label="退款金额"><el-input-number v-model="createForm.refundAmount" :min="0" :precision="2" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">提交工单</el-button>
      </template>
    </el-dialog>

    <!-- 处理工单 -->
    <el-dialog v-model="resolveDlg" :title="`处理工单 ${current?.ticketNo || ''}`" width="440px">
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

const createForm = reactive({ orderId: null, type: '坏果', description: '', refundAmount: 0, photoEvidence: '', damageForm: '', arrivalTemp: null, defectQty: 0 });
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
  createDlg.value = true;
}
async function create() {
  if (!createForm.orderId || !createForm.description) return ElMessage.warning('请选择订单并填写描述');
  saving.value = true;
  try {
    await request.post('/aftersales', createForm);
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
</style>
