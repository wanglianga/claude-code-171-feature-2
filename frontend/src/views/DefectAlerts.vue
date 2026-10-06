<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>坏果率异常预警（采摘批次·包装·线路·城市温度·拍照证据）</span>
          <div>
            <el-button size="small" :icon="Refresh" @click="load">刷新</el-button>
            <el-button v-if="isOperator" size="small" type="warning" @click="scan">扫描坏果批次</el-button>
          </div>
        </div>
      </template>
      <el-alert type="error" :closable="false" style="margin-bottom: 10px"
        title="预警形成后已自动冻结同批次剩余库存（已售订单正常发货/赔付）；客服按「同城市·同线路·同包装」优先跟进；质检比对出库照片/到货照片/温区定责后，换包装或在结算扣除农户赔付，结案解除冻结。" />
      <el-radio-group v-model="filter" size="small" style="margin-bottom: 12px" @change="load">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="open">预警中(已冻结)</el-radio-button>
        <el-radio-button value="reviewing">复盘中</el-radio-button>
        <el-radio-button value="closed">已结案</el-radio-button>
      </el-radio-group>
      <el-table :data="list" size="small" v-loading="loading">
        <el-table-column prop="alertNo" label="预警号" width="160" />
        <el-table-column label="批次 / 商品" min-width="200">
          <template #default="{ row }">
            <div>{{ row.batch?.batchNo }}</div>
            <div class="sub">{{ row.batch?.product?.name }} · {{ row.packagingType }}（耐压{{ row.batch?.product?.pressureResistance }}）</div>
          </template>
        </el-table-column>
        <el-table-column label="坏果率" width="100">
          <template #default="{ row }">
            <span style="color: #f56c6c; font-weight: 700">{{ (row.defectRate * 100).toFixed(1) }}%</span>
            <div class="sub">{{ row.defectCount }}/{{ row.soldQty }}</div>
          </template>
        </el-table-column>
        <el-table-column label="冻结库存" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.status !== 'closed' && row.frozenQty > 0" type="danger" size="small">冻 {{ row.frozenQty }}</el-tag>
            <span v-else class="sub">{{ row.status === 'closed' ? '已解封' : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="温区/超温" width="100">
          <template #default="{ row }">
            <div>{{ row.tempZone }}</div>
            <div class="sub" :style="{ color: row.tempBreachRate > 0.1 ? '#f56c6c' : '#909399' }">超温 {{ ((row.tempBreachRate || 0) * 100).toFixed(0) }}%</div>
          </template>
        </el-table-column>
        <el-table-column label="定责结论" min-width="170">
          <template #default="{ row }">
            <el-tag v-if="row.rootCause && row.rootCause !== 'undetermined'" size="small" :type="partyTag(row.responsibleParty)">
              {{ causes[row.rootCause] || row.rootCause }}
            </el-tag>
            <span v-else class="sub">待质检复盘</span>
            <div v-if="row.actionType && row.actionType !== 'none'" class="sub">→ {{ actions[row.actionType] || row.actionType }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="{ open: 'danger', reviewing: 'warning', closed: 'success' }[row.status]">
              {{ { open: '预警中', reviewing: '复盘中', closed: '已结案' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="openDetail(row)">复盘/名单</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 复盘抽屉 -->
    <el-drawer v-model="dlg" size="78%" :title="detail ? `坏果预警 ${detail.alert.alertNo} · ${detail.batch.batchNo}` : ''">
      <div v-if="detail" class="detail">
        <!-- 批次概览 -->
        <el-descriptions :column="4" border size="small">
          <el-descriptions-item label="商品">{{ detail.product.name }}（{{ detail.product.category }}）</el-descriptions-item>
          <el-descriptions-item label="供/可/售/冻">{{ detail.batch.quantity }} / {{ detail.batch.availableQty }} / {{ detail.batch.soldQty }} / {{ detail.alert.frozenQty }}</el-descriptions-item>
          <el-descriptions-item label="包装方式">{{ detail.product.packagingType }}（耐压{{ detail.product.pressureResistance }}）</el-descriptions-item>
          <el-descriptions-item label="物流温区">{{ detail.product.tempZone }}{{ detail.product.coldChainRequired ? '·冷链' : '' }}</el-descriptions-item>
          <el-descriptions-item label="采摘日期">{{ detail.batch.harvestDate }}</el-descriptions-item>
          <el-descriptions-item label="采摘→到货均天">{{ detail.alert.harvestToDeliveryDays ?? '-' }} 天</el-descriptions-item>
          <el-descriptions-item label="运输超温占比">{{ ((detail.alert.tempBreachRate || 0) * 100).toFixed(1) }}%</el-descriptions-item>
          <el-descriptions-item label="库存状态">
            <el-tag v-if="detail.batch.frozenByAlert" type="danger" size="small">已冻结剩余库存</el-tag>
            <el-tag v-else type="success" size="small">正常可售</el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 智能提示 -->
        <el-alert v-for="(s, i) in detail.alert.dimension?.suspect || []" :key="i" type="warning" :closable="false"
          :title="s" style="margin-top: 10px" />

        <el-row :gutter="12" style="margin-top: 14px">
          <!-- 城市温度 -->
          <el-col :span="8">
            <el-card shadow="never" header="按到货城市温度">
              <el-table :data="detail.alert.dimension?.byCity || []" size="small">
                <el-table-column prop="city" label="城市" width="80" />
                <el-table-column prop="orders" label="单" width="45" />
                <el-table-column prop="defects" label="坏果" width="50" />
                <el-table-column label="坏果率" width="70">
                  <template #default="{ row }"><span :style="{ color: row.rate >= 0.2 ? '#f56c6c' : '#606266' }">{{ (row.rate * 100).toFixed(0) }}%</span></template>
                </el-table-column>
                <el-table-column label="均温℃" width="65">
                  <template #default="{ row }"><span :style="{ color: row.avgTemp >= 30 ? '#f56c6c' : '#606266' }">{{ row.avgTemp ?? '-' }}</span></template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
          <!-- 线路 -->
          <el-col :span="8">
            <el-card shadow="never">
              <template #header><span>按物流线路/温区</span></template>
              <el-table :data="detail.alert.dimension?.byRoute || []" size="small">
                <el-table-column prop="route" label="线路" min-width="110" show-overflow-tooltip />
                <el-table-column prop="tasks" label="任务" width="50" />
                <el-table-column prop="defects" label="坏果" width="50" />
                <el-table-column label="晚到" width="50">
                  <template #default="{ row }"><span :style="{ color: row.vehicleLate ? '#f56c6c' : '#606266' }">{{ row.vehicleLate }}</span></template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
          <!-- 拍照证据损伤形态 -->
          <el-col :span="8">
            <el-card shadow="never">
              <template #header><span>用户拍照证据·损伤形态</span></template>
              <el-table :data="detail.alert.dimension?.evidence || []" size="small">
                <el-table-column prop="damageForm" label="形态" min-width="100" />
                <el-table-column prop="count" label="单数" width="60" />
              </el-table>
              <div class="sub" style="margin-top: 6px">
                包装：{{ detail.alert.packagingType }}，整体坏果率 {{ (detail.alert.defectRate * 100).toFixed(1) }}%
              </div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 出库 vs 到货 比对 -->
        <el-card shadow="never" style="margin-top: 14px">
          <template #header><span>质检复盘：出库照片 / 到货照片 / 物流温区 比对</span></template>
          <el-table :data="detail.defectTickets" size="small" max-height="320">
            <el-table-column label="订单/城市" width="150">
              <template #default="{ row }">
                <div>{{ row.order?.orderNo }}</div>
                <div class="sub">{{ row.order?.city }} · {{ row.arrivalTemp }}℃</div>
              </template>
            </el-table-column>
            <el-table-column label="线路/车辆" width="150">
              <template #default="{ row }">
                <div>{{ row.task?.logisticsRoute || '-' }}</div>
                <div class="sub">{{ row.task?.coldChainVehicle || '普货' }}{{ row.task?.vehicleLate ? '·晚到' : '' }} · 峰值{{ row.task?.transitMaxTemp ?? '-' }}℃</div>
              </template>
            </el-table-column>
            <el-table-column label="出库照片" width="160">
              <template #default="{ row }">
                <el-image v-if="isHttp(row.task?.outboundPhoto)" :src="row.task.outboundPhoto" :preview-src-list="[row.task.outboundPhoto]" fit="cover" class="thumb" />
                <div v-else-if="row.task?.outboundPhoto" class="photochip out">
                  <el-icon><Camera /></el-icon><span>出库照</span>
                </div>
                <span v-else class="sub">未拍照</span>
              </template>
            </el-table-column>
            <el-table-column label="到货照片(用户)" width="180">
              <template #default="{ row }">
                <div class="photos">
                  <template v-for="(p, i) in row.photos" :key="i">
                    <el-image v-if="isHttp(p)" :src="p" :preview-src-list="row.photos.filter(isHttp)" :initial-index="row.photos.filter(isHttp).indexOf(p)" fit="cover" class="thumb" />
                    <div v-else class="photochip in" :title="p">
                      <el-icon><PictureFilled /></el-icon><span>到货{{ i + 1 }}</span>
                    </div>
                  </template>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="损伤形态" width="100">
              <template #default="{ row }"><el-tag size="small" :type="damageTag(row.damageForm)">{{ row.damageForm }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="description" label="用户描述" min-width="180" show-overflow-tooltip />
            <el-table-column label="赔付" width="70">
              <template #default="{ row }">¥{{ row.refundAmount }}</template>
            </el-table-column>
          </el-table>
          <div class="sub" style="margin-top: 6px">
            判定要点：外箱压痕+果体撞伤为主 → 包装承压；无压痕+果肉过熟软烂 → 采摘成熟度过高；温区超温/晚到+高温城市集中 → 物流温区。
          </div>
        </el-card>

        <!-- 客服优先名单 -->
        <el-card shadow="never" style="margin-top: 14px">
          <template #header>
            <div class="head">
              <span>客服优先跟进名单（同城市·同线路·同包装）</span>
              <el-tag size="small" type="danger">待跟进 {{ followupPending }} 人</el-tag>
            </div>
          </template>
          <el-table :data="detail.followups" size="small" max-height="300">
            <el-table-column label="优先" width="70">
              <template #default="{ row }">
                <el-tag size="small" :type="row.priorityScore >= 4 ? 'danger' : row.priorityScore >= 3 ? 'warning' : 'info'">P{{ row.priorityScore }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="客户/城市" min-width="140">
              <template #default="{ row }">
                <div>{{ row.order?.customerName }} · {{ row.city }}</div>
                <div class="sub">{{ row.order?.orderNo }} · {{ row.order?.phone }}</div>
              </template>
            </el-table-column>
            <el-table-column label="线路/包装" min-width="170">
              <template #default="{ row }">
                <div>{{ row.logisticsRoute || '-' }}</div>
                <div class="sub">{{ row.packagingType }}</div>
              </template>
            </el-table-column>
            <el-table-column label="命中特征" width="170">
              <template #default="{ row }">
                <el-tag v-for="t in row.matchTags.split(',')" :key="t" size="small" style="margin-right: 4px">{{ t }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="现状" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.ticket" size="small" type="danger">已坏果报损</el-tag>
                <el-tag v-else size="small" type="warning">未报损高风险</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="跟进状态" width="150">
              <template #default="{ row }">
                <el-select v-if="canService" :model-value="row.status" size="small" @change="(v) => setFollowup(row, v)">
                  <el-option value="pending" label="待跟进" />
                  <el-option value="processing" label="跟进中" />
                  <el-option value="done" label="已处理" />
                </el-select>
                <el-tag v-else size="small">{{ { pending: '待跟进', processing: '跟进中', done: '已处理' }[row.status] }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 定责处置 -->
        <el-card shadow="never" style="margin-top: 14px" v-if="isOperator">
          <template #header><span>定责与处置（质检复盘结论）</span></template>
          <el-form label-width="110px" :model="form">
            <el-row :gutter="10">
              <el-col :span="8">
                <el-form-item label="责任归因">
                  <el-select v-model="form.rootCause" style="width: 100%">
                    <el-option v-for="(v, k) in causes" :key="k" :value="k" :label="v" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="责任方">
                  <el-select v-model="form.responsibleParty" style="width: 100%">
                    <el-option value="farmer" label="农户（采摘成熟度）" />
                    <el-option value="platform" label="平台/包装环节" />
                    <el-option value="logistics" label="物流环节" />
                    <el-option value="shared" label="多方共担" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="处置动作">
                  <el-select v-model="form.actionType" style="width: 100%">
                    <el-option v-for="(v, k) in actions" :key="k" :value="k" :label="v" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="10">
              <el-col :span="8" v-if="['change_packaging', 'both'].includes(form.actionType)">
                <el-form-item label="更换为包装">
                  <el-input v-model="form.newPackaging" placeholder="如：加厚泡沫托+气柱袋" />
                </el-form-item>
              </el-col>
              <el-col :span="8" v-if="['deduct_farmer', 'both'].includes(form.actionType)">
                <el-form-item label="扣农户赔付¥">
                  <el-input-number v-model="form.farmerDeductionAmount" :min="0" :precision="2" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="照片/温区比对结论">
              <el-input v-model="form.conclusion" type="textarea" :rows="2" placeholder="出库照片 vs 到货照片 vs 温区记录的比对结论" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saving" @click="submitReview">提交定责（自动重算结算扣减）</el-button>
              <el-button type="success" :disabled="detail.alert.status === 'open'" @click="closeAlert">结案并解除库存冻结</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const isOperator = computed(() => ['operator', 'admin'].includes(auth.role));
const canService = computed(() => ['aftersales', 'operator', 'admin'].includes(auth.role));

const list = ref([]);
const filter = ref('');
const loading = ref(false);
const saving = ref(false);
const dlg = ref(false);
const detail = ref(null);
const causes = ref({});
const actions = ref({});
const form = reactive({ rootCause: 'packaging_pressure', responsibleParty: 'platform', actionType: 'change_packaging', newPackaging: '', farmerDeductionAmount: 0, conclusion: '' });

const followupPending = computed(() => (detail.value?.followups || []).filter((f) => f.status !== 'done').length);

function partyTag(p) {
  return { farmer: 'danger', platform: 'warning', logistics: 'primary', shared: 'info' }[p] || 'info';
}
function damageTag(f) {
  return { 磕碰压伤: 'warning', 过熟软烂: 'danger', 霉变异味: 'danger', 失水皱缩: 'info' }[f] || 'info';
}
// 真实图片地址（http/https/data/blob）直接预览；演示用 OSS 键以芯片占位展示
function isHttp(p) {
  return typeof p === 'string' && /^(https?:\/\/|data:|blob:)/i.test(p);
}

async function load() {
  loading.value = true;
  try {
    list.value = await request.get('/defect-alerts', { params: filter.value ? { status: filter.value } : {} });
  } finally { loading.value = false; }
}

async function scan() {
  const res = await request.post('/defect-alerts/scan');
  ElMessage.warning(`扫描完成，新增 ${res.scanned} 条坏果预警`);
  load();
}

async function openDetail(row) {
  detail.value = await request.get(`/defect-alerts/${row.id}`);
  causes.value = detail.value.causes;
  actions.value = detail.value.actions;
  const a = detail.value.alert;
  form.rootCause = a.rootCause !== 'undetermined' ? a.rootCause : guessCause(a);
  form.responsibleParty = a.responsibleParty || 'platform';
  form.actionType = a.actionType || 'change_packaging';
  form.newPackaging = a.newPackaging || '';
  form.farmerDeductionAmount = Number(a.farmerDeductionAmount) || 0;
  form.conclusion = a.conclusion || '';
  dlg.value = true;
}

function guessCause(a) {
  const ev = a.dimension?.evidence || [];
  const pressure = ev.find((e) => e.damageForm === '磕碰压伤')?.count || 0;
  const ripe = ev.find((e) => e.damageForm === '过熟软烂')?.count || 0;
  return ripe > pressure ? 'harvest_ripeness' : 'packaging_pressure';
}

async function submitReview() {
  if (['change_packaging', 'both'].includes(form.actionType) && !form.newPackaging) {
    return ElMessage.warning('请填写更换后的包装方式');
  }
  saving.value = true;
  try {
    await request.post(`/defect-alerts/${detail.value.alert.id}/review`, form);
    ElMessage.success('定责已提交，结算扣减已重算');
    dlg.value = false;
    load();
  } finally { saving.value = false; }
}

async function closeAlert() {
  await request.post(`/defect-alerts/${detail.value.alert.id}/close`, {});
  ElMessage.success('已结案，同批次剩余库存冻结解除');
  dlg.value = false;
  load();
}

async function setFollowup(row, status) {
  await request.patch(`/defect-alerts/followups/${row.id}`, { status });
  ElMessage.success('跟进状态已更新');
  openDetail({ id: detail.value.alert.id });
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.sub { font-size: 12px; color: #909399; }
.thumb { width: 52px; height: 52px; border-radius: 4px; margin: 2px; }
.photos { display: flex; flex-wrap: wrap; }
.photochip {
  width: 52px; height: 52px; border-radius: 4px; margin: 2px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 11px; gap: 2px; color: #fff;
}
.photochip.out { background: #7fb069; }
.photochip.in { background: #e76f51; }
:deep(.el-card__header) { padding: 10px 14px; font-weight: 600; font-size: 13px; }
</style>
