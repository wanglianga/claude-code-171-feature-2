import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IsIn, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { DefectAlert, RESPONSIBILITY } from '../../entities/defect-alert.entity';
import { QcReview } from '../../entities/qc-review.entity';
import { Aftersale } from '../../entities/aftersale.entity';
import { Batch } from '../../entities/batch.entity';
import { Order } from '../../entities/order.entity';
import { ShippingTask } from '../../entities/shipping-task.entity';
import { InventoryLock } from '../../entities/inventory-lock.entity';
import { Livestream } from '../../entities/livestream.entity';
import { Roles } from '../../common/decorators';
import { ReqUser } from '../../common/req-user.decorator';
import { RisksService } from '../risks/risks.module';
import { FarmersService } from '../farmers/farmers.module';
import { tempBand } from '../../common/logistics';

const r2 = (n: number) => Math.round(n * 100) / 100;

class ManualAlertDto {
  @IsInt() batchId: number;
}

class ReviewDto {
  @IsOptional() @IsInt() shippingTaskId?: number;
  @IsOptional() outboundFindings?: string;
  @IsOptional() arrivalFindings?: string;
  @IsOptional() tempzoneFindings?: string;
  @IsIn(['packaging', 'ripeness', 'logistics', 'mixed', 'none', 'pending'])
  responsibility: string;
  @IsOptional() remark?: string;
}

class ResponsibilityDto {
  @IsIn(['packaging', 'ripeness', 'logistics', 'mixed', 'none'])
  responsibility: string;
  @IsOptional() replacementPackaging?: string;
  @IsOptional() responsibilityNote?: string;
  /** 多方责任时农户承担比例 0~1（默认 0.5） */
  @IsOptional() @Min(0) farmerShare?: number;
}

const PACKAGING_SYMPTOMS = ['压伤软烂', '磕碰伤'];
const RIPENESS_SYMPTOMS = ['过熟软烂'];
const TEMP_SYMPTOMS = ['霉变', '冻伤', '脱水发皱'];

@Injectable()
export class DefectAlertsService {
  constructor(
    @InjectRepository(DefectAlert) private alerts: Repository<DefectAlert>,
    @InjectRepository(QcReview) private reviews: Repository<QcReview>,
    @InjectRepository(Aftersale) private aftersales: Repository<Aftersale>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(ShippingTask) private tasks: Repository<ShippingTask>,
    @InjectRepository(InventoryLock) private locks: Repository<InventoryLock>,
    @InjectRepository(Livestream) private livestreams: Repository<Livestream>,
    private risks: RisksService,
    private farmersSvc: FarmersService,
  ) {}

  // ---------------------------------------------------------------- 预警形成

  /**
   * 售后坏果工单处理后调用：重算批次坏果率，达到 5% 预警线即形成/更新预警，
   * 首次形成时冻结同批次剩余库存、生成风险事件、标记客服优先工单。
   */
  async evaluateBatch(batchId: number, user?: any, source: string = 'aftersale_resolve'): Promise<DefectAlert | null> {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch || batch.soldQty <= 0) return null;
    const defectCount = await this.aftersales.count({
      where: { batchId, type: '坏果', status: 'resolved' },
    });
    const rate = defectCount / batch.soldQty;
    batch.defectRate = r2(rate);
    await this.batches.save(batch);
    if (rate < 0.05) return null;

    let alert = await this.alerts.findOne({
      where: { batchId },
      order: { id: 'DESC' },
    });
    // 已闭环的预警不再复活，另开新单
    if (alert && alert.status === 'closed') alert = null;

