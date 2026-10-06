import { Controller, Get, Injectable, Module, NotFoundException, Param } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Farmer } from '../../entities/farmer.entity';
import { Product } from '../../entities/product.entity';
import { Batch } from '../../entities/batch.entity';
import { Selection } from '../../entities/selection.entity';
import { Livestream } from '../../entities/livestream.entity';
import { InventoryLock } from '../../entities/inventory-lock.entity';
import { Order } from '../../entities/order.entity';
import { ShippingTask } from '../../entities/shipping-task.entity';
import { Aftersale } from '../../entities/aftersale.entity';
import { Settlement } from '../../entities/settlement.entity';
import { RiskEvent } from '../../entities/risk-event.entity';
import { FeedbackDecision } from '../../entities/feedback-decision.entity';
import { DefectAlert } from '../../entities/defect-alert.entity';
import { QcReview } from '../../entities/qc-review.entity';
import { Roles } from '../../common/decorators';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Farmer) private farmers: Repository<Farmer>,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(Selection) private selections: Repository<Selection>,
    @InjectRepository(Livestream) private livestreams: Repository<Livestream>,
    @InjectRepository(InventoryLock) private locks: Repository<InventoryLock>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(ShippingTask) private tasks: Repository<ShippingTask>,
    @InjectRepository(Aftersale) private aftersales: Repository<Aftersale>,
    @InjectRepository(Settlement) private settlements: Repository<Settlement>,
    @InjectRepository(RiskEvent) private risks: Repository<RiskEvent>,
    @InjectRepository(FeedbackDecision) private decisions: Repository<FeedbackDecision>,
    @InjectRepository(DefectAlert) private defectAlerts: Repository<DefectAlert>,
    @InjectRepository(QcReview) private qcReviews: Repository<QcReview>,
  ) {}

  async overview() {
    const [productCount, batchCount, liveCount, orderAgg, ticketCount, openRisks, pendingTasks, frozenBatches, openDefectAlerts] =
      await Promise.all([
        this.products.count(),
        this.batches.count(),
        this.livestreams.count({ where: { status: 'live' } }),
        this.orders
          .createQueryBuilder('o')
          .select('COUNT(o.id)', 'cnt')
          .addSelect('COALESCE(SUM(o.amount),0)', 'gmv')
          .getRawOne(),
        this.aftersales.count({ where: { status: 'pending' } }),
        this.risks.count({ where: { status: 'open' } }),
        this.tasks.count({ where: { status: 'pending' } }),
        this.batches.count({ where: { frozen: true } }),
        this.defectAlerts.count({ where: { status: In(['open', 'reviewing', 'responsibility_set']) } }),
      ]);
    return {
      productCount,
      batchCount,
      liveCount,
      orderCount: +orderAgg.cnt,
      gmv: Math.round(+orderAgg.gmv * 100) / 100,
      pendingTickets: ticketCount,
      openRisks,
      pendingTasks,
      frozenBatches,
      openDefectAlerts,
    };
  }

  /** 农户稳定性复盘：哪些农户稳定 */
  async farmerReview() {
    const farmers = await this.farmers.find();
    const result = [];
    for (const f of farmers) {
      const batches = await this.batches
        .createQueryBuilder('b')
        .leftJoin('b.product', 'p')
        .where('p.farmer_id = :id', { id: f.id })
        .getMany();
      const batchIds = batches.map((b) => b.id);
      if (batchIds.length === 0) {
        result.push({ ...f, grade: '暂无数据', sales: 0, refund: 0 });
        continue;
      }
      const sales = await this.orders
        .createQueryBuilder('o')
        .select('COALESCE(SUM(o.amount),0)', 'gmv')
        .where('o.batch_id IN (:...ids)', { ids: batchIds })
        .getRawOne();
      const refunds = await this.aftersales
        .createQueryBuilder('a')
        .select('COALESCE(SUM(a.refund_amount),0)', 'refund')
        .where('a.batch_id IN (:...ids) AND a.status = :st', { ids: batchIds, st: 'resolved' })
        .getRawOne();
      const score = f.stabilityScore;
      result.push({
        ...f,
        sales: Math.round(+sales.gmv * 100) / 100,
        refund: Math.round(+refunds.refund * 100) / 100,
        grade: score >= 0.85 ? '稳定' : score >= 0.7 ? '观察' : '谨慎',
      });
    }
    return result;
  }

  /** 品类复盘：哪些品类适合直播 */
  async categoryReview() {
    const rows = await this.products
      .createQueryBuilder('p')
      .select('p.category', 'category')
      .addSelect('COUNT(DISTINCT p.id)', 'products')
      .groupBy('p.category')
      .getRawMany();
    const result = [];
    for (const r of rows) {
      const stats = await this.orders
        .createQueryBuilder('o')
        .leftJoin(Batch, 'b', 'b.id = o.batch_id')
        .leftJoin(Product, 'p', 'p.id = b.product_id')
        .select('COALESCE(SUM(o.amount),0)', 'gmv')
        .addSelect('COUNT(o.id)', 'orders')
        .where('p.category = :c', { c: r.category })
        .getRawOne();
      const tickets = await this.aftersales
        .createQueryBuilder('a')
        .leftJoin(Batch, 'b', 'b.id = a.batch_id')
        .leftJoin(Product, 'p', 'p.id = b.product_id')
        .select('COUNT(a.id)', 'cnt')
        .where('p.category = :c', { c: r.category })
        .getRawOne();
      const taste = await this.selections
        .createQueryBuilder('s')
        .leftJoin(Batch, 'b', 'b.id = s.batch_id')
        .leftJoin(Product, 'p', 'p.id = b.product_id')
        .select('AVG(s.sample_taste_score)', 'avg')
        .where('p.category = :c AND s.sample_taste_score IS NOT NULL', { c: r.category })
        .getRawOne();
      const orders = +stats.orders;
      const ticketCnt = +tickets.cnt;
      const refundRate = orders > 0 ? ticketCnt / orders : 0;
      const tasteAvg = taste.avg ? Math.round(+taste.avg * 10) / 10 : null;
      // 适合直播指数：销量权重 + 口感分 - 售后率惩罚
      const gmv = Math.round(+stats.gmv * 100) / 100;
      const fit = Math.max(
        0,
        Math.round(((tasteAvg || 6) * 10 + Math.min(gmv / 500, 30) - refundRate * 100) * 10) / 10,
      );
      result.push({
        category: r.category,
        products: +r.products,
        orders,
        gmv,
        ticketCount: ticketCnt,
        refundRate: Math.round(refundRate * 1000) / 1000,
        tasteAvg,
        fitScore: fit,
        suitable: fit >= 65 ? '适合直播' : fit >= 45 ? '谨慎排播' : '不建议直播',
      });
    }
    return result.sort((a, b) => b.fitScore - a.fitScore);
  }

  /** 售后原因复盘：分布 + 对复购的影响 */
  async aftersalesReview() {
    const byType = await this.aftersales
      .createQueryBuilder('a')
      .select('a.type', 'type')
      .addSelect('COUNT(a.id)', 'cnt')
      .addSelect('COALESCE(SUM(a.refund_amount),0)', 'refund')
      .groupBy('a.type')
      .getRawMany();

    // 复购分析：有售后记录的客户 vs 无售后记录客户的再次下单率
    const orders = await this.orders.find({ order: { id: 'ASC' } });
    const tickets = await this.aftersales.find();
    const ticketOrderIds = new Set(tickets.map((t) => t.orderId));
    const byPhone: Record<string, { orders: Order[]; hadTicket: boolean }> = {};
    for (const o of orders) {
      if (!byPhone[o.phone]) byPhone[o.phone] = { orders: [], hadTicket: false };
      byPhone[o.phone].orders.push(o);
      if (ticketOrderIds.has(o.id)) byPhone[o.phone].hadTicket = true;
    }
    let withTicket = 0, withTicketRepurchase = 0, withoutTicket = 0, withoutTicketRepurchase = 0;
    for (const phone of Object.keys(byPhone)) {
      const c = byPhone[phone];
      const repurchased = c.orders.length > 1;
      if (c.hadTicket) {
        withTicket++;
        if (repurchased) withTicketRepurchase++;
      } else {
        withoutTicket++;
        if (repurchased) withoutTicketRepurchase++;
      }
    }
    // 各售后原因类型的复购率
    const typeRepurchase: Record<string, { total: number; repurchased: number }> = {};
    for (const t of tickets) {
      const order = orders.find((o) => o.id === t.orderId);
      if (!order) continue;
      const c = byPhone[order.phone];
      if (!c) continue;
      if (!typeRepurchase[t.type]) typeRepurchase[t.type] = { total: 0, repurchased: 0 };
      typeRepurchase[t.type].total++;
      if (c.orders.length > 1) typeRepurchase[t.type].repurchased++;
    }
    return {
      byType: byType.map((r) => ({
        type: r.type,
        count: +r.cnt,
        refund: Math.round(+r.refund * 100) / 100,
      })),
      repurchase: {
        withTicket: {
          customers: withTicket,
          repurchased: withTicketRepurchase,
          rate: withTicket > 0 ? Math.round((withTicketRepurchase / withTicket) * 1000) / 10 : 0,
        },
        withoutTicket: {
          customers: withoutTicket,
          repurchased: withoutTicketRepurchase,
          rate: withoutTicket > 0 ? Math.round((withoutTicketRepurchase / withoutTicket) * 1000) / 10 : 0,
        },
      },
      typeRepurchase: Object.entries(typeRepurchase).map(([type, v]) => ({
        type,
        customers: v.total,
        repurchaseRate: v.total > 0 ? Math.round((v.repurchased / v.total) * 1000) / 10 : 0,
      })),
    };
  }

  /** 批次全链路追踪：选品→质检→直播→锁库→订单→发货→售后→结算→风险→反向决策 */
  async batchChain(batchId: number) {
    const batch = await this.batches.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    const [selections, livestreams, locks, orders, tasks, tickets, settlements, risks, decisions, defectAlerts, qcReviews] =
      await Promise.all([
        this.selections.find({ where: { batchId }, order: { id: 'ASC' } }),
        this.livestreams.find({ where: { batchId }, order: { id: 'ASC' } }),
        this.locks.find({ where: { batchId }, order: { id: 'ASC' } }),
        this.orders.find({ where: { batchId }, order: { id: 'ASC' } }),
        this.tasks.find({ where: { batchId }, order: { id: 'ASC' } }),
        this.aftersales.find({ where: { batchId }, order: { id: 'ASC' } }),
        this.settlements.find({ where: { batchId }, order: { id: 'ASC' } }),
        this.risks.find({ where: { batchId }, order: { id: 'ASC' } }),
        this.decisions.find({ where: { batchId }, order: { id: 'ASC' } }),
        this.defectAlerts.find({ where: { batchId }, order: { id: 'DESC' } }),
        this.qcReviews.find({ where: { batchId }, order: { id: 'DESC' } }),
      ]);
    const gmv = orders.reduce((s, o) => s + Number(o.amount), 0);
    const refund = tickets
      .filter((t) => t.status === 'resolved')
      .reduce((s, t) => s + Number(t.refundAmount || 0), 0);
    return {
      batch,
      selections,
      livestreams,
      locks,
      orderStats: {
        count: orders.length,
        qty: orders.reduce((s, o) => s + o.quantity, 0),
        gmv: Math.round(gmv * 100) / 100,
      },
      shippingStats: {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === 'pending').length,
        shipped: tasks.filter((t) => ['shipped', 'in_transit'].includes(t.status)).length,
        delivered: tasks.filter((t) => t.status === 'delivered').length,
        exception: tasks.filter((t) => t.status === 'exception').length,
        vehicleLate: tasks.filter((t) => t.vehicleLate).length,
      },
      aftersales: tickets,
      aftersalesStats: {
        total: tickets.length,
        resolved: tickets.filter((t) => t.status === 'resolved').length,
        refund: Math.round(refund * 100) / 100,
      },
      settlements,
      risks,
      decisions,
      defectAlerts,
      qcReviews,
    };
  }
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}

  @Get('overview')
  overview() {
    return this.svc.overview();
  }

  @Get('farmers')
  @Roles('operator', 'aftersales')
  farmers() {
    return this.svc.farmerReview();
  }

  @Get('categories')
  @Roles('operator')
  categories() {
    return this.svc.categoryReview();
  }

  @Get('aftersales')
  @Roles('operator', 'aftersales')
  aftersales() {
    return this.svc.aftersalesReview();
  }

  @Get('chain/:batchId')
  chain(@Param('batchId') batchId: string) {
    return this.svc.batchChain(+batchId);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Farmer, Product, Batch, Selection, Livestream, InventoryLock,
      Order, ShippingTask, Aftersale, Settlement, RiskEvent, FeedbackDecision,
      DefectAlert, QcReview,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
