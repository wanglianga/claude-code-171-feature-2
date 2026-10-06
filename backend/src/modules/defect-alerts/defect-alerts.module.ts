import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IsIn, IsNotEmpty, IsOptional } from 'class-validator';
import {
  DefectAlert,
  DEFECT_CAUSES,
  DEFECT_ACTIONS,
} from '../../entities/defect-alert.entity';
import { DefectFollowup } from '../../entities/defect-followup.entity';
import { Batch } from '../../entities/batch.entity';
import { Product } from '../../entities/product.entity';
import { Order } from '../../entities/order.entity';
import { ShippingTask } from '../../entities/shipping-task.entity';
import { Aftersale } from '../../entities/aftersale.entity';
import { Roles } from '../../common/decorators';
import { ReqUser } from '../../common/req-user.decorator';
import { RisksService } from '../risks/risks.module';
import { SettlementsModule, SettlementsService } from '../settlements/settlements.module';

const ALERT_RATE = 0.05; // 坏果率预警线 5%
const TEMP_LIMIT: Record<string, number> = { 冷藏: 10, 冷冻: -5, 常温: 30 };

class ReviewDto {
  @IsIn(Object.keys(DEFECT_CAUSES))
  rootCause: string;

  @IsIn(['farmer', 'platform', 'logistics', 'shared'])
  responsibleParty: string;

  @IsIn(Object.keys(DEFECT_ACTIONS))
  actionType: string;

  @IsOptional() newPackaging?: string;
  @IsOptional() farmerDeductionAmount?: number;
  @IsOptional() conclusion?: string;
}

class FollowupDto {
  @IsIn(['pending', 'processing', 'done'])
  status: string;

  @IsOptional() note?: string;
}

@Injectable()
export class DefectAlertsService {
  constructor(
    @InjectRepository(DefectAlert) private alerts: Repository<DefectAlert>,
    @InjectRepository(DefectFollowup) private followups: Repository<DefectFollowup>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(ShippingTask) private tasks: Repository<ShippingTask>,
    @InjectRepository(Aftersale) private aftersales: Repository<Aftersale>,
    private risks: RisksService,
    private settlements: SettlementsService,
  ) {}

  /**
   * 坏果率越线 → 生成预警、冻结同批次剩余库存、生成客服优先名单
   * 幂等：同批次存在 open/reviewing 预警时不重复生成
   */
  async triggerForBatch(batchId: number, opts: { force?: boolean } = {}): Promise<DefectAlert | null> {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch) return null;
    const exist = await this.alerts.findOne({
      where: { batchId, status: In(['open', 'reviewing']) },
      order: { id: 'DESC' },
    });
    if (exist) return exist;

    const soldQty = batch.soldQty;
    if (soldQty <= 0) return null;
    const defectTickets = await this.aftersales.find({
      where: { batchId, type: '坏果', status: 'resolved' },
    });
    const rate = defectTickets.length / soldQty;
    if (!opts.force && rate < ALERT_RATE) return null;

    const product = batch.product || (await this.products.findOne({ where: { id: batch.productId } }));
    const dimension = await this.buildDimension(batchId, soldQty, defectTickets);
    const avgDays = await this.harvestToDeliveryDays(batch);
    const breachRate = await this.tempBreachRate(batchId, product.tempZone);

    // ① 冻结同批次剩余库存（预警 ID 在保存后回填）
    const frozenQty = Math.max(0, batch.availableQty);
    batch.frozenByAlert = true;
    batch.frozenAlertId = null;
    await this.batches.save(batch);