    if (!alert) {
      alert = this.alerts.create({
        alertNo: `DA${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
        batchId,
        livestreamId: (await this.livestreams.findOne({
          where: { batchId },
          order: { id: 'ASC' },
        }))?.id || null,
        triggerSource: source,
        status: 'open',
        defectRate: r2(rate),
        defectCount,
        soldQty: batch.soldQty,
        responsibility: 'pending',
        createdBy: user?.sub || null,
      });
      alert = await this.alerts.save(alert);
      await this.freezeBatch(alert);
      await this.risks.emit(
        'defect_alert',
        rate >= 0.1 ? 'critical' : 'warning',
        `坏果预警 ${alert.alertNo}：批次 ${batch.batchNo} 坏果率 ${(rate * 100).toFixed(1)}%（${defectCount}/${batch.soldQty}），已冻结同批次剩余库存，客服优先处理同城市/同线路/同包装用户`,
        batch.id,
        alert.livestreamId,
      );
    } else {
      alert.defectRate = r2(rate);
      alert.defectCount = defectCount;
      alert.soldQty = batch.soldQty;
      await this.alerts.save(alert);
    }
    await this.applyPriority(alert);
    await this.farmersSvc.recomputeStats(batch.product.farmerId);
    return alert;
  }

  /** 人工按批次形成坏果预警 */
  async manualCreate(dto: ManualAlertDto, user: any) {
    const batch = await this.batches.findOne({ where: { id: dto.batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    const open = await this.alerts.findOne({ where: { batchId: batch.id } });
    if (open && open.status !== 'closed') {
      throw new BadRequestException(`该批次已有进行中的坏果预警 ${open.alertNo}`);
    }
    return this.evaluateBatch(batch.id, user, 'manual')
      .then(async (a) => {
        if (!a) {
          // 坏果率未达线也允许人工立项（如集中投诉初现）
          const created = this.alerts.create({
            alertNo: `DA${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
            batchId: batch.id,
            triggerSource: 'manual',
            status: 'open',
            defectRate: batch.defectRate || 0,
            defectCount: await this.aftersales.count({ where: { batchId: batch.id, type: '坏果', status: 'resolved' } }),
            soldQty: batch.soldQty,
            responsibility: 'pending',
            createdBy: user.sub,
          });
          const saved = await this.alerts.save(created);
          await this.freezeBatch(saved);
          await this.applyPriority(saved);
          return saved;
        }
        return a;
      });
  }

  /** 冻结同批次剩余库存：可售库存 + 锁库未消耗部分 */
  private async freezeBatch(alert: DefectAlert) {
    const batch = await this.batches.findOne({ where: { id: alert.batchId } });
    if (!batch) return;
    if (!batch.frozen) {
      const lockedRows = await this.locks.find({ where: { batchId: batch.id, status: 'locked' } });
      const lockedQty = lockedRows.reduce((s, l) => s + l.lockedQty, 0);
      batch.frozen = true;
      batch.freezeReason = `坏果预警 ${alert.alertNo}：坏果率 ${(alert.defectRate * 100).toFixed(1)}%，冻结剩余库存待质检定责`;
      batch.frozenAt = new Date();
      await this.batches.save(batch);
      alert.frozenQty = batch.availableQty + lockedQty;
      await this.alerts.save(alert);
    }
  }

  // ---------------------------------------------------------------- 客服优先

  /**
   * 命中“同城市 / 同线路 / 同包装”的客服优先处理：
   * 1) 同批次待处理坏果工单命中任一特征 → 置优先标记；
   * 2) 已送达但尚未报坏果、命中同包装/同线路/同高温城市的订单 → 主动回访名单。
   */
  async applyPriority(alert: DefectAlert) {
    const ctx = await this.loadBatchContext(alert.batchId);
    const hitCities = new Set<string>();
    const hitRoutes = new Set<string>();
    const hitPackaging = new Set<string>();
    ctx.resolvedDefect.forEach((t) => {
      if (t.order?.city) hitCities.add(t.order.city);
      if (t.logisticsRoute) hitRoutes.add(t.logisticsRoute);
      if (t.packagingType) hitPackaging.add(t.packagingType);
    });

    let changed = false;
    for (const t of ctx.pendingTickets) {
      const city = t.order?.city;
      const match =
        (city && hitCities.has(city)) ||
        (t.logisticsRoute && hitRoutes.has(t.logisticsRoute)) ||
        (t.packagingType && hitPackaging.has(t.packagingType));
      if (match && !t.priorityFlag) {
        t.priorityFlag = true;
        await this.aftersales.save(t);
        changed = true;
      }
    }
    return { hitCities: [...hitCities], hitRoutes: [...hitRoutes], hitPackaging: [...hitPackaging], changed };
  }

  /** 客服优先处理名单 */
  async priorityList(alertId: number) {
    const alert = await this.get(alertId);
    const ctx = await this.loadBatchContext(alert.batchId);
    const hitCities = new Set<string>();
    const hitRoutes = new Set<string>();
    const hitPackaging = new Set<string>();
    ctx.resolvedDefect.forEach((t) => {
      if (t.order?.city) hitCities.add(t.order.city);
      if (t.logisticsRoute) hitRoutes.add(t.logisticsRoute);
      if (t.packagingType) hitPackaging.add(t.packagingType);
    });

    // 待处理工单命中
    const pending = ctx.pendingTickets
      .filter(
        (t) =>
          hitCities.has(t.order?.city) ||
          hitRoutes.has(t.logisticsRoute) ||
          hitPackaging.has(t.packagingType),
      )
      .map((t) => this.priorityRow(t.order, t.task, t, hitCities, hitRoutes, hitPackaging));

    // 已送达未报坏果但命中同线路/同高温城市 → 主动回访（同包装覆盖面过广，不作为单独主动回访条件）
    const ticketOrderIds = new Set(ctx.allTickets.map((t) => t.orderId));
    const proactive = ctx.tasks
      .filter((t) => t.status === 'delivered' && !ticketOrderIds.has(t.orderId))
      .filter((t) => {
        const city = ctx.orderMap.get(t.orderId)?.city;
        const hot = t.arrivalCityTemp != null && t.arrivalCityTemp >= 30;
        return (
          (t.logisticsRoute && hitRoutes.has(t.logisticsRoute)) ||
          (city && hot && hitCities.has(city)) ||
          (city && hitCities.has(city) && t.packagingType && hitPackaging.has(t.packagingType))
        );
      })
      .slice(0, 50)
      .map((t) => this.priorityRow(ctx.orderMap.get(t.orderId), t, null, hitCities, hitRoutes, hitPackaging));

    return {
      alertNo: alert.alertNo,
      features: { cities: [...hitCities], routes: [...hitRoutes], packaging: [...hitPackaging] },
      pendingTickets: pending,
      proactiveCustomers: proactive,
    };
  }

  private priorityRow(order: Order, task: ShippingTask, ticket: Aftersale, cities: Set<string>, routes: Set<string>, packaging: Set<string>) {
    const reasons: string[] = [];
    if (order?.city && cities.has(order.city)) reasons.push(`同城市·${order.city}`);
    if (task?.logisticsRoute && routes.has(task.logisticsRoute)) reasons.push('同物流线路');
    if (task?.packagingType && packaging.has(task.packagingType)) reasons.push(`同包装·${task.packagingType}`);
    return {
      ticketId: ticket?.id || null,
      ticketNo: ticket?.ticketNo || null,
      orderNo: order?.orderNo,
      customerName: order?.customerName,
      phone: order?.phone,
      city: order?.city,
      arrivalTemp: task?.arrivalCityTemp ?? null,
      tempZone: task?.tempZone,
      packagingType: task?.packagingType || ticket?.packagingType,
      route: task?.logisticsRoute || ticket?.logisticsRoute,
      symptom: ticket?.defectSymptom || null,
      evidencePhotos: ticket?.evidencePhotos || null,
      taskStatus: task?.status,
      priorityReasons: reasons,
    };
  }

  // ---------------------------------------------------------------- 五维分析

  /** 取批次上下文：工单（带订单/任务）、任务（带订单）、订单映射，并补齐历史快照 */
  private async loadBatchContext(batchId: number) {
    const [allTickets, tasks, orders] = await Promise.all([
      this.aftersales.find({ where: { batchId }, order: { id: 'ASC' } }),
      this.tasks.find({ where: { batchId }, order: { id: 'ASC' } }),
      this.orders.find({ where: { batchId } }),
    ]);
    const orderMap = new Map(orders.map((o) => [o.id, o]));
    const taskByOrder = new Map(tasks.map((t) => [t.orderId, t]));
    allTickets.forEach((t) => {
      (t as any).order = orderMap.get(t.orderId);
      const task = taskByOrder.get(t.orderId);
      (t as any).task = task;
      // 兼容历史数据：快照缺失时从任务/订单回填
      if (!t.packagingType) t.packagingType = task?.packagingType || null;
      if (!t.logisticsRoute) t.logisticsRoute = task?.logisticsRoute || null;
      if (t.arrivalCityTemp == null) t.arrivalCityTemp = task?.arrivalCityTemp ?? null;
      if (!t.tempZone) t.tempZone = task?.tempZone || null;
    });
    return {
      allTickets,
      resolvedDefect: allTickets.filter((t) => t.type === '坏果' && t.status === 'resolved'),
      pendingTickets: allTickets.filter((t) => t.type === '坏果' && t.status === 'pending'),
      tasks,
      orders,
      orderMap,
    };
  }

  /** 按采摘批次、包装方式、物流线路、到货城市温度、用户拍照证据五维分析 */
  async analyze(batchId: number) {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    const ctx = await this.loadBatchContext(batchId);
    const defects = ctx.resolvedDefect;
    const totalTasks = ctx.tasks.length || batch.soldQty || 1;

    const groupRate = (key: (t: ShippingTask) => string, defectKey: (t: Aftersale) => string) => {
      const map = new Map<string, { key: string; total: number; defect: number; pending: number; refund: number; symptoms: Record<string, number>; transitAbnormal: number }>();
      const ensure = (k: string) => {
        if (!map.has(k)) map.set(k, { key: k, total: 0, defect: 0, pending: 0, refund: 0, symptoms: {}, transitAbnormal: 0 });
        return map.get(k);
      };
      ctx.tasks.forEach((t) => {
        const k = key(t) || '未记录';
        const g = ensure(k);
        g.total++;
        if (t.transitMaxTemp != null && ((t.tempZone === '冷藏' && t.transitMaxTemp > 10) || (t.tempZone === '冷冻' && t.transitMaxTemp > -10) || (t.tempZone === '常温' && t.transitMaxTemp > 35))) {
          g.transitAbnormal++;
        }
      });
      defects.forEach((t) => {
        const k = defectKey(t) || '未记录';
        const g = ensure(k);
        g.defect++;
        g.refund += Number(t.refundAmount || 0);
        if (t.defectSymptom) g.symptoms[t.defectSymptom] = (g.symptoms[t.defectSymptom] || 0) + 1;
      });
      ctx.pendingTickets.forEach((t) => {
        const k = defectKey(t) || '未记录';
        if (map.has(k)) map.get(k).pending++;
      });
      return [...map.values()]
        .map((g) => ({ ...g, refund: r2(g.refund), defectRate: r2(g.defect / Math.max(1, g.total)) }))
        .sort((a, b) => b.defect - a.defect);
    };

    // ① 包装方式维度
    const byPackaging = groupRate((t) => t.packagingType, (t) => t.packagingType);
    // ② 物流线路维度
    const byRoute = groupRate((t) => t.logisticsRoute, (t) => t.logisticsRoute);
    // ③ 到货城市 + 温度维度
    const byCity = groupRate(
      (t) => ctx.orderMap.get(t.orderId)?.city,
      (t) => (t as any).order?.city,
    ).map((g) => {
      const anyTask = ctx.tasks.find((t) => ctx.orderMap.get(t.orderId)?.city === g.key);
      const temp = anyTask?.arrivalCityTemp ?? defects.find((d) => (d as any).order?.city === g.key)?.arrivalCityTemp ?? null;
      return { ...g, arrivalTemp: temp, tempBand: tempBand(temp) };
    });
    // 温区维度
    const byTempZone = groupRate((t) => t.tempZone, (t) => t.tempZone);
    // ④ 坏果表象维度（指向责任）
    const symptomMap = new Map<string, number>();
    defects.forEach((t) => {
      const s = t.defectSymptom || '未记录';
      symptomMap.set(s, (symptomMap.get(s) || 0) + 1);
    });
    const bySymptom = [...symptomMap.entries()]
      .map(([symptom, count]) => ({
        symptom,
        count,
        pointsTo: PACKAGING_SYMPTOMS.includes(symptom)
          ? 'packaging'
          : RIPENESS_SYMPTOMS.includes(symptom)
            ? 'ripeness'
            : TEMP_SYMPTOMS.includes(symptom)
              ? 'logistics'
              : 'unknown',
      }))
      .sort((a, b) => b.count - a.count);

    // ⑤ 用户拍照证据
    const evidence = defects
      .filter((t) => t.evidencePhotos)
      .map((t) => ({
        ticketId: t.id,
        ticketNo: t.ticketNo,
        orderNo: (t as any).order?.orderNo,
        city: (t as any).order?.city,
        arrivalTemp: t.arrivalCityTemp,
        packagingType: t.packagingType,
        route: t.logisticsRoute,
        symptom: t.defectSymptom,
        photos: (t.evidencePhotos || '').split(',').filter(Boolean),
        refund: Number(t.refundAmount || 0),
        resolvedAt: t.resolvedAt,
      }));

    // 责任倾向（供质检参考，不自动定责）
    const totalDefect = defects.length || 1;
    const pkgCnt = defects.filter((t) => PACKAGING_SYMPTOMS.includes(t.defectSymptom)).length;
    const ripeCnt = defects.filter((t) => RIPENESS_SYMPTOMS.includes(t.defectSymptom)).length;
    const tempCnt = defects.filter((t) => TEMP_SYMPTOMS.includes(t.defectSymptom)).length;
    const worstPkg = byPackaging[0];
    const productPackaging = batch.product?.packagingType;
    const pressure = batch.product?.pressureResistance;
    let suggested: string = 'pending';
    const hints: string[] = [];
    if (pkgCnt / totalDefect >= 0.6) {
      suggested = 'packaging';
      hints.push(`压伤/磕碰类表象占 ${((pkgCnt / totalDefect) * 100).toFixed(0)}%${worstPkg ? `，集中于「${worstPkg.key}」（该包装坏果率 ${(worstPkg.defectRate * 100).toFixed(1)}%）` : ''}，商品包装耐压等级「${pressure}」`);
    } else if (ripeCnt / totalDefect >= 0.6) {
      suggested = 'ripeness';
      hints.push(`过熟软烂表象占 ${((ripeCnt / totalDefect) * 100).toFixed(0)}%，需比对出库照片确认采摘成熟度`);
    }
    if (tempCnt / totalDefect >= 0.4 || byTempZone.some((g) => g.transitAbnormal > 0)) {
      suggested = suggested === 'pending' ? 'logistics' : 'mixed';
      hints.push('出现霉变/冻伤等温度相关表象或运输途中超温记录，需核查冷链温区');
    }
    if (byCity.some((c) => c.arrivalTemp != null && c.arrivalTemp >= 30 && c.defectRate >= 0.05)) {
      const hot = byCity.filter((c) => c.arrivalTemp != null && c.arrivalTemp >= 30);
      hints.push(`高温城市（${hot.map((c) => `${c.key} ${c.arrivalTemp}℃`).join('、')}）坏果集中，到货城市温度为诱因之一`);
    }

    const refundTotal = r2(defects.reduce((s, t) => s + Number(t.refundAmount || 0), 0));
    const farmerBorneTotal = r2(defects.reduce((s, t) => s + Number(t.farmerBorne || 0), 0));

    return {
      batch: {
        id: batch.id,
        batchNo: batch.batchNo,
        productName: batch.product?.name,
        farmerName: batch.product?.farmer?.name,
        productPackaging,
        pressureResistance: pressure,
        quantity: batch.quantity,
        availableQty: batch.availableQty,
        soldQty: batch.soldQty,
        frozen: batch.frozen,
        replacementPackaging: batch.replacementPackaging,
      },
      defectRate: batch.defectRate,
      defectCount: defects.length,
      pendingCount: ctx.pendingTickets.length,
      soldQty: batch.soldQty,
      refundTotal,
      farmerBorneTotal,
      byPackaging,
      byRoute,
      byCity,
      byTempZone,
      bySymptom,
      evidence,
      suggestedResponsibility: suggested,
      hints,
    };
  }

  // ---------------------------------------------------------------- 定责与复盘

  async list(query: any) {
    const qb = this.alerts
      .createQueryBuilder('a')
      .leftJoinAndMapOne('a.batch', Batch, 'b', 'b.id = a.batch_id')
      .orderBy('a.id', 'DESC')
      .limit(100);
    if (query.status) qb.andWhere('a.status = :st', { st: query.status });
    if (query.responsibility) qb.andWhere('a.responsibility = :rp', { rp: query.responsibility });
    const rows = await qb.getMany();
    // 解出商品/农户名（batch join 已含 eager product）
    return rows.map((a: any) => ({
      ...a,
      productName: a.batch?.product?.name,
      farmerName: a.batch?.product?.farmer?.name,
      batchNo: a.batch?.batchNo,
      frozen: a.batch?.frozen,
    }));
  }

  async get(id: number) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('坏果预警不存在');
    return alert;
  }

  async detail(id: number) {
    const alert = await this.get(id);
    const [analysis, reviews] = await Promise.all([
      this.analyze(alert.batchId),
      this.reviews.find({ where: { alertId: id }, order: { id: 'DESC' } }),
    ]);
    // 复盘用发货任务（出库/到货照片、温区温度）
    const evidenceTasks = (await this.loadBatchContext(alert.batchId)).tasks
      .filter((t) => t.outboundPhoto || t.arrivalPhoto || t.transitMaxTemp != null)
      .slice(0, 30)
      .map((t) => ({
        taskNo: t.taskNo,
        orderId: t.orderId,
        tempZone: t.tempZone,
        packagingType: t.packagingType,
        route: t.logisticsRoute,
        transitMaxTemp: t.transitMaxTemp,
        arrivalCityTemp: t.arrivalCityTemp,
        vehicleLate: t.vehicleLate,
        outboundPhoto: t.outboundPhoto,
        arrivalPhoto: t.arrivalPhoto,
        status: t.status,
      }));
    return { alert, analysis, reviews, evidenceTasks, responsibilityDict: RESPONSIBILITY };
  }

  /** 质检人员提交复盘比对（出库照片 / 到货照片 / 物流温区） */
  async addReview(alertId: number, dto: ReviewDto, user: any) {
    const alert = await this.get(alertId);
    if (alert.status === 'closed') throw new BadRequestException('预警已闭环，不可再复盘');
    const rec = this.reviews.create({
      alertId,
      batchId: alert.batchId,
      shippingTaskId: dto.shippingTaskId || null,
      outboundFindings: dto.outboundFindings || null,
      arrivalFindings: dto.arrivalFindings || null,
      tempzoneFindings: dto.tempzoneFindings || null,
      responsibility: dto.responsibility,
      remark: dto.remark || null,
      reviewedBy: user.sub,
    });
    const saved = await this.reviews.save(rec);
    if (alert.status === 'open') {
      alert.status = 'reviewing';
      await this.alerts.save(alert);
    }
    return saved;
  }

  listReviews(alertId: number) {
    return this.reviews.find({ where: { alertId }, order: { id: 'DESC' } });
  }

  /**
   * 质检定责：
   * - packaging 包装承压 → 必须指定更换包装，后续发货换包装并解冻剩余库存（平台承担赔付）；
   * - ripeness 采摘成熟度过高 → 对应坏果赔付计入农户承担，结算时扣款，剩余库存维持冻结；
   * - logistics 物流温区 → 平台/物流承担，维持冻结待排查；
   * - mixed → 按 farmerShare 比例分摊农户扣款。
   */
  async setResponsibility(alertId: number, dto: ResponsibilityDto, user: any) {
    const alert = await this.get(alertId);
    if (alert.status === 'closed') throw new BadRequestException('预警已闭环');
    const batch = await this.batches.findOne({ where: { id: alert.batchId } });
    const ctx = await this.loadBatchContext(alert.batchId);
    const defectTickets = ctx.resolvedDefect;

    alert.responsibility = dto.responsibility;
    alert.responsibilityNote = dto.responsibilityNote || null;
    alert.resolvedBy = user.sub;
    alert.resolvedAt = new Date();

    let farmerDeduction = 0;
    if (dto.responsibility === 'packaging') {
      const replacement = (dto.replacementPackaging || '').trim();
      if (!replacement) throw new BadRequestException('定责为包装承压时，必须填写后续更换的包装方式');
      alert.replacementPackaging = replacement;
      batch.replacementPackaging = replacement;
      // 包装责任由平台承担：坏果赔付农户承担额记 0（区别于未定责的 null），结算不扣农户
      for (const t of defectTickets) { t.farmerBorne = 0 as any; await this.aftersales.save(t); }
      // 换包装后放行后续发货
      batch.frozen = false;
      batch.freezeReason = null;
      alert.status = 'closed';
      await this.risks.emit(
        'defect_alert',
        'info',
        `坏果预警 ${alert.alertNo} 定责为包装承压：后续发货更换为「${replacement}」，同批次剩余库存已解冻放行，坏果赔付由平台承担，不扣农户结算`,
        batch.id,
        alert.livestreamId,
      );
    } else if (dto.responsibility === 'ripeness') {
      for (const t of defectTickets) {
        t.farmerBorne = Number(t.refundAmount || 0) as any;
        farmerDeduction += Number(t.refundAmount || 0);
        await this.aftersales.save(t);
      }
      alert.farmerDeduction = r2(farmerDeduction) as any;
      alert.status = 'responsibility_set';
      await this.risks.emit(
        'defect_alert',
        'warning',
        `坏果预警 ${alert.alertNo} 定责为农户采摘成熟度过高：坏果赔付 ¥${r2(farmerDeduction)} 由农户承担，结算时扣款；同批次剩余库存维持冻结`,
        batch.id,
        alert.livestreamId,
      );
    } else if (dto.responsibility === 'logistics') {
      for (const t of defectTickets) { t.farmerBorne = 0 as any; await this.aftersales.save(t); }
      alert.farmerDeduction = 0 as any;
      alert.status = 'responsibility_set';
      await this.risks.emit(
        'defect_alert',
        'warning',
        `坏果预警 ${alert.alertNo} 定责为物流温区异常：坏果赔付由平台/物流承担，不扣农户，剩余库存维持冻结待冷链排查`,
        batch.id,
        alert.livestreamId,
      );
    } else if (dto.responsibility === 'mixed') {
      const share = Math.min(1, Math.max(0, dto.farmerShare ?? 0.5));
      for (const t of defectTickets) {
        const borne = r2(Number(t.refundAmount || 0) * share);
        t.farmerBorne = borne as any;
        farmerDeduction += borne;
        await this.aftersales.save(t);
      }
      alert.farmerDeduction = r2(farmerDeduction) as any;
      alert.status = 'responsibility_set';
      await this.risks.emit(
        'defect_alert',
        'warning',
        `坏果预警 ${alert.alertNo} 定责为多方共同责任：农户按 ${(share * 100).toFixed(0)}% 承担坏果赔付 ¥${r2(farmerDeduction)}（结算扣款），其余平台承担`,
        batch.id,
        alert.livestreamId,
      );
    } else {
      // none：证据不足，解除冻结恢复发货，赔付不扣农户
      for (const t of defectTickets) { t.farmerBorne = 0 as any; await this.aftersales.save(t); }
      alert.farmerDeduction = 0 as any;
      batch.frozen = false;
      batch.freezeReason = null;
      alert.status = 'closed';
      await this.risks.emit(
        'defect_alert',
        'info',
        `坏果预警 ${alert.alertNo} 复盘证据不足，未判定品质责任，剩余库存解除冻结`,
        batch.id,
        alert.livestreamId,
      );
    }

    await this.batches.save(batch);
    const saved = await this.alerts.save(alert);
    await this.farmersSvc.recomputeStats(batch.product.farmerId);
    return saved;
  }

  /** 关闭已完成处置（成熟度/物流/多方）的预警，维持当前冻结结论 */
  async close(alertId: number, user: any) {
    const alert = await this.get(alertId);
    if (alert.status === 'closed') throw new BadRequestException('预警已闭环');
    if (alert.responsibility === 'pending') {
      throw new BadRequestException('尚未定责，不能闭环；请先完成质检复盘与责任判定');
    }
    alert.status = 'closed';
    alert.resolvedBy = user.sub;
    alert.resolvedAt = new Date();
    return this.alerts.save(alert);
  }
}

