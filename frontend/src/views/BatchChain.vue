<template>
  <div v-loading="loading">
    <template v-if="chain">
      <el-card shadow="never">
        <template #header>
          <div class="head">
            <span>批次全链路：{{ chain.batch.batchNo }} · {{ chain.batch.product?.name }}</span>
            <div>
              <el-tag v-if="chain.batch.frozenByAlert" type="danger" effect="dark" style="margin-right: 6px">坏果预警·剩余库存已冻结</el-tag>
              <el-tag :type="batchTag(chain.batch.status)">{{ batchText(chain.batch.status) }}</el-tag>
            </div>
          </div>
        </template>
        <el-descriptions :column="4" border size="small">
          <el-descriptions-item label="农户">{{ chain.batch.product?.farmer?.name }}（稳定性 {{ ((chain.batch.product?.farmer?.stabilityScore || 0) * 100).toFixed(0) }}%）</el-descriptions-item>
          <el-descriptions-item label="供/可/售">{{ chain.batch.quantity }} / {{ chain.batch.availableQty }} / {{ chain.batch.soldQty }} 件</el-descriptions-item>
          <el-descriptions-item label="采摘窗口">{{ chain.batch.harvestDate }} ~ {{ chain.batch.harvestWindowEnd }}</el-descriptions-item>
          <el-descriptions-item label="检测报告">{{ chain.batch.testReportNo || '未上传' }}（{{ chain.batch.testReportExpiry || '-' }}）</el-descriptions-item>
          <el-descriptions-item label="坏果率">
            <span :style="{ color: chain.batch.defectRate >= 0.05 ? '#f56c6c' : '#67c23a' }">{{ (chain.batch.defectRate * 100).toFixed(1) }}%</span>
          </el-descriptions-item>
          <el-descriptions-item label="GMV">¥{{ chain.orderStats.gmv }}</el-descriptions-item>
          <el-descriptions-item label="售后退款">¥{{ chain.aftersalesStats.refund }}</el-descriptions-item>
          <el-descriptions-item label="温区/冷链">{{ chain.batch.product?.tempZone }}{{ chain.batch.product?.coldChainRequired ? ' · 需冷链' : '' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card shadow="never" style="margin-top: 14px">
        <el-timeline style="padding-left: 6px; margin-top: 8px">
          <!-- 1 选品质检 -->
          <el-timeline-item :type="chain.selections.length ? 'success' : 'info'" :hollow="!chain.selections.length" :timestamp="fmtTime(chain.batch.createdAt)" placement="top">
            <b>① 农户提交 → 选品质检</b>
            <div class="stage" v-if="chain.selections.length">
              <div v-for="s in chain.selections" :key="s.id" class="line">
                试吃评分 <el-tag size="small" :type="s.sampleTasteScore >= 7 ? 'success' : 'warning'">{{ s.sampleTasteScore }}/10</el-tag>
                {{ s.sampleNotes }} →
                <el-tag size="small" :type="s.decision === 'selected' ? 'success' : 'danger'">{{ s.decision === 'selected' ? '选品通过' : '淘汰' }}</el-tag>
                <span class="sub">{{ s.notes }}</span>
              </div>
            </div>
            <div v-else class="sub">等待运营选品</div>
          </el-timeline-item>

          <!-- 2 直播 -->
          <el-timeline-item :type="chain.livestreams.length ? 'primary' : 'info'" :hollow="!chain.livestreams.length" placement="top">
            <b>② 直播排期与执行</b>
            <div class="stage">
              <div v-for="l in chain.livestreams" :key="l.id" class="line">
                「{{ l.title }}」{{ l.anchorName }} · 价 ¥{{ l.price }}（券¥{{ l.couponAmount }}）· 销量
                <span :style="{ color: l.actualSales > l.estimatedSales ? '#f56c6c' : '#303133' }">{{ l.actualSales }}</span>/{{ l.estimatedSales }}
                <el-tag size="small" :type="l.status === 'live' ? 'danger' : 'info'">{{ liveText(l.status) }}</el-tag>
                <div class="sub">承诺口径：{{ l.promiseText || '未填写' }}</div>
              </div>
              <div v-if="!chain.livestreams.length" class="sub">尚未排播</div>
            </div>
          </el-timeline-item>

          <!-- 3 锁库 -->
          <el-timeline-item :type="chain.locks.length ? 'warning' : 'info'" :hollow="!chain.locks.length" placement="top">
            <b>③ 库存与包材锁定</b>
            <div class="stage">
              <div v-for="k in chain.locks" :key="k.id" class="line">
                {{ k.warehouseName }} 锁定 {{ k.lockedQty }} 件 · 包材 {{ k.packagingMaterial }} × {{ k.packagingQty }}
                <el-tag size="small" :type="{ locked: 'warning', consumed: 'success', released: 'info' }[k.status]">{{ { locked: '锁定中', consumed: '已消耗', released: '已释放' }[k.status] }}</el-tag>
              </div>
              <div v-if="!chain.locks.length" class="sub">无锁库记录</div>
            </div>
          </el-timeline-item>

          <!-- 4 订单发货 -->
          <el-timeline-item :type="chain.orderStats.count ? 'primary' : 'info'" :hollow="!chain.orderStats.count" placement="top">
            <b>④ 订单与发货</b>
            <div class="stage">
              <div class="line">
                订单 {{ chain.orderStats.count }} 笔 / {{ chain.orderStats.qty }} 件 · GMV ¥{{ chain.orderStats.gmv }}
              </div>
              <div class="line">
                发货任务 {{ chain.shippingStats.total }}：待发货 {{ chain.shippingStats.pending }} · 运输中 {{ chain.shippingStats.shipped }} · 已送达 {{ chain.shippingStats.delivered }} · 异常 {{ chain.shippingStats.exception }}
                <span v-if="chain.shippingStats.vehicleLate" style="color: #f56c6c">（冷链晚到 {{ chain.shippingStats.vehicleLate }} 单）</span>
              </div>
            </div>
          </el-timeline-item>

          <!-- 5 售后 -->
          <el-timeline-item :type="chain.aftersalesStats.total ? 'danger' : 'success'" :hollow="!chain.aftersalesStats.total" placement="top">
            <b>⑤ 售后工单（{{ chain.aftersalesStats.total }} 件，退款 ¥{{ chain.aftersalesStats.refund }}）</b>
            <div class="stage">
              <div v-for="t in chain.aftersales" :key="t.id" class="line">
                <el-tag size="small" :type="t.type === '坏果' ? 'danger' : 'warning'" effect="plain">{{ t.type }}</el-tag>
                {{ t.description }}
                <el-tag v-if="t.damageForm" size="small" type="danger" effect="plain">{{ t.damageForm }}{{ t.arrivalTemp != null ? `·${t.arrivalTemp}℃` : '' }}</el-tag>
                <el-tag v-if="t.photoEvidence" size="small" type="info" effect="plain">用户照片×{{ t.photoEvidence.split(',').length }}</el-tag>
                <el-tag size="small" :type="{ pending: 'warning', resolved: 'success', rejected: 'info' }[t.status]">{{ { pending: '待处理', resolved: '已解决', rejected: '已拒绝' }[t.status] }}</el-tag>
                <span v-if="Number(t.refundAmount) > 0" style="color: #f56c6c">-¥{{ t.refundAmount }}</span>
              </div>
              <div v-if="!chain.aftersales.length" class="sub">无售后工单</div>
            </div>
          </el-timeline-item>

          <!-- 6 结算 -->
          <el-timeline-item :type="chain.settlements.length ? 'success' : 'info'" :hollow="!chain.settlements.length" placement="top">
            <b>⑥ 农户结算</b>
            <div class="stage">
              <div v-for="s in chain.settlements" :key="s.id" class="line">
                订单 {{ s.orderCount }} 笔 · 应收 ¥{{ s.grossAmount }} − 农户承担 ¥{{ s.farmerDeduction ?? s.refundAmount }} =
                <b style="color: #67c23a">¥{{ s.netAmount }}</b>
                <el-tag size="small" :type="s.status === 'settled' ? 'success' : 'warning'">{{ s.status === 'settled' ? '已打款' : '待结算' }}</el-tag>
                <span v-if="Number(s.refundAmount) > Number(s.farmerDeduction || 0)" class="sub">（售后退款共 ¥{{ s.refundAmount }}，其中平台/物流/包装承担 ¥{{ (Number(s.refundAmount) - Number(s.farmerDeduction || 0)).toFixed(2) }}）</span>
              </div>
              <div v-if="!chain.settlements.length" class="sub">尚未生成结算单</div>
            </div>
          </el-timeline-item>

          <!-- 7 风险与反向决策 -->
          <el-timeline-item v-if="chain.risks.length || chain.decisions.length" type="danger" placement="top">
            <b>⑦ 链路风险与售后反向决策</b>
            <div class="stage">
              <div v-for="r in chain.risks" :key="'r' + r.id" class="line">
                <el-tag size="small" :type="r.level === 'critical' ? 'danger' : 'warning'">{{ riskTypes[r.type] || r.type }}</el-tag>
                {{ r.message }}
              </div>
              <div v-for="d in chain.decisions" :key="'d' + d.id" class="line">
                <el-tag size="small" type="primary" effect="dark">{{ decisionText(d.decisionType) }}</el-tag>
                {{ d.decision }}
              </div>
            </div>
          </el-timeline-item>

          <!-- 8 坏果预警与定责 -->
          <el-timeline-item v-if="(chain.defectAlerts || []).length" type="danger" placement="top">
            <b>⑧ 坏果率异常预警 · 冻结与定责复盘</b>
            <div class="stage">
              <div v-for="a in chain.defectAlerts" :key="'a' + a.id" class="line">
                <el-tag size="small" :type="{ open: 'danger', reviewing: 'warning', closed: 'success' }[a.status]">
                  {{ { open: '预警中(已冻结)', reviewing: '复盘中', closed: '已结案' }[a.status] }}
                </el-tag>
                {{ a.alertNo }}：坏果率 {{ (a.defectRate * 100).toFixed(1) }}%（{{ a.defectCount }}/{{ a.soldQty }}），冻结剩余库存 {{ a.frozenQty }} 件
                <template v-if="a.rootCause && a.rootCause !== 'undetermined'">
                  → 定责 <b>{{ causeText(a.rootCause) }}</b>
                  <span v-if="a.newPackaging">，后续换「{{ a.newPackaging }}」</span>
                  <span v-if="Number(a.farmerDeductionAmount) > 0">，结算扣农户 ¥{{ a.farmerDeductionAmount }}</span>
                </template>
                <el-button link type="primary" size="small" @click="$router.push('/defect-alerts')">去复盘</el-button>
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
      </el-card>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import request from '../api/request';

const route = useRoute();
const chain = ref(null);
const loading = ref(false);
const riskTypes = ref({});

function batchText(s) { return { pending: '待选品', qc_passed: '质检通过', qc_failed: '质检不合格', locked: '已锁库', on_sale: '直播中', closed: '已收官' }[s] || s; }
function batchTag(s) { return { pending: 'warning', qc_passed: 'success', qc_failed: 'danger', locked: 'primary', on_sale: 'danger', closed: 'info' }[s] || 'info'; }
function liveText(s) { return { planned: '已排期', locked: '已锁库', live: '直播中', ended: '已结束', cancelled: '已取消' }[s] || s; }
function decisionText(t) { return { continue_farmer: '继续选择该农户', drop_farmer: '暂停该农户排播', adjust_anchor: '调整主播口径', reduce_presale: '降低预售量', brand_notice: '品牌风险说明' }[t] || t; }
function causeText(t) { return { packaging_pressure: '包装承压不足', harvest_ripeness: '农户采摘成熟度过高', logistics_temp: '物流温区/时效异常', mixed: '多因素叠加', undetermined: '暂未认定', none: '排除批次性问题' }[t] || t; }
function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 16) : ''; }

onMounted(async () => {
  loading.value = true;
  try {
    chain.value = await request.get(`/analytics/chain/${route.params.batchId}`);
    riskTypes.value = await request.get('/risks/types');
  } finally { loading.value = false; }
});
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.stage { margin-top: 6px; }
.line { font-size: 13px; color: #606266; padding: 3px 0; line-height: 1.6; }
.sub { font-size: 12px; color: #909399; }
</style>
