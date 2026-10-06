<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>商品管理{{ isFarmer ? '（我的商品）' : '' }}</span>
          <el-button v-if="isFarmer" type="success" :icon="Plus" @click="productDlg = true">提交商品</el-button>
        </div>
      </template>
      <el-table :data="products" size="small" v-loading="loading">
        <el-table-column prop="name" label="商品" min-width="140">
          <template #default="{ row }">
            <div>{{ row.name }}</div>
            <div class="sub">{{ row.category }} · {{ row.spec }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="origin" label="产地" min-width="130" show-overflow-tooltip />
        <el-table-column v-if="!isFarmer" label="农户" width="120">
          <template #default="{ row }">{{ row.farmer?.name }}</template>
        </el-table-column>
        <el-table-column label="保质期/温区" width="110">
          <template #default="{ row }">
            <div>{{ row.shelfLifeDays }}天</div>
            <div class="sub">{{ row.tempZone }}{{ row.coldChainRequired ? ' · 冷链' : '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="包装耐压" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.pressureResistance === '高' ? 'success' : row.pressureResistance === '中' ? 'warning' : 'danger'" effect="plain">{{ row.pressureResistance }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'">
              {{ { submitted: '待审核', approved: '已通过', rejected: '已驳回' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button v-if="isFarmer && row.status === 'approved'" size="small" type="primary" @click="openBatch(row)">报批次</el-button>
            <template v-if="isOperator && row.status === 'submitted'">
              <el-button size="small" type="success" @click="review(row, 'approved')">通过</el-button>
              <el-button size="small" type="danger" @click="review(row, 'rejected')">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top: 14px">
      <template #header>
        <div class="head">
          <span>供货批次</span>
          <el-radio-group v-model="batchFilter" size="small" @change="loadBatches">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="pending">待选品</el-radio-button>
            <el-radio-button value="qc_passed">质检通过</el-radio-button>
            <el-radio-button value="locked">已锁库</el-radio-button>
            <el-radio-button value="on_sale">直播中</el-radio-button>
            <el-radio-button value="closed">已收官</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table :data="batches" size="small">
        <el-table-column prop="batchNo" label="批次号" width="160" />
        <el-table-column label="商品" min-width="130">
          <template #default="{ row }">{{ row.product?.name }}</template>
        </el-table-column>
        <el-table-column v-if="!isFarmer" label="农户" width="110">
          <template #default="{ row }">{{ row.product?.farmer?.name }}</template>
        </el-table-column>
        <el-table-column label="供/可/售" width="120">
          <template #default="{ row }">{{ row.quantity }} / {{ row.availableQty }} / {{ row.soldQty }}</template>
        </el-table-column>
        <el-table-column prop="harvestDate" label="采摘日期" width="100" />
        <el-table-column label="检测报告" width="150">
          <template #default="{ row }">
            <div>{{ row.testReportNo || '未上传' }}</div>
            <div class="sub" :style="{ color: row.reportExpired ? '#f56c6c' : '#909399' }">
              {{ row.testReportExpiry ? (row.reportExpired ? `已过期(${row.testReportExpiry})` : `至${row.testReportExpiry}`) : '-' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="坏果率" width="80">
          <template #default="{ row }">
            <span :style="{ color: row.defectRate >= 0.05 ? '#f56c6c' : '#67c23a' }">{{ (row.defectRate * 100).toFixed(1) }}%</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="batchTag(row.status)">{{ batchText(row.status) }}</el-tag>
            <el-tag v-if="row.frozenByAlert" size="small" type="danger" effect="dark" style="margin-left: 2px">坏果冻结</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="$router.push(`/chain/${row.id}`)">链路</el-button>
            <el-button v-if="(isFarmer || isOperator) && ['on_sale', 'locked', 'qc_passed'].includes(row.status)" size="small" link type="warning" @click="openReduce(row)">临时少供</el-button>
            <el-button v-if="isOperator || isWarehouse" size="small" link type="danger" @click="openDefect(row)">坏果上报</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 提交商品 -->
    <el-dialog v-model="productDlg" title="提交农产品" width="560px">
      <el-form :model="pForm" label-width="90px" size="default">
        <el-form-item label="商品名称" required><el-input v-model="pForm.name" placeholder="如：高山红富士苹果" /></el-form-item>
        <el-form-item label="品类" required>
          <el-select v-model="pForm.category" style="width: 100%">
            <el-option v-for="c in ['水果', '米面', '菌菇', '蜂蜜', '腊味']" :key="c" :value="c" :label="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="产地" required><el-input v-model="pForm.origin" placeholder="乡镇/村/基地" /></el-form-item>
        <el-form-item label="规格" required><el-input v-model="pForm.spec" placeholder="如：5kg/箱 单果200g+" /></el-form-item>
        <el-row :gutter="10">
          <el-col :span="12"><el-form-item label="保质期(天)" required><el-input-number v-model="pForm.shelfLifeDays" :min="1" style="width: 100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="物流温区"><el-select v-model="pForm.tempZone" style="width: 100%"><el-option v-for="z in ['常温', '冷藏', '冷冻']" :key="z" :value="z" :label="z" /></el-select></el-form-item></el-col>
        </el-row>
        <el-row :gutter="10">
          <el-col :span="12"><el-form-item label="需要冷链"><el-switch v-model="pForm.coldChainRequired" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="包装耐压"><el-select v-model="pForm.pressureResistance" style="width: 100%"><el-option v-for="z in ['高', '中', '低']" :key="z" :value="z" :label="z" /></el-select></el-form-item></el-col>
        </el-row>
        <el-form-item label="包装方式"><el-input v-model="pForm.packagingType" placeholder="如：泡沫托+纸箱" /></el-form-item>
        <el-form-item label="商品描述"><el-input v-model="pForm.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="productDlg = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="saveProduct">提交审核</el-button>
      </template>
    </el-dialog>

    <!-- 报批次 -->
    <el-dialog v-model="batchDlg" :title="`供货批次 - ${currentProduct?.name || ''}`" width="520px">
      <el-form :model="bForm" label-width="110px">
        <el-form-item label="供货数量(件)" required><el-input-number v-model="bForm.quantity" :min="1" style="width: 100%" /></el-form-item>
        <el-form-item label="采摘/生产日期" required><el-date-picker v-model="bForm.harvestDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" /></el-form-item>
        <el-form-item label="采摘窗口截止" required><el-date-picker v-model="bForm.harvestWindowEnd" type="date" value-format="YYYY-MM-DD" style="width: 100%" /></el-form-item>
        <el-form-item label="供货价(元/件)" required><el-input-number v-model="bForm.supplyPrice" :min="0.1" :precision="2" style="width: 100%" /></el-form-item>
        <el-form-item label="检测报告编号"><el-input v-model="bForm.testReportNo" placeholder="如：JC-2026-1001" /></el-form-item>
        <el-form-item label="报告有效期至"><el-date-picker v-model="bForm.testReportExpiry" type="date" value-format="YYYY-MM-DD" style="width: 100%" /></el-form-item>
        <el-form-item label="可供直播"><el-switch v-model="bForm.livestreamAvailable" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchDlg = false">取消</el-button>
        <el-button type="success" :loading="saving" @click="saveBatch">提交批次</el-button>
      </template>
    </el-dialog>

    <!-- 临时少供 -->
    <el-dialog v-model="reduceDlg" title="农户临时少供" width="420px">
      <el-alert type="warning" :closable="false" title="调减供货量将触发链路风险事件，并影响农户稳定性评分" style="margin-bottom: 12px" />
      <el-form label-width="90px">
        <el-form-item label="当前供货"><span>{{ currentBatch?.quantity }} 件（可售 {{ currentBatch?.availableQty }} 件）</span></el-form-item>
        <el-form-item label="新供货量"><el-input-number v-model="reduceQty" :min="0" :max="(currentBatch?.quantity || 1) - 1" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reduceDlg = false">取消</el-button>
        <el-button type="warning" :loading="saving" @click="doReduce">确认少供</el-button>
      </template>
    </el-dialog>

    <!-- 坏果上报 -->
    <el-dialog v-model="defectDlg" title="批次坏果率上报" width="420px">
      <el-form label-width="90px">
        <el-form-item label="批次"><span>{{ currentBatch?.batchNo }}</span></el-form-item>
        <el-form-item label="坏果率"><el-slider v-model="defectRate" :min="0" :max="30" :format-tooltip="(v) => v + '%'" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="defectDlg = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="doDefect">提交</el-button>
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
const isFarmer = computed(() => auth.role === 'farmer');
const isOperator = computed(() => ['operator', 'admin'].includes(auth.role));
const isWarehouse = computed(() => auth.role === 'warehouse');

const loading = ref(false);
const saving = ref(false);
const products = ref([]);
const batches = ref([]);
const batchFilter = ref('');

const productDlg = ref(false);
const batchDlg = ref(false);
const reduceDlg = ref(false);
const defectDlg = ref(false);
const currentProduct = ref(null);
const currentBatch = ref(null);
const reduceQty = ref(0);
const defectRate = ref(5);

const pForm = reactive({ name: '', category: '水果', origin: '', spec: '', shelfLifeDays: 30, tempZone: '常温', coldChainRequired: false, pressureResistance: '中', packagingType: '普通纸箱', description: '' });
const bForm = reactive({ quantity: 100, harvestDate: '', harvestWindowEnd: '', supplyPrice: 10, testReportNo: '', testReportExpiry: '', livestreamAvailable: true });

function batchText(s) {
  return { pending: '待选品', qc_passed: '质检通过', qc_failed: '质检不合格', locked: '已锁库', on_sale: '直播中', closed: '已收官' }[s] || s;
}
function batchTag(s) {
  return { pending: 'warning', qc_passed: 'success', qc_failed: 'danger', locked: 'primary', on_sale: 'danger', closed: 'info' }[s] || 'info';
}

async function loadProducts() {
  loading.value = true;
  try { products.value = await request.get('/products'); } finally { loading.value = false; }
}
async function loadBatches() {
  batches.value = await request.get('/batches', { params: batchFilter.value ? { status: batchFilter.value } : {} });
}

async function saveProduct() {
  if (!pForm.name || !pForm.origin || !pForm.spec) return ElMessage.warning('请填写名称、产地、规格');
  saving.value = true;
  try {
    await request.post('/products', pForm);
    ElMessage.success('商品已提交，等待运营审核');
    productDlg.value = false;
    loadProducts();
  } finally { saving.value = false; }
}

function openBatch(row) {
  currentProduct.value = row;
  batchDlg.value = true;
}
async function saveBatch() {
  if (!bForm.harvestDate || !bForm.harvestWindowEnd) return ElMessage.warning('请填写采摘日期与窗口');
  saving.value = true;
  try {
    await request.post(`/products/${currentProduct.value.id}/batches`, bForm);
    ElMessage.success('批次已提交，等待选品质检');
    batchDlg.value = false;
    loadBatches();
  } finally { saving.value = false; }
}

async function review(row, status) {
  await request.patch(`/products/${row.id}/review`, { status, note: status === 'approved' ? '审核通过' : '不符合上架要求' });
  ElMessage.success('审核完成');
  loadProducts();
}

function openReduce(row) {
  currentBatch.value = row;
  reduceQty.value = Math.max(0, row.quantity - 10);
  reduceDlg.value = true;
}
async function doReduce() {
  saving.value = true;
  try {
    await request.post(`/batches/${currentBatch.value.id}/reduce-supply`, { quantity: reduceQty.value });
    ElMessage.warning('已登记少供，风险事件已生成');
    reduceDlg.value = false;
    loadBatches();
  } finally { saving.value = false; }
}

function openDefect(row) {
  currentBatch.value = row;
  defectRate.value = Math.round((row.defectRate || 0) * 100);
  defectDlg.value = true;
}
async function doDefect() {
  saving.value = true;
  try {
    await request.post(`/batches/${currentBatch.value.id}/defect`, { rate: defectRate.value / 100 });
    ElMessage.success('坏果率已更新');
    defectDlg.value = false;
    loadBatches();
  } finally { saving.value = false; }
}

onMounted(() => { loadProducts(); loadBatches(); });
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.sub { font-size: 12px; color: #909399; }
</style>
