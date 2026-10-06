<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>坏果率异常预警</span>
          <div>
            <el-radio-group v-model="filter" size="small" @change="load">
              <el-radio-button value="">全部</el-radio-button>
              <el-radio-button value="open">已冻结</el-radio-button>
              <el-radio-button value="reviewing">定责中</el-radio-button>
              <el-radio-button value="responsibility_set">已定责</el-radio-button>
              <el-radio-button value="closed">已闭环</el-radio-button>
            </el-radio-group>
            <el-button v-if="canCreate" size="small" type="primary" style="margin-left: 8px" :icon="Plus" @click="openCreate">按批次立项</el-button>
          </div>
        </div>
      </template>
      <el-table :data="list" size="small" v-loading="loading">
        <el-table-column prop="alertNo" label="预警单号" width="150" />
        <el-table-column label="采摘批次 / 商品" min-width="200">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="$router.push(`/chain/${row.batchId}`)">{{ row.batchNo }}</el-button>
            <div class="sub">{{ row.productName }} · {{ row.farmerName }}</div>
          </template>
        </el-table-column>
        <el-table-column label="坏果率" width="110">
          <template #default="{ row }">
            <span :style="{ color: row.defectRate >= 0.1 ? '#f56c6c' : '#e6a23c', fontWeight: 700 }">{{ (row.defectRate * 100).toFixed(1) }}%</span>
            <div class="sub">{{ row.defectCount }}/{{ row.soldQty }} 单</div>
          </template>
        </el-table-column>
        <el-table-column label="剩余库存" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.frozen" size="small" type="danger" effect="dark">已冻结 {{ row.frozenQty }}</el-tag>
            <span v-else class="sub">未冻结</span>
          </template>
        </el-table-column>
        <el-table-column label="责任归属" width="150">
          <template #default="{ row }">
            <el-tag size="small" :type="respTag(row.responsibility)" effect="plain">{{ respText(row.responsibility) }}</el-tag>
            <div v-if="row.replacementPackaging" class="sub">换：{{ row.replacementPackaging }}</div>
          </template>
        </el-table-column>
        <el-table-column label="农户扣款" width="100">
          <template #default="{ row }">
            <span v-if="Number(row.farmerDeduction) > 0" style="color: #f56c6c">¥{{ row.farmerDeduction }}</span>
            <span v-else class="sub">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTag(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="openDetail(row)">分析/处置</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!list.length" description="暂无坏果预警：坏果工单处理后坏果率达 5% 自动形成" :image-size="80" />
    </el-card>

    <!-- 立项 -->
    <el-dialog v-model="createDlg" title="按采摘批次形成坏果预警" width="460px">
      <el-alert type="warning" :closable="false" title="预警形成后将立即冻结同批次剩余库存（可售+锁库未消耗），并生成风险事件与客服优先队列" style="margin-bottom: 12px" />
      <el-form label-width="90px">
        <el-form-item label="采摘批次" required>
          <el-select v-model="createBatchId" filterable placeholder="选择批次" style="width: 100%">
            <el-option v-for="b in batches" :key="b.id" :value="b.id" :label="`${b.batchNo} · ${b.product?.name}（坏果率 ${(b.defectRate * 100).toFixed(1)}%）`" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">形成预警并冻结</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailDlg" size="72%" :title="detail ? `坏果预警 ${detail.alert.alertNo}` : ''">
      <div v-if="detail" v-loading="detailLoading">
        <el-alert
          :type="detail.alert.status === 'closed' ? 'success' : 'error'"
          :closable="false"
          style="margin-bottom: 12px"
        >
          <template #title>
            <b>{{ a.batchNo }} · {{ a.productName }}（{{ a.farmerName }}）</b>
            坏果率 <b>{{ (detail.alert.defectRate * 100).toFixed(1) }}%</b>（{{ detail.alert.defectCount }}/{{ detail.alert.soldQty }}）
            <el-tag size="small" :type="a.frozen ? 'danger' : 'success'" style="margin-left: 8px">{{ a.frozen ? `库存冻结中（${detail.alert.frozenQty} 件）` : '库存已放行' }}</el-tag>
            <el-tag size="small" :type="respTag(detail.alert.responsibility)" style="margin-left: 6px">{{ respText(detail.alert.responsibility) }}</el-tag>
            <span v-if="a.replacementPackaging" class="sub" style="margin-left: 8px">后续发货更换：{{ a.replacementPackaging }}</span>
          </template>
        </el-alert>

        <el-tabs v-model="tab">
          <!-- 五维分析 -->
          <el-tab-pane label="① 五维归因分析" name="analysis">
            <el-alert v-for="(h, i) in analysis.hints" :key="i" :title="h" type="warning" :closable="false" show-icon style="margin-bottom: 8px" />
            <el-alert
              :title="`系统责任倾向：${respText(analysis.suggestedResponsibility)}（仅供质检参考，最终以出库/到货照片与温区比对定责）`"
              :type="analysis.suggestedResponsibility === 'pending' ? 'info' : 'warning'"
              :closable="false" style="margin-bottom: 12px"
            />

            <el-row :gutter="12">
              <el-col :span="12">
                <el-card shadow="never" header="按包装方式">
                  <el-table :data="analysis.byPackaging" size="small">
                    <el-table-column prop="key" label="包装方式" min-width="120" show-overflow-tooltip />
                    <el-table-column label="坏果/发货" width="90">
                      <template #default="{ row }">{{ row.defect }}/{{ row.total }}</template>
                    </el-table-column>
                    <el-table-column label="坏果率" width="80">
                      <template #default="{ row }">
                        <span :style="{ color: row.defectRate >= 0.05 ? '#f56c6c' : '#303133' }">{{ (row.defectRate * 100).toFixed(1) }}%</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="主要表象" min-width="110">
                      <template #default="{ row }">{{ topSymptom(row.symptoms) }}</template>
                    </el-table-column>
                  </el-table>
                  <div class="sub" style="margin-top: 6px">商品耐压等级：{{ a.pressureResistance }}；原包装：{{ a.productPackaging }}</div>
                </el-card>
              </el-col>
              <el-col :span="12">
                <el-card shadow="never" header="按物流线路 / 温区">
                  <el-table :data="analysis.byRoute" size="small" max-height="180">
                    <el-table-column prop="key" label="物流线路" min-width="170" show-overflow-tooltip />
                    <el-table-column label="坏果/发货" width="90">
                      <template #default="{ row }">{{ row.defect }}/{{ row.total }}</template>
                    </el-table-column>
                    <el-table-column label="坏果率" width="80">
                      <template #default="{ row }">{{ (row.defectRate * 100).toFixed(1) }}%</template>
                    </el-table-column>
                  </el-table>
                  <el-table :data="analysis.byTempZone" size="small" style="margin-top: 8px">
                    <el-table-column prop="key" label="温区" width="90" />
                    <el-table-column label="坏果/发货" width="100">
                      <template #default="{ row }">{{ row.defect }}/{{ row.total }}</template>
                    </el-table-column>
                    <el-table-column label="途中超温" width="90">
                      <template #default="{ row }">
                        <el-tag v-if="row.transitAbnormal" size="small" type="danger">{{ row.transitAbnormal }} 单</el-tag>
                        <span v-else class="sub">无</span>
                      </template>
                    </el-table-column>
                  </el-table>
                </el-card>
              </el-col>
            </el-row>

            <el-card shadow="never" style="margin-top: 12px" header="按到货城市与到货温度">
              <el-table :data="analysis.byCity" size="small">
                <el-table-column prop="key" label="到货城市" width="100" />
                <el-table-column label="到货温度" width="150">
                  <template #default="{ row }">
                    <el-tag size="small" :type="(row.arrivalTemp ?? 0) >= 30 ? 'danger' : (row.arrivalTemp ?? 0) >= 25 ? 'warning' : 'info'">
                      {{ row.arrivalTemp != null ? row.arrivalTemp + '℃' : '—' }} {{ row.tempBand }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="坏果/送达" width="100">
                  <template #default="{ row }">{{ row.defect }}/{{ row.total }}</template>
                </el-table-column>
                <el-table-column label="坏果率" width="90">
                  <template #default="{ row }">
                    <span :style="{ color: row.defectRate >= 0.05 ? '#f56c6c' : '#303133' }">{{ (row.defectRate * 100).toFixed(1) }}%</span>
                  </template>
                </el-table-column>
                <el-table-column prop="refund" label="赔付" width="80">
                  <template #default="{ row }">¥{{ row.refund }}</template>
                </el-table-column>
              </el-table>
            </el-card>

            <el-card shadow="never" style="margin-top: 12px" header="坏果表象（区分承压 / 成熟度 / 温区责任）">
              <div v-for="s in analysis.bySymptom" :key="s.symptom" class="symptom-row">
                <el-tag size="small" :type="symptomTag(s.pointsTo)">{{ s.symptom }}</el-tag>
                <span class="symptom-count">× {{ s.count }}</span>
                <span class="sub">→ {{ symptomPoints(s.pointsTo) }}</span>
              </div>
            </el-card>

            <el-card shadow="never" style="margin-top: 12px" :header="`用户拍照证据（${analysis.evidence.length} 份）`">
              <div class="evidence-grid">
                <div v-for="e in analysis.evidence" :key="e.ticketId" class="evidence-card">
                  <el-image :src="e.photos[0]" :preview-src-list="e.photos" fit="cover" class="evidence-img" />
              <div class="evidence-meta">
                    <div>{{ e.ticketNo }} · {{ e.city }} {{ e.arrivalTemp != null ? e.arrivalTemp + '℃' : '' }}</div>
                    <div class="sub">{{ e.symptom }} · {{ e.packagingType }}</div>
                    <div class="sub">{{ e.route }}</div>
                  </div>
                </div>
              </div>
              <el-empty v-if="!analysis.evidence.length" description="该批次坏果工单暂无用户拍照证据" :image-size="60" />
            </el-card>
          </el-tab-pane>

          <!-- 客服优先 -->
          <el-tab-pane label="② 客服优先处理" name="priority">
            <el-alert type="error" :closable="false" style="margin-bottom: 10px"
              title="命中同城市 / 同物流线路 / 同包装方式的用户优先处理，并对高温城市同线路已送达客户主动回访" />
            <div class="feature-tags">
              <span>命中城市：</span>
              <el-tag v-for="c in priority.features.cities" :key="c" size="small" type="danger" effect="plain" style="margin-right: 6px">{{ c }}</el-tag>
              <span style="margin-left: 10px">命中线路：</span>
              <el-tag v-for="r in priority.features.routes" :key="r" size="small" type="warning" effect="plain" style="margin-right: 6px">同线路</el-tag>
              <span style="margin-left: 10px">命中包装：</span>
              <el-tag v-for="p in priority.features.packaging" :key="p" size="small" type="info" effect="plain" style="margin-right: 6px">{{ p }}</el-tag>
            </div>

            <el-card shadow="never" style="margin-top: 10px" :header="`待处理优先工单（${priority.pendingTickets.length}）`">
              <el-table :data="priority.pendingTickets" size="small">
                <el-table-column prop="ticketNo" label="工单号" width="140" />
                <el-table-column label="客户" min-width="130">
                  <template #default="{ row }">{{ row.customerName }} · {{ row.phone }}<div class="sub">{{ row.city }}</div></template>
                </el-table-column>
                <el-table-column label="到货温度" width="90">
                  <template #default="{ row }">{{ row.arrivalTemp != null ? row.arrivalTemp + '℃' : '—' }}</template>
                </el-table-column>
                <el-table-column prop="symptom" label="坏果表象" width="100" />
                <el-table-column label="优先原因" min-width="180">
                  <template #default="{ row }">
                    <el-tag v-for="r in row.priorityReasons" :key="r" size="small" type="danger" effect="plain" style="margin-right: 4px">{{ r }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="证据" width="70">
                  <template #default="{ row }">
                    <el-image v-if="row.evidencePhotos" :src="row.evidencePhotos.split(',')[0]" :preview-src-list="row.evidencePhotos.split(',')" fit="cover" class="thumb" />
                    <span v-else class="sub">无</span>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty v-if="!priority.pendingTickets.length" description="暂无命中优先队列的待处理工单" :image-size="60" />
            </el-card>

            <el-card shadow="never" style="margin-top: 12px" :header="`主动回访名单（${priority.proactiveCustomers.length}，同线路/同高温城市已送达未报坏果）`">
              <el-table :data="priority.proactiveCustomers" size="small" max-height="320">
                <el-table-column prop="orderNo" label="订单号" width="150" />
                <el-table-column label="客户" min-width="130">
                  <template #default="{ row }">{{ row.customerName }} · {{ row.phone }}<div class="sub">{{ row.city }}</div></template>
                </el-table-column>
                <el-table-column label="到货温度" width="90">
                  <template #default="{ row }">{{ row.arrivalTemp != null ? row.arrivalTemp + '℃' : '—' }}</template>
                </el-table-column>
                <el-table-column prop="packagingType" label="包装" min-width="110" show-overflow-tooltip />
                <el-table-column label="回访原因" min-width="170">
                  <template #default="{ row }">
                    <el-tag v-for="r in row.priorityReasons" :key="r" size="small" type="warning" effect="plain" style="margin-right: 4px">{{ r }}</el-tag>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty v-if="!priority.proactiveCustomers.length" description="暂无需要主动回访的客户" :image-size="60" />
            </el-card>
          </el-tab-pane>

          <!-- 质检复盘与定责 -->
          <el-tab-pane label="③ 质检复盘 · 定责" name="review">
            <el-card shadow="never" header="出库照片 / 到货照片 / 物流温区比对">
              <el-table :data="detail.evidenceTasks" size="small" max-height="300">
                <el-table-column prop="taskNo" label="发货任务" width="130" />
                <el-table-column label="出库照片" width="92">
                  <template #default="{ row }">
                    <el-image v-if="row.outboundPhoto" :src="row.outboundPhoto" :preview-src-list="[row.outboundPhoto]" fit="cover" class="thumb" />
                    <span v-else class="sub">未拍</span>
                  </template>
                </el-table-column>
                <el-table-column label="到货照片" width="92">
                  <template #default="{ row }">
                    <el-image v-if="row.arrivalPhoto" :src="row.arrivalPhoto" :preview-src-list="[row.arrivalPhoto, row.outboundPhoto].filter(Boolean)" fit="cover" class="thumb" />
                    <span v-else class="sub">未拍</span>
                  </template>
                </el-table-column>
                <el-table-column label="温区/运输峰值" width="130">
                  <template #default="{ row }">
                    {{ row.tempZone }}
                    <el-tag v-if="isTempAbnormal(row)" size="small" type="danger">峰值 {{ row.transitMaxTemp }}℃ 超温</el-tag>
                    <div v-else class="sub">峰值 {{ row.transitMaxTemp }}℃ 达标</div>
                  </template>
                </el-table-column>
                <el-table-column label="到货城市温度" width="100">
                  <template #default="{ row }">{{ row.arrivalCityTemp != null ? row.arrivalCityTemp + '℃' : '—' }}</template>
                </el-table-column>
                <el-table-column prop="route" label="线路/包装" min-width="160" show-overflow-tooltip>
                  <template #default="{ row }"><div>{{ row.route }}</div><div class="sub">{{ row.packagingType }}</div></template>
                </el-table-column>
              </el-table>
              <el-empty v-if="!detail.evidenceTasks.length" description="该批次发货任务暂无出库/到货照片与温区记录" :image-size="60" />
            </el-card>

            <el-card v-if="canReview && detail.alert.status !== 'closed'" shadow="never" style="margin-top: 12px" header="提交复盘比对结论">
              <el-form label-width="110px">
                <el-form-item label="出库照片核查"><el-input v-model="reviewForm.outboundFindings" placeholder="如：果面完好、硬度正常、装箱规整 / 出库即偏熟" /></el-form-item>
                <el-form-item label="到货照片核查"><el-input v-model="reviewForm.arrivalFindings" placeholder="如：箱体塌陷、多果压伤 / 盒完好但整盒过熟流汁" /></el-form-item>
                <el-form-item label="物流温区核查"><el-input v-model="reviewForm.tempzoneFindings" placeholder="如：冷藏 2~8℃ 达标 / 途中超温至 14℃ / 末端高温" /></el-form-item>
                <el-form-item label="责任建议">
                  <el-select v-model="reviewForm.responsibility" style="width: 100%">
                    <el-option value="pending" label="暂不定论（继续核查）" />
                    <el-option value="packaging" label="包装承压问题" />
                    <el-option value="ripeness" label="农户采摘成熟度过高" />
                    <el-option value="logistics" label="物流温区异常" />
                    <el-option value="mixed" label="多方共同责任" />
                    <el-option value="none" label="证据不足" />
                  </el-select>
                </el-form-item>
                <el-form-item label="备注"><el-input v-model="reviewForm.remark" type="textarea" :rows="2" /></el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="saving" @click="submitReview">提交复盘</el-button>
                </el-form-item>
              </el-form>
            </el-card>

            <el-card v-if="canReview && detail.alert.status !== 'closed'" shadow="never" style="margin-top: 12px" header="责任判定与处置（形成最终结论）">
              <el-radio-group v-model="respForm.responsibility" class="resp-radio">
                <el-radio value="packaging" border>包装承压问题 → 后续换包装，平台承担赔付</el-radio>
                <el-radio value="ripeness" border>采摘成熟度过高 → 坏果赔付从农户结算扣除</el-radio>
                <el-radio value="logistics" border>物流温区异常 → 平台/物流承担，维持冻结</el-radio>
                <el-radio value="mixed" border>多方共同责任 → 按比例分摊</el-radio>
                <el-radio value="none" border>证据不足 → 解除冻结</el-radio>
              </el-radio-group>
              <el-form label-width="110px" style="margin-top: 12px">
                <el-form-item v-if="respForm.responsibility === 'packaging'" label="更换包装方式" required>
                  <el-select v-model="respForm.replacementPackaging" filterable allow-create style="width: 100%" placeholder="选择或输入新包装">
                    <el-option v-for="p in replacementOptions" :key="p" :value="p" :label="p" />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="respForm.responsibility === 'mixed'" label="农户承担比例">
                  <el-slider v-model="farmerSharePct" show-input :min="0" :max="100" />
                </el-form-item>
                <el-form-item label="定责说明"><el-input v-model="respForm.responsibilityNote" type="textarea" :rows="2" /></el-form-item>
                <el-form-item>
                  <el-button type="danger" :loading="saving" @click="submitResponsibility">确认定责处置</el-button>
                </el-form-item>
              </el-form>
              <el-alert type="info" :closable="false"
                title="包装承压：换包装后剩余库存解冻放行、赔付不扣农户；成熟度过高：剩余库存维持冻结，赔付计入农户扣款，结算时自动扣减；物流/多方：按结论分摊。" />
            </el-card>

            <el-card shadow="never" style="margin-top: 12px" header="复盘记录">
              <el-timeline>
                <el-timeline-item v-for="r in detail.reviews" :key="r.id" :timestamp="fmtTime(r.createdAt)" placement="top">
                  <el-tag size="small" :type="respTag(r.responsibility)">{{ respText(r.responsibility) }}</el-tag>
                  <div class="review-line" v-if="r.outboundFindings"><b>出库：</b>{{ r.outboundFindings }}</div>
                  <div class="review-line" v-if="r.arrivalFindings"><b>到货：</b>{{ r.arrivalFindings }}</div>
                  <div class="review-line" v-if="r.tempzoneFindings"><b>温区：</b>{{ r.tempzoneFindings }}</div>
                  <div class="review-line sub" v-if="r.remark">{{ r.remark }}</div>
                </el-timeline-item>
              </el-timeline>
              <el-empty v-if="!detail.reviews.length" description="暂无复盘记录" :image-size="60" />
            </el-card>

            <el-card v-if="canReview && ['responsibility_set'].includes(detail.alert.status)" shadow="never" style="margin-top: 12px">
              <el-button type="success" @click="closeAlert">闭环预警（维持当前冻结/扣款结论）</el-button>
            </el-card>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import request from '../api/request';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const canCreate = computed(() => ['operator', 'aftersales', 'admin'].includes(auth.role));
const canReview = computed(() => ['operator', 'warehouse', 'admin'].includes(auth.role));

const list = ref([]);
const batches = ref([]);
const filter = ref('');
const loading = ref(false);
const saving = ref(false);
const createDlg = ref(false);
const createBatchId = ref(null);

const detailDlg = ref(false);
const detailLoading = ref(false);
const detail = ref(null);
const tab = ref('analysis');
const priority = ref({ features: { cities: [], routes: [], packaging: [] }, pendingTickets: [], proactiveCustomers: [] });

const reviewForm = reactive({ outboundFindings: '', arrivalFindings: '', tempzoneFindings: '', responsibility: 'pending', remark: '' });
const respForm = reactive({ responsibility: 'packaging', replacementPackaging: '', responsibilityNote: '' });
const farmerSharePct = ref(50);

const replacementOptions = ['加厚瓦楞纸箱+硬塑托', '珍珠棉单果独立包装', '气柱袋+加厚泡沫箱', 'EPE缓冲内衬+天地盖纸盒', '吸塑盒+外箱加固'];

const a = computed(() => detail.value?.analysis?.batch || {});
const analysis = computed(() => detail.value?.analysis || { hints: [], byPackaging: [], byRoute: [], byTempZone: [], byCity: [], bySymptom: [], evidence: [] });

function statusText(s) { return { open: '已形成·冻结', reviewing: '质检定责中', responsibility_set: '已定责', closed: '已闭环' }[s] || s; }
function statusTag(s) { return { open: 'danger', reviewing: 'warning', responsibility_set: 'primary', closed: 'success' }[s] || 'info'; }
function respText(r) { return { pending: '待定责', packaging: '包装承压', ripeness: '采摘成熟度过高', logistics: '物流温区', mixed: '多方共同', none: '证据不足' }[r] || r; }
function respTag(r) { return { pending: 'info', packaging: 'warning', ripeness: 'danger', logistics: 'warning', mixed: 'danger', none: 'info' }[r] || 'info'; }
function symptomTag(p) { return { packaging: 'warning', ripeness: 'danger', logistics: 'warning', unknown: 'info' }[p] || 'info'; }
function symptomPoints(p) { return { packaging: '指向包装承压（压伤/磕碰）', ripeness: '指向采摘成熟度过高（过熟）', logistics: '指向温区/温度（霉变/冻伤/脱水）', unknown: '需结合照片进一步判断' }[p] || p; }
function topSymptom(map) {
  if (!map) return '—';
  const e = Object.entries(map).sort((x, y) => y[1] - x[1])[0];
  return e ? `${e[0]} ×${e[1]}` : '—';
}
function isTempAbnormal(row) {
  if (row.transitMaxTemp == null) return false;
  if (row.tempZone === '冷藏') return row.transitMaxTemp > 10;
  if (row.tempZone === '冷冻') return row.transitMaxTemp > -10;
  return row.transitMaxTemp > 35;
}
function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 16) : ''; }

async function load() {
  loading.value = true;
  try {
    list.value = await request.get('/defect-alerts', { params: filter.value ? { status: filter.value } : {} });
  } finally { loading.value = false; }
}

async function openCreate() {
  batches.value = await request.get('/batches');
  createBatchId.value = null;
  createDlg.value = true;
}
async function create() {
  if (!createBatchId.value) return ElMessage.warning('请选择批次');
  saving.value = true;
  try {
    await request.post('/defect-alerts', { batchId: createBatchId.value });
    ElMessage.success('坏果预警已形成，同批次剩余库存已冻结');
    createDlg.value = false;
    load();
  } finally { saving.value = false; }
}

async function openDetail(row) {
  detailDlg.value = true;
  tab.value = 'analysis';
  detailLoading.value = true;
  try {
    detail.value = await request.get(`/defect-alerts/${row.id}`);
    Object.assign(reviewForm, { outboundFindings: '', arrivalFindings: '', tempzoneFindings: '', responsibility: 'pending', remark: '' });
    const r = detail.value.alert;
    Object.assign(respForm, { responsibility: r.responsibility === 'pending' ? 'packaging' : r.responsibility, replacementPackaging: r.replacementPackaging || '', responsibilityNote: r.responsibilityNote || '' });
    await loadPriority(row.id);
  } finally { detailLoading.value = false; }
}

async function loadPriority(id) {
  try { priority.value = await request.get(`/defect-alerts/${id}/priority`); } catch { /* ignore */ }
}

async function submitReview() {
  saving.value = true;
  try {
    await request.post(`/defect-alerts/${detail.value.alert.id}/reviews`, reviewForm);
    ElMessage.success('复盘结论已提交');
    detail.value = await request.get(`/defect-alerts/${detail.value.alert.id}`);
  } finally { saving.value = false; }
}

async function submitResponsibility() {
  if (respForm.responsibility === 'packaging' && !respForm.replacementPackaging) {
    return ElMessage.warning('定责为包装承压时必须填写更换的包装方式');
  }
  saving.value = true;
  try {
    const payload = {
      responsibility: respForm.responsibility,
      replacementPackaging: respForm.replacementPackaging || undefined,
      responsibilityNote: respForm.responsibilityNote || undefined,
      farmerShare: farmerSharePct.value / 100,
    };
    const r = await request.post(`/defect-alerts/${detail.value.alert.id}/responsibility`, payload);
    ElMessage.success(`已定责：${respText(r.responsibility)}`);
    detail.value = await request.get(`/defect-alerts/${detail.value.alert.id}`);
    load();
  } finally { saving.value = false; }
}

async function closeAlert() {
  await request.post(`/defect-alerts/${detail.value.alert.id}/close`, {});
  ElMessage.success('预警已闭环');
  detail.value = await request.get(`/defect-alerts/${detail.value.alert.id}`);
  load();
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.sub { font-size: 12px; color: #909399; }
.feature-tags { font-size: 13px; color: #606266; line-height: 2.2; }
.symptom-row { padding: 6px 0; display: flex; align-items: center; gap: 8px; }
.symptom-count { font-weight: 700; color: #f56c6c; }
.evidence-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.evidence-card { border: 1px solid #ebeef5; border-radius: 8px; overflow: hidden; }
.evidence-img { width: 100%; height: 120px; display: block; }
.evidence-meta { padding: 6px 8px; font-size: 12px; color: #303133; line-height: 1.6; }
.thumb { width: 64px; height: 48px; border-radius: 4px; }
.resp-radio { display: flex; flex-direction: column; gap: 10px; }
.review-line { font-size: 13px; color: #606266; padding: 2px 0; }
:deep(.el-card__header) { font-weight: 600; font-size: 14px; padding: 10px 14px; }
</style>