@Controller('defect-alerts')
export class DefectAlertsController {
  constructor(private svc: DefectAlertsService) {}

  @Get()
  list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Post()
  @Roles('operator', 'aftersales')
  manual(@Body() dto: ManualAlertDto, @ReqUser() user: any) {
    return this.svc.manualCreate(dto, user);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.detail(+id);
  }

  @Get(':id/priority')
  @Roles('operator', 'aftersales')
  priority(@Param('id') id: string) {
    return this.svc.priorityList(+id);
  }

  @Get(':id/reviews')
  reviews(@Param('id') id: string) {
    return this.svc.listReviews(+id);
  }

  @Post(':id/reviews')
  @Roles('operator', 'warehouse')
  addReview(@Param('id') id: string, @Body() dto: ReviewDto, @ReqUser() user: any) {
    return this.svc.addReview(+id, dto, user);
  }

  @Post(':id/responsibility')
  @Roles('operator', 'warehouse')
  responsibility(@Param('id') id: string, @Body() dto: ResponsibilityDto, @ReqUser() user: any) {
    return this.svc.setResponsibility(+id, dto, user);
  }

  @Post(':id/close')
  @Roles('operator', 'warehouse')
  close(@Param('id') id: string, @ReqUser() user: any) {
    return this.svc.close(+id, user);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DefectAlert, QcReview, Aftersale, Batch, Order, ShippingTask, InventoryLock, Livestream,
    ]),
  ],
  controllers: [DefectAlertsController],
  providers: [DefectAlertsService],
  exports: [DefectAlertsService],
})
export class DefectAlertsModule {}