    const alert = this.alerts.create({
      alertNo: `DA${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
      batchId,
      status: 'open',
      defectRate: Math.round(rate * 10000) / 10000,
      defectCount: defectTickets.length,
      soldQty,
      frozenQty,
      packagingType: product.packagingType,
      tempZone: product.tempZone,
      harvestToDeliveryDays: avgDays,
      tempBreachRate: breachRate,
      dimension,
      rootCause: 'undetermined',
      farmerDeductionAmount: 0 as any,
    });
    const saved = await this.alerts.save(alert);
    // 回填冻结引用
    batch.frozenAlertId = saved.id;
    await this.batches.save(batch);

    await this.risks.emit(
      'defect_alert',
      rate >= 0.1 ? 'critical' : 'warning',
      `坏果预警 ${saved.alertNo}：批次 ${batch.batchNo}（${product.name}）坏果赔付集中出现，坏果率 ${(rate * 100).toFixed(1)}%（${defectTickets.length}/${soldQty}），已冻结同批次剩余库存 ${frozenQty} 件，请按包装/线路/城市温度/拍照证据复盘`,
      batchId,
    );

    await this.buildFollowups(saved, batchId, product.packagingType, defectTickets);
    return saved;
  }

  /** 手动扫描：坏果率越线且无进行中预警的在售/锁定批次 */
  async scanAll() {
    const batches = await this.batches.find({
      where: { status: In(['on_sale', 'locked', 'qc_passed']) },
    });
    const created: DefectAlert[] = [];
    for (const b of batches) {
      if (b.defectRate >= ALERT_RATE) {
        const a = await this.triggerForBatch(b.id);
        if (a) created.push(a);
      }
    }
    return { scanned: created.length, alerts: created.map((a) => a.alertNo) };
  }

  async list(query: any) {
    const qb = this.alerts
      .createQueryBuilder('da')
      .leftJoinAndMapOne('da.batch', Batch, 'b', 'b.id = da.batch_id')
      .leftJoinAndMapOne('b.product', Product, 'p', 'p.id = b.product_id')
      .orderBy('da.id', 'DESC')
      .limit(100);
    if (query.status) qb.andWhere('da.status = :st', { st: query.status });
    if (query.batchId) qb.andWhere('da.batch_id = :bid', { bid: +query.batchId });
    return qb.getMany();
  }

  async detail(id: number) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('坏果预警不存在');
    const followups = await this.followups.find({
      where: { alertId: id },
      order: { priorityScore: 'DESC', id: 'ASC' },
      take: 300,
    });
    const orderIds = [...new Set(followups.map((f) => f.orderId))];
    const orders = orderIds.length
      ? await this.orders.find({ where: { id: In(orderIds) } })
      : [];
    const tasks = orderIds.length
      ? await this.tasks.find({ where: { orderId: In(orderIds) } })
      : [];
    const ticketIds = followups.map((f) => f.aftersaleId).filter(Boolean);
    const tickets = ticketIds.length
      ? await this.aftersales.find({ where: { id: In(ticketIds) } })
      : [];
    const omap = new Map(orders.map((o) => [o.id, o]));
    const tmap = new Map(tasks.map((t) => [t.orderId, t]));
    const amap = new Map(tickets.map((t) => [t.id, t]));
    const followupRows = followups.map((f) => ({
      ...f,
      order: omap.get(f.orderId) || null,
      task: tmap.get(f.orderId) || null,
      ticket: f.aftersaleId ? amap.get(f.aftersaleId) || null : null,
    }));

    // 相关坏果工单（含用户照片/城市温度/损伤形态）
    const defectTickets = await this.aftersales.find({
      where: { batchId: alert.batchId, type: '坏果' },
      order: { id: 'ASC' },
    });
    const dOrderIds = [...new Set(defectTickets.map((t) => t.orderId))];
    const dOrders = dOrderIds.length
      ? await this.orders.find({ where: { id: In(dOrderIds) } })
      : [];
    const dTasks = dOrderIds.length
      ? await this.tasks.find({ where: { orderId: In(dOrderIds) } })
      : [];
    const dOmap = new Map(dOrders.map((o) => [o.id, o]));
    const dTmap = new Map(dTasks.map((t) => [t.orderId, t]));
    const ticketRows = defectTickets.map((t) => ({
      ...t,
      order: dOmap.get(t.orderId) || null,
      task: dTmap.get(t.orderId) || null,
      photos: String(t.photoEvidence || '').split(',').filter(Boolean),
    }));

    const batch = await this.batches.findOne({ where: { id: alert.batchId } });
    const product = await this.products.findOne({ where: { id: batch.productId } });
    return {
      alert,
      batch,
      product,
      causes: DEFECT_CAUSES,
      actions: DEFECT_ACTIONS,
      followups: followupRows,
      defectTickets: ticketRows,
    };
  }

  /** 质检查验出库照片/到货照片/温区后定责 */
  async review(id: number, dto: ReviewDto, user: any) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('坏果预警不存在');
    if (alert.status === 'closed') throw new BadRequestException('预警已结案');
    alert.rootCause = dto.rootCause;
    alert.responsibleParty = dto.responsibleParty;
    alert.actionType = dto.actionType;
    alert.conclusion = dto.conclusion || null;
    alert.reviewedBy = user.sub;
    alert.reviewedAt = new Date();
    alert.status = 'reviewing';

    const deduct = ['deduct_farmer', 'both'].includes(dto.actionType);
    const changePkg = ['change_packaging', 'both'].includes(dto.actionType);
    if (changePkg) {
      alert.newPackaging = dto.newPackaging || null;
    }

    // 农户采摘成熟度过高 → 结算扣除对应赔付
    if (deduct) {
      const defectRefund = await this.aftersales
        .createQueryBuilder('a')
        .select('COALESCE(SUM(a.refund_amount),0)', 'sum')
        .where('a.batch_id = :bid AND a.type = :tp AND a.status = :st', {
          bid: alert.batchId,
          tp: '坏果',
          st: 'resolved',
        })
        .getRawOne();
      const amount =
        dto.farmerDeductionAmount != null
          ? Math.min(Number(dto.farmerDeductionAmount), Number(defectRefund.sum))
          : Number(defectRefund.sum);
      alert.farmerDeductionAmount = Math.round(amount * 100) / 100 as any;
    } else {
      alert.farmerDeductionAmount = 0 as any;
    }
    await this.alerts.save(alert);
    await this.settlements.recomputeForBatch(alert.batchId);

    const batch = await this.batches.findOne({ where: { id: alert.batchId } });
    if (changePkg && alert.newPackaging) {
      await this.risks.emit(
        'defect_alert',
        'info',
        `批次 ${batch.batchNo} 定责为包装承压问题，后续发货包装由「${alert.packagingType}」更换为「${alert.newPackaging}」`,
        batch.id,
      );
    }
    if (deduct) {
      await this.risks.emit(
        'defect_alert',
        'info',
        `批次 ${batch.batchNo} 定责为农户采摘成熟度过高，结算时扣除农户赔付 ¥${alert.farmerDeductionAmount}`,
        batch.id,
      );
    }
    return alert;
  }

  /** 结案：解除同批次剩余库存冻结 */
  async close(id: number, user: any) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('坏果预警不存在');
    if (alert.status === 'open') throw new BadRequestException('请先完成质检复盘定责再结案');
    alert.status = 'closed';
    alert.closedAt = new Date();
    await this.alerts.save(alert);

    const batch = await this.batches.findOne({ where: { id: alert.batchId } });
    if (batch && batch.frozenByAlert && batch.frozenAlertId === id) {
      batch.frozenByAlert = false;
      batch.frozenAlertId = null;
      await this.batches.save(batch);
    }
    return alert;
  }

  listFollowups(alertId: number) {
    return this.followups.find({
      where: { alertId },
      order: { priorityScore: 'DESC', id: 'ASC' },
      take: 300,
    });
  }

  async updateFollowup(id: number, dto: FollowupDto, user: any) {
    const f = await this.followups.findOne({ where: { id } });
    if (!f) throw new NotFoundException('跟进记录不存在');
    f.status = dto.status;
    if (dto.note != null) f.note = dto.note;
    if (dto.status === 'done') {
      f.handledBy = user.sub;
      f.handledAt = new Date();
    }
    return this.followups.save(f);
  }

  // ---------------- 五维归因 ----------------

  private async buildDimension(batchId: number, soldQty: number, defectTickets: Aftersale[]) {
    const [orders, tasks] = await Promise.all([
      this.orders.find({ where: { batchId } }),
      this.tasks.find({ where: { batchId } }),
    ]);
    const omap = new Map(orders.map((o) => [o.id, o]));
    const tmap = new Map(tasks.map((t) => [t.orderId, t]));
    const product = await this.products.findOne({
      where: { id: (await this.batches.findOne({ where: { id: batchId } })).productId },
    });

    // 每个坏果工单补齐城市/线路/温度
    const enriched = defectTickets
      .map((t) => {
        const o = omap.get(t.orderId);
        const task = tmap.get(t.orderId);
        return { ticket: t, city: o?.city || '未知', route: task?.logisticsRoute || '未分配线路', temp: t.arrivalTemp ?? null };
      });

    // 维度一：到货城市温度
    const cityMap = new Map<string, { orders: number; defects: number; tempSum: number; tempN: number }>();
    for (const o of orders) {
      const c = cityMap.get(o.city) || { orders: 0, defects: 0, tempSum: 0, tempN: 0 };
      c.orders++;
      cityMap.set(o.city, c);
    }
    for (const e of enriched) {
      const c = cityMap.get(e.city) || { orders: 0, defects: 0, tempSum: 0, tempN: 0 };
      c.defects++;
      if (e.temp != null) { c.tempSum += e.temp; c.tempN++; }
      cityMap.set(e.city, c);
    }
    const byCity = [...cityMap.entries()]
      .map(([city, v]) => ({
        city,
        orders: v.orders,
        defects: v.defects,
        rate: v.orders ? Math.round((v.defects / v.orders) * 10000) / 10000 : 0,
        avgTemp: v.tempN ? Math.round((v.tempSum / v.tempN) * 10) / 10 : null,
      }))
      .sort((a, b) => b.defects - a.defects)
      .slice(0, 8);

    // 维度二：物流线路
    const routeMap = new Map<string, { tasks: number; defects: number; late: number }>();
    for (const t of tasks) {
      const key = t.logisticsRoute || '未分配线路';
      const r = routeMap.get(key) || { tasks: 0, defects: 0, late: 0 };
      r.tasks++;
      if (t.vehicleLate) r.late++;
      routeMap.set(key, r);
    }
    for (const e of enriched) {
      const r = routeMap.get(e.route) || { tasks: 0, defects: 0, late: 0 };
      r.defects++;
      routeMap.set(e.route, r);
    }
    const byRoute = [...routeMap.entries()]
      .map(([route, v]) => ({
        route,
        tasks: v.tasks,
        defects: v.defects,
        rate: v.tasks ? Math.round((v.defects / v.tasks) * 10000) / 10000 : 0,
        vehicleLate: v.late,
      }))
      .sort((a, b) => b.defects - a.defects);

    // 维度三：包装方式（批次内统一包装，给整体承压对照）
    const byPackaging = [
      {
        packaging: product.packagingType,
        pressureResistance: product.pressureResistance,
        defects: defectTickets.length,
        rate: soldQty ? Math.round((defectTickets.length / soldQty) * 10000) / 10000 : 0,
      },
    ];

    // 维度五：用户拍照证据（损伤形态分布）
    const formMap = new Map<string, number>();
    for (const t of defectTickets) {
      const form = t.damageForm || '未标注';
      formMap.set(form, (formMap.get(form) || 0) + 1);
    }
    const evidence = [...formMap.entries()].map(([damageForm, count]) => ({ damageForm, count }));

    // 可疑原因提示
    const suspect: string[] = [];
    const total = defectTickets.length || 1;
    const pressureN = (formMap.get('磕碰压伤') || 0) + (formMap.get('霉变异味') || 0) * 0.3;
    const ripeN = formMap.get('过熟软烂') || 0;
    if (['低', '中'].includes(product.pressureResistance) && pressureN / total >= 0.5) {
      suspect.push(`包装承压等级「${product.pressureResistance}」且 ${Math.round((pressureN / total) * 100)}% 报损为磕碰压伤，疑似包装承压不足`);
    }
    if (ripeN / total >= 0.5) {
      suspect.push(`${Math.round((ripeN / total) * 100)}% 报损为过熟软烂，疑似农户采摘成熟度过高`);
    }
    const hotCity = byCity.find((c) => c.avgTemp != null && c.avgTemp >= 30 && c.defects > 0);
    if (hotCity) suspect.push(`${hotCity.city} 到货气温 ${hotCity.avgTemp}℃ 且坏果集中，疑似高温催熟`);

    return { byCity, byRoute, byPackaging, evidence, suspect };
  }

  private async harvestToDeliveryDays(batch: Batch): Promise<number | null> {
    const rows = await this.tasks
      .createQueryBuilder('t')
      .select('t.delivered_at', 'deliveredAt')
      .where('t.batch_id = :bid AND t.delivered_at IS NOT NULL', { bid: batch.id })
      .getRawMany();
    if (!rows.length) return null;
    const harvest = new Date(batch.harvestDate).getTime();
    const days = rows
      .map((r) => (new Date(r.deliveredAt).getTime() - harvest) / 86400000)
      .filter((d) => d >= 0);
    if (!days.length) return null;
    return Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10;
  }

  private async tempBreachRate(batchId: number, tempZone: string): Promise<number> {
    const tasks = await this.tasks.find({ where: { batchId } });
    const relevant = tasks.filter((t) => t.status !== 'pending');
    if (!relevant.length) return 0;
    const limit = TEMP_LIMIT[tempZone] ?? 30;
    const breach = relevant.filter(
      (t) => (t.transitMaxTemp != null && t.transitMaxTemp > limit) || t.vehicleLate,
    ).length;
    return Math.round((breach / relevant.length) * 10000) / 10000;
  }

  /**
   * 客服优先名单：同城市/同线路/同包装 的用户
   * 已报损用户额外加权；同包装为该批次统一特征
   */
  private async buildFollowups(
    alert: DefectAlert,
    batchId: number,
    packagingType: string,
    defectTickets: Aftersale[],
  ) {
    const [orders, tasks] = await Promise.all([
      this.orders.find({ where: { batchId } }),
      this.tasks.find({ where: { batchId } }),
    ]);
    const tmap = new Map(tasks.map((t) => [t.orderId, t]));
    const ticketByOrder = new Map<number, Aftersale>();
    for (const t of defectTickets) ticketByOrder.set(t.orderId, t);

    const defectCities = new Set(
      (alert.dimension?.byCity || []).filter((c) => c.defects > 0).map((c) => c.city),
    );
    const defectRoutes = new Set(
      (alert.dimension?.byRoute || []).filter((r) => r.defects > 0).map((r) => r.route),
    );

    const rows: DefectFollowup[] = [];
    for (const o of orders) {
      const task = tmap.get(o.id);
      const ticket = ticketByOrder.get(o.id);
      const tags: string[] = [];
      if (defectCities.has(o.city)) tags.push('同城市');
      if (task && defectRoutes.has(task.logisticsRoute || '未分配线路')) tags.push('同线路');
      tags.push('同包装'); // 该批订单统一使用预警批次包装
      if (!ticket && tags.length === 1) continue; // 仅命中"同包装"且未报损的不进名单，避免全量打扰
      const score = tags.length + (ticket ? 2 : 0);
      rows.push(
        this.followups.create({
          alertId: alert.id,
          orderId: o.id,
          aftersaleId: ticket?.id || null,
          city: o.city,
          logisticsRoute: task?.logisticsRoute || null,
          packagingType,
          matchTags: tags.join(','),
          priorityScore: score,
          status: 'pending',
        }),
      );
    }
    rows.sort((a, b) => b.priorityScore - a.priorityScore);
    await this.followups.save(rows.slice(0, 200));
  }
}

@Controller('defect-alerts')
export class DefectAlertsController {
  constructor(private svc: DefectAlertsService) {}

  @Get()
  @Roles('operator', 'aftersales', 'warehouse')
  list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Post('scan')
  @Roles('operator')
  scan() {
    return this.svc.scanAll();
  }

  @Get(':id')
  @Roles('operator', 'aftersales', 'warehouse')
  detail(@Param('id') id: string) {
    return this.svc.detail(+id);
  }

  @Post(':id/review')
  @Roles('operator')
  review(@Param('id') id: string, @Body() dto: ReviewDto, @ReqUser() user: any) {
    return this.svc.review(+id, dto, user);
  }

  @Post(':id/close')
  @Roles('operator')
  close(@Param('id') id: string, @ReqUser() user: any) {
    return this.svc.close(+id, user);
  }

  @Get(':id/followups')
  @Roles('operator', 'aftersales')
  followups(@Param('id') id: string) {
    return this.svc.listFollowups(+id);
  }

  @Patch('followups/:id')
  @Roles('aftersales', 'operator')
  updateFollowup(@Param('id') id: string, @Body() dto: FollowupDto, @ReqUser() user: any) {
    return this.svc.updateFollowup(+id, dto, user);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DefectAlert, DefectFollowup, Batch, Product, Order, ShippingTask, Aftersale,
    ]),
    SettlementsModule,
  ],
  controllers: [DefectAlertsController],
  providers: [DefectAlertsService],
  exports: [DefectAlertsService],
})
export class DefectAlertsModule {}