import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Farmer } from '../entities/farmer.entity';
import { Product } from '../entities/product.entity';
import { Batch } from '../entities/batch.entity';
import { Selection } from '../entities/selection.entity';
import { Livestream } from '../entities/livestream.entity';
import { InventoryLock } from '../entities/inventory-lock.entity';
import { Order } from '../entities/order.entity';
import { ShippingTask } from '../entities/shipping-task.entity';
import { Aftersale } from '../entities/aftersale.entity';
import { Settlement } from '../entities/settlement.entity';
import { RiskEvent } from '../entities/risk-event.entity';
import { BrandNotice } from '../entities/brand-notice.entity';
import { FeedbackDecision } from '../entities/feedback-decision.entity';
import { DefectAlert } from '../entities/defect-alert.entity';
import { QcReview } from '../entities/qc-review.entity';
import { cityArrivalTemp, logisticsRoute, transitMaxTemp } from '../common/logistics';

const CITIES = ['杭州市', '上海市', '南京市', '合肥市', '苏州市', '宁波市', '武汉市', '长沙市'];
const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙'];
const GIVEN = ['芳', '伟', '敏', '静', '磊', '洋', '艳', '勇', '杰', '娟', '涛', '雪'];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private log = new Logger('Seed');

  constructor(
    @InjectRepository(User) private users: Repository<User>,
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
    @InjectRepository(BrandNotice) private notices: Repository<BrandNotice>,
    @InjectRepository(FeedbackDecision) private decisions: Repository<FeedbackDecision>,
    @InjectRepository(DefectAlert) private defectAlerts: Repository<DefectAlert>,
    @InjectRepository(QcReview) private qcReviews: Repository<QcReview>,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.users.count();
    if (count > 0) return;
    this.log.log('数据库为空，写入演示种子数据…');
    await this.seed();
    this.log.log('种子数据完成');
  }

  private seq = 0;
  private no(prefix: string) {
    this.seq++;
    return `${prefix}2026${String(this.seq).padStart(5, '0')}`;
  }

  private async seed() {
    // ---------- 用户 ----------
    const hash = (p: string) => bcrypt.hashSync(p, 10);
    const users = await this.users.save([
      this.users.create({ username: 'admin', password: hash('admin123'), name: '县域运营中心', role: 'admin' }),
      this.users.create({ username: 'ops', password: hash('123456'), name: '陈选品', role: 'operator' }),
      this.users.create({ username: 'farmer1', password: hash('123456'), name: '李青山', role: 'farmer' }),
      this.users.create({ username: 'farmer2', password: hash('123456'), name: '王菌业', role: 'farmer' }),
      this.users.create({ username: 'farmer3', password: hash('123456'), name: '张蜜坊', role: 'farmer' }),
      this.users.create({ username: 'farmer4', password: hash('123456'), name: '刘腊味', role: 'farmer' }),
      this.users.create({ username: 'warehouse', password: hash('123456'), name: '赵仓管', role: 'warehouse' }),
      this.users.create({ username: 'aftersales', password: hash('123456'), name: '孙售后', role: 'aftersales' }),
    ]);
    const [admin, ops, fu1, fu2, fu3, fu4] = users;

    // ---------- 农户 ----------
    const [f1, f2, f3, f4] = await this.farmers.save([
      this.farmers.create({ name: '青山果园', region: '本县青云山乡', contact: '李青山 13800000001', userId: fu1.id, stabilityScore: 0.93, totalBatches: 2, fulfilledBatches: 2, avgDefectRate: 0.054, aftersalesRate: 0.06 }),
      this.farmers.create({ name: '云岭菌菇合作社', region: '本县云岭镇', contact: '王菌业 13800000002', userId: fu2.id, stabilityScore: 0.9, totalBatches: 1, fulfilledBatches: 1, avgDefectRate: 0.01, aftersalesRate: 0.02 }),
      this.farmers.create({ name: '张记蜜坊', region: '本县桃花坞村', contact: '张蜜坊 13800000003', userId: fu3.id, stabilityScore: 0.97, totalBatches: 1, fulfilledBatches: 1, avgDefectRate: 0, aftersalesRate: 0 }),
      this.farmers.create({ name: '刘记腊味坊', region: '本县老街镇', contact: '刘腊味 13800000004', userId: fu4.id, stabilityScore: 0.66, totalBatches: 1, fulfilledBatches: 1, avgDefectRate: 0.02, aftersalesRate: 0.08 }),
    ]);

    // ---------- 商品 ----------
    const [p1, p2, p3, p4, p5, p6, p7] = await this.products.save([
      this.products.create({ name: '高山红富士苹果', category: '水果', origin: '青云山乡海拔800米果园', spec: '5kg/箱 单果200g+', unit: '箱', shelfLifeDays: 20, coldChainRequired: true, tempZone: '冷藏', packagingType: '泡沫托+纸箱', pressureResistance: '中', description: '高山昼夜温差大，糖度15+', status: 'approved', farmerId: f1.id }),
      this.products.create({ name: '徐香猕猴桃', category: '水果', origin: '青云山乡河谷地', spec: '4.5kg/箱 24枚', unit: '箱', shelfLifeDays: 15, coldChainRequired: true, tempZone: '冷藏', packagingType: '珍珠棉单果包装', pressureResistance: '高', description: '即食型徐香，到手可吃', status: 'approved', farmerId: f1.id }),
      this.products.create({ name: '云岭香菇干', category: '菌菇', origin: '云岭镇椴木基地', spec: '500g/袋', unit: '袋', shelfLifeDays: 180, coldChainRequired: false, tempZone: '常温', packagingType: '自封袋+纸箱', pressureResistance: '高', description: '椴木香菇，肉厚香浓', status: 'approved', farmerId: f2.id }),
      this.products.create({ name: '土蜂蜜', category: '蜂蜜', origin: '桃花坞村蜂场', spec: '500g/瓶 百花蜜', unit: '瓶', shelfLifeDays: 365, coldChainRequired: false, tempZone: '常温', packagingType: '玻璃瓶+气柱袋', pressureResistance: '中', description: '一年一取土蜂蜜', status: 'approved', farmerId: f3.id }),
      this.products.create({ name: '农家腊肠', category: '腊味', origin: '老街镇作坊', spec: '500g/袋', unit: '袋', shelfLifeDays: 90, coldChainRequired: true, tempZone: '冷藏', packagingType: '真空袋+泡沫箱', pressureResistance: '高', description: '传统风干工艺', status: 'approved', farmerId: f4.id }),
      this.products.create({ name: '胚芽大米', category: '米面', origin: '云岭镇稻田', spec: '5kg/袋', unit: '袋', shelfLifeDays: 120, coldChainRequired: false, tempZone: '常温', packagingType: '编织袋', pressureResistance: '高', description: '留胚率80%以上', status: 'submitted', farmerId: f2.id }),
      this.products.create({ name: '高山奶油草莓', category: '水果', origin: '青云山乡高架草莓棚', spec: '500g/盒 大果18枚', unit: '盒', shelfLifeDays: 3, coldChainRequired: true, tempZone: '冷藏', packagingType: '普通泡沫托', pressureResistance: '低', description: '九成熟采摘，香气浓，极不耐压', status: 'approved', farmerId: f1.id }),
    ]);

    // ---------- 批次 ----------
    const [b1, b2, b3, b4, b5, b6, b7] = await this.batches.save([
      this.batches.create({ batchNo: 'B20260920-AP-01', productId: p1.id, quantity: 500, availableQty: 240, soldQty: 260, harvestDate: '2026-09-20', harvestWindowEnd: '2026-10-15', supplyPrice: 28, testReportNo: 'JC-2026-0918', testReportExpiry: '2026-12-31', livestreamAvailable: true, status: 'on_sale', defectRate: 0.054 }),
      this.batches.create({ batchNo: 'B20260928-KW-01', productId: p2.id, quantity: 300, availableQty: 180, soldQty: 120, harvestDate: '2026-09-28', harvestWindowEnd: '2026-10-20', supplyPrice: 35, testReportNo: 'JC-2026-0925', testReportExpiry: '2026-11-30', livestreamAvailable: true, status: 'on_sale', defectRate: 0.01 }),
      this.batches.create({ batchNo: 'B20260915-MU-01', productId: p3.id, quantity: 200, availableQty: 80, soldQty: 0, harvestDate: '2026-09-15', harvestWindowEnd: '2027-03-15', supplyPrice: 22, testReportNo: 'JC-2026-0910', testReportExpiry: '2027-06-30', livestreamAvailable: true, status: 'locked', defectRate: 0 }),
      this.batches.create({ batchNo: 'B20260901-HN-01', productId: p4.id, quantity: 150, availableQty: 150, soldQty: 0, harvestDate: '2026-09-01', harvestWindowEnd: '2027-09-01', supplyPrice: 45, testReportNo: 'JC-2026-0830', testReportExpiry: '2027-09-30', livestreamAvailable: true, status: 'qc_passed', defectRate: 0 }),
      this.batches.create({ batchNo: 'B20260910-LA-01', productId: p5.id, quantity: 200, availableQty: 110, soldQty: 90, harvestDate: '2026-09-10', harvestWindowEnd: '2026-12-10', supplyPrice: 38, testReportNo: 'JC-2026-0903', testReportExpiry: '2026-10-03', livestreamAvailable: true, status: 'closed', defectRate: 0.02 }),
      this.batches.create({ batchNo: 'B20261004-AP-02', productId: p1.id, quantity: 400, availableQty: 400, soldQty: 0, harvestDate: '2026-10-04', harvestWindowEnd: '2026-10-25', supplyPrice: 27, testReportNo: 'JC-2026-1002', testReportExpiry: '2027-01-15', livestreamAvailable: true, status: 'pending', defectRate: 0 }),
      // 草莓批次：发出 80 盒后坏果赔付集中出现，剩余 80 盒可售 + 40 盒锁定未消耗待冻结
      this.batches.create({ batchNo: 'B20261005-ST-01', productId: p7.id, quantity: 200, availableQty: 80, soldQty: 80, harvestDate: '2026-10-05', harvestWindowEnd: '2026-10-08', supplyPrice: 18, testReportNo: 'JC-2026-1004', testReportExpiry: '2026-12-15', livestreamAvailable: true, status: 'on_sale', defectRate: 0.1 }),
    ]);

    // ---------- 选品记录 ----------
    await this.selections.save([
      this.selections.create({ batchId: b1.id, operatorId: ops.id, sampleTasteScore: 8, sampleNotes: '脆甜多汁，果面干净', decision: 'selected', notes: '糖度达标，可排播' }),
      this.selections.create({ batchId: b2.id, operatorId: ops.id, sampleTasteScore: 9, sampleNotes: '即食口感好，甜度高', decision: 'selected', notes: '重点推荐' }),
      this.selections.create({ batchId: b3.id, operatorId: ops.id, sampleTasteScore: 7, sampleNotes: '泡发率高，香味足', decision: 'selected', notes: '干货类稳妥' }),
      this.selections.create({ batchId: b4.id, operatorId: ops.id, sampleTasteScore: 8, sampleNotes: '百花蜜结晶细腻', decision: 'selected', notes: '待排期' }),
      this.selections.create({ batchId: b5.id, operatorId: ops.id, sampleTasteScore: 6, sampleNotes: '偏咸，部分肥膘偏多', decision: 'selected', notes: '勉强通过，注意话术' }),
    ]);

    // ---------- 直播场次 ----------
    const [l1, l2, l3, l4, l5] = await this.livestreams.save([
      this.livestreams.create({ title: '高山苹果开园首发', batchId: b1.id, anchorName: '主播小云', scriptSummary: '果园实景+现摘试吃+糖度实测', promiseText: '现摘现发、坏果包赔、48小时发货', price: 39.9, couponAmount: 5, estimatedSales: 200, actualSales: 260, scheduledAt: new Date('2026-10-01T19:30:00'), status: 'ended', sampleTasteDone: true, createdBy: ops.id }),
      this.livestreams.create({ title: '徐香猕猴桃甜心场', batchId: b2.id, anchorName: '主播阿凯', scriptSummary: '即食对比实验+果园连线', promiseText: '到手即食、坏果包赔', price: 45.9, couponAmount: 6, estimatedSales: 150, actualSales: 120, scheduledAt: new Date('2026-10-05T19:30:00'), status: 'live', sampleTasteDone: true, createdBy: ops.id }),
      this.livestreams.create({ title: '云岭香菇干货节', batchId: b3.id, anchorName: '主播小云', scriptSummary: '泡发现场对比+炖汤演示', promiseText: '椴木香菇、泡发率高', price: 29.9, couponAmount: 3, estimatedSales: 120, actualSales: 0, scheduledAt: new Date('2026-10-08T19:30:00'), status: 'locked', sampleTasteDone: true, createdBy: ops.id }),
      this.livestreams.create({ title: '刘记腊肠年味场', batchId: b5.id, anchorName: '主播大周', scriptSummary: '腊味蒸炒试吃', promiseText: '纯手工无添加、农家土猪肉', price: 59.9, couponAmount: 8, estimatedSales: 100, actualSales: 90, scheduledAt: new Date('2026-09-28T19:30:00'), status: 'ended', sampleTasteDone: true, createdBy: ops.id }),
      this.livestreams.create({ title: '高山奶油草莓尝鲜场', batchId: b7.id, anchorName: '主播阿凯', scriptSummary: '高架棚现摘+糖度实测+冷链直发', promiseText: '九成熟现摘、坏果包赔、顺丰冷链48h达', price: 35.9, couponAmount: 3, estimatedSales: 120, actualSales: 80, scheduledAt: new Date('2026-10-05T19:30:00'), status: 'ended', sampleTasteDone: true, createdBy: ops.id }),
    ]);

    // ---------- 库存锁定 ----------
    await this.locks.save([
      this.locks.create({ livestreamId: l1.id, batchId: b1.id, lockedQty: 200, packagingMaterial: '泡沫托+纸箱', packagingQty: 220, warehouseName: '县域中心仓', status: 'consumed' }),
      this.locks.create({ livestreamId: l2.id, batchId: b2.id, lockedQty: 150, packagingMaterial: '珍珠棉单果包装', packagingQty: 160, warehouseName: '县域中心仓', status: 'locked' }),
      this.locks.create({ livestreamId: l3.id, batchId: b3.id, lockedQty: 120, packagingMaterial: '自封袋+纸箱', packagingQty: 130, warehouseName: '云岭镇前置仓', status: 'locked' }),
      this.locks.create({ livestreamId: l4.id, batchId: b5.id, lockedQty: 100, packagingMaterial: '真空袋+泡沫箱', packagingQty: 110, warehouseName: '县域中心仓', status: 'consumed' }),
      // 草莓：已消耗 80 盒普通泡沫托；另有 40 盒锁定未消耗，冻结时一并冻结
      this.locks.create({ livestreamId: l5.id, batchId: b7.id, lockedQty: 80, packagingMaterial: '普通泡沫托', packagingQty: 85, warehouseName: '县域中心仓', status: 'consumed' }),
      this.locks.create({ livestreamId: l5.id, batchId: b7.id, lockedQty: 40, packagingMaterial: '普通泡沫托', packagingQty: 42, warehouseName: '县域中心仓', status: 'locked' }),
    ]);

    // ---------- 订单（含复购客户） ----------
    // 客户池 400 人：L1 用 0-259，L2 用 180-299（80 人与 L1 重叠=复购），L4 用 310-399（全新客）
    const customers: { name: string; phone: string; city: string }[] = [];
    for (let i = 0; i < 400; i++) {
      customers.push({
        name: SURNAMES[i % SURNAMES.length] + GIVEN[(i * 7) % GIVEN.length],
        phone: `139${String(10000000 + i * 137).slice(0, 8)}`,
        city: CITIES[i % CITIES.length],
      });
    }
    const orders: Partial<Order>[] = [];
    const mk = (ls: Livestream, batch: Batch, idx: number, price: number, coupon: number) => {
      const c = customers[idx % customers.length];
      return this.orders.create({
        orderNo: this.no('O'),
        livestreamId: ls.id,
        batchId: batch.id,
        customerName: c.name,
        phone: c.phone,
        city: c.city,
        address: `${c.city}幸福路${(idx % 200) + 1}号`,
        quantity: 1,
        unitPrice: price,
        amount: Math.max(0, price - coupon),
        status: 'paid',
      });
    };
    // L1 苹果 260 单（客户 0-259）
    for (let i = 0; i < 260; i++) orders.push(mk(l1, b1, i, 39.9, 5));
    // L2 猕猴桃 120 单（客户 180-299 → 180-259 为复购客户）
    for (let i = 0; i < 120; i++) orders.push(mk(l2, b2, 180 + i, 45.9, 6));
    // L4 腊肠 90 单（客户 310-399，全新客）
    for (let i = 0; i < 90; i++) orders.push(mk(l4, b5, 310 + i, 59.9, 8));
    // L5 草莓 80 单（客户 0-79，多为苹果场复购客户）
    for (let i = 0; i < 80; i++) orders.push(mk(l5, b7, i, 35.9, 3));
    const savedOrders = await this.orders.save(orders as Order[]);
    const l1Orders = savedOrders.filter((o) => o.livestreamId === l1.id);
    const l2Orders = savedOrders.filter((o) => o.livestreamId === l2.id);
    const l4Orders = savedOrders.filter((o) => o.livestreamId === l4.id);
    const l5Orders = savedOrders.filter((o) => o.livestreamId === l5.id);
    // 历史订单时间回填
    await this.orders.query('UPDATE orders SET created_at = $1 WHERE livestream_id = $2', ['2026-10-01T20:00:00', l1.id]);
    await this.orders.query('UPDATE orders SET created_at = $1 WHERE livestream_id = $2', ['2026-09-28T20:00:00', l4.id]);
    await this.orders.query('UPDATE orders SET created_at = $1 WHERE livestream_id = $2', ['2026-10-05T20:00:00', l5.id]);

    // ---------- 发货任务 ----------
    const tasks: Partial<ShippingTask>[] = [];
    const pkgOf: Record<number, string> = {
      [b1.id]: '泡沫托+纸箱',
      [b2.id]: '珍珠棉单果包装',
      [b3.id]: '自封袋+纸箱',
      [b5.id]: '真空袋+泡沫箱',
      [b7.id]: '普通泡沫托',
    };
    const ev = (f: string) => `/api/evidence/${f}`;
    const mkTask = (
      o: Order,
      batch: Batch,
      product: Product,
      status: string,
      opts: {
        vehicleLate?: boolean;
        outboundPhoto?: string;
        arrivalPhoto?: string;
        transitAbnormal?: boolean;
        shippedAt?: Date;
        deliveredAt?: Date;
      } = {},
    ) => {
      const warehouse = batch.id === b3.id ? '云岭镇前置仓' : '县域中心仓';
      const cold = !!product.coldChainRequired;
      return this.tasks.create({
        taskNo: this.no('T'),
        orderId: o.id,
        batchId: batch.id,
        warehouseName: warehouse,
        tempZone: product.tempZone,
        packagingType: pkgOf[batch.id] || product.packagingType,
        logisticsRoute: logisticsRoute(warehouse, o.city, product.tempZone),
        arrivalCityTemp: cityArrivalTemp(o.city),
        transitMaxTemp: transitMaxTemp(product.tempZone, !!opts.transitAbnormal),
        carrier: cold ? '顺丰冷运' : '中通快递',
        coldChainVehicle: cold ? `冷链车-C${(o.id % 40) + 10}` : null,
        vehicleLate: !!opts.vehicleLate,
        outboundPhoto: opts.outboundPhoto || null,
        arrivalPhoto: opts.arrivalPhoto || null,
        promiseText: '坏果包赔、48小时发货',
        status,
        shippedAt: status !== 'pending' ? (opts.shippedAt || new Date('2026-10-02T10:00:00')) : null,
        deliveredAt: status === 'delivered' ? (opts.deliveredAt || new Date('2026-10-03T15:00:00')) : null,
      });
    };
    l1Orders.forEach((o, i) => {
      const late = i < 2; // 前两单冷链车晚到
      // 前 12 单（对应已解决坏果工单）补齐出库/到货照片，供质检复盘比对
      const photo = i < 12
        ? { outboundPhoto: ev('outbound-apple.svg'), arrivalPhoto: ev('arrival-crush.svg') }
        : {};
      tasks.push(mkTask(o, b1, p1, i < 240 ? 'delivered' : late ? 'exception' : 'shipped', { vehicleLate: late, ...photo }));
    });
    l2Orders.forEach((o, i) => tasks.push(mkTask(o, b2, p2, i < 20 ? 'shipped' : 'pending')));
    l4Orders.forEach((o, i) => tasks.push(mkTask(o, b5, p5, i < 80 ? 'delivered' : 'exception')));
    // 草莓 80 单：72 送达（坏果工单对应订单补齐出库/到货照片），8 单在途
    // 坏果集中城市：上海(30.4℃)/宁波(29.9℃)多为过熟，杭州(27.9℃)多为压伤
    const stOverripeIdx = new Set([1, 5, 9, 13, 17, 25]); // 含待处理工单 idx25
    const stCrushIdx = new Set([0, 8, 16, 24]);           // 含待处理工单 idx8
    l5Orders.forEach((o, i) => {
      const photo = stOverripeIdx.has(i)
        ? { outboundPhoto: ev('outbound-strawberry.svg'), arrivalPhoto: ev('arrival-overripe.svg') }
        : stCrushIdx.has(i)
          ? { outboundPhoto: ev('outbound-strawberry.svg'), arrivalPhoto: ev('arrival-crush.svg') }
          : {};
      tasks.push(
        mkTask(o, b7, p7, i < 72 ? 'delivered' : 'shipped', {
          ...photo,
          shippedAt: new Date('2026-10-05T20:30:00'),
          deliveredAt: new Date('2026-10-06T11:00:00'),
        }),
      );
    });
    const savedTasks = await this.tasks.save(tasks as ShippingTask[]);
    // 订单状态与发货联动
    for (const o of l1Orders.slice(0, 240)) await this.orders.update(o.id, { status: 'delivered' });
    for (const o of l4Orders.slice(0, 80)) await this.orders.update(o.id, { status: 'delivered' });
    for (const o of l5Orders.slice(0, 72)) await this.orders.update(o.id, { status: 'delivered' });

    // ---------- 售后工单 ----------
    const tickets: Partial<Aftersale>[] = [];
    const taskByOrder = new Map<number, ShippingTask>(
      (savedTasks as ShippingTask[]).map((t) => [t.orderId, t]),
    );
    const snap = (o: Order) => {
      const t = taskByOrder.get(o.id);
      return {
        packagingType: t?.packagingType || null,
        logisticsRoute: t?.logisticsRoute || null,
        arrivalCityTemp: t?.arrivalCityTemp ?? null,
        tempZone: t?.tempZone || null,
      };
    };
    const mkTicket = (
      o: Order,
      batch: Batch,
      type: string,
      desc: string,
      refund: number,
      status: string,
      extra: { symptom?: string; photos?: string } = {},
    ) =>
      this.aftersales.create({
        ticketNo: this.no('AS'),
        orderId: o.id,
        batchId: batch.id,
        type,
        description: desc,
        refundAmount: refund,
        evidencePhotos: extra.photos || null,
        defectSymptom: type === '坏果' ? extra.symptom || null : null,
        ...snap(o),
        status,
        resolution: status === 'resolved' ? '已核实，退款处理完成' : null,
        handledBy: status === 'resolved' ? users[7].id : null,
        resolvedAt: status === 'resolved' ? new Date(status === 'resolved' && batch.id === b7.id ? '2026-10-06T16:00:00' : '2026-10-04T10:00:00') : null,
      });
    // B1 苹果：14 个坏果已解决（14/260=5.4% 触发坏果率预警，其中 2 单来自复购客户）+ 2 待处理 + 物流延误/少发
    const appleSymptoms = ['压伤软烂', '磕碰伤', '压伤软烂'];
    for (let i = 0; i < 12; i++) {
      tickets.push(mkTicket(
        l1Orders[i], b1, '坏果',
        `到货开箱有${(i % 3) + 1}个烂果，箱底有挤压痕迹，已拍照上传`,
        15, 'resolved',
        { symptom: appleSymptoms[i % 3], photos: ev('user-crush.svg') },
      ));
    }
    tickets.push(mkTicket(l1Orders[180], b1, '坏果', '到货有2个烂果，果皮磕碰瘀伤', 15, 'resolved', { symptom: '磕碰伤', photos: ev('user-crush.svg') }));
    tickets.push(mkTicket(l1Orders[181], b1, '坏果', '箱底果子受压软烂', 15, 'resolved', { symptom: '压伤软烂', photos: ev('user-crush.svg') }));
    tickets.push(mkTicket(l1Orders[12], b1, '坏果', '半箱果子磕碰严重', 20, 'pending', { symptom: '磕碰伤', photos: ev('user-crush.svg') }));
    tickets.push(mkTicket(l1Orders[13], b1, '坏果', '到货已有霉点', 15, 'pending', { symptom: '霉变', photos: ev('user-crush.svg') }));
    tickets.push(mkTicket(l1Orders[14], b1, '物流延误', '冷链车晚到一天，果子发软', 10, 'resolved'));
    tickets.push(mkTicket(l1Orders[15], b1, '少发', '少发1箱', 34.9, 'resolved'));
    // B7 草莓：8 个坏果已解决（8/80=10%，坏果赔付集中→坏果预警）
    // 过熟软烂 5 单集中在上海 30.4℃/宁波 29.9℃ 高温城市（指向采摘成熟度过高 + 到货高温）
    // 压伤软烂 3 单集中在杭州同一冷链线路（普通泡沫托承压不足，指向包装）
    const stOverripeOrders = [l5Orders[1], l5Orders[5], l5Orders[9], l5Orders[13], l5Orders[17]];
    for (const o of stOverripeOrders) {
      tickets.push(mkTicket(
        o, b7, '坏果',
        '草莓整盒暗红、果肉软烂流汁，包装盒完好无压痕，到货当天气温 30℃ 上下，已拍照',
        20, 'resolved',
        { symptom: '过熟软烂', photos: ev('user-overripe.svg') },
      ));
    }
    for (const i of [0, 8, 16]) {
      tickets.push(mkTicket(
        l5Orders[i], b7, '坏果',
        '盒底草莓被压烂，普通泡沫托偏软，外箱有压痕，已拍照',
        20, 'resolved',
        { symptom: '压伤软烂', photos: ev('user-crush.svg') },
      ));
    }
    // 2 个待处理坏果：杭州同包装压伤、上海高温城市过熟 → 客服优先处理
    tickets.push(mkTicket(l5Orders[24], b7, '坏果', '到货草莓压坏一半，泡沫托发软，求赔付', 20, 'pending', { symptom: '压伤软烂', photos: ev('user-crush.svg') }));
    tickets.push(mkTicket(l5Orders[25], b7, '坏果', '上海高温天，草莓过熟软烂流汁，不敢食用', 20, 'pending', { symptom: '过熟软烂', photos: ev('user-overripe.svg') }));
    // B5 腊肠：口味不符 + 拒收 + 地址错误
    tickets.push(mkTicket(l4Orders[0], b5, '口味不符', '主播说偏甜口，实际很咸', 59.9, 'resolved'));
    tickets.push(mkTicket(l4Orders[1], b5, '口味不符', '肥膘太多，与直播展示不符', 59.9, 'resolved'));
    tickets.push(mkTicket(l4Orders[2], b5, '口味不符', '说是无添加，配料表有亚硝酸钠', 59.9, 'pending'));
    tickets.push(mkTicket(l4Orders[3], b5, '用户拒收', '客户称与直播承诺不一致直接拒收', 59.9, 'resolved'));
    tickets.push(mkTicket(l4Orders[4], b5, '地址错误', '客户搬家地址未更新，需重发', 0, 'resolved'));
    const savedTickets = await this.aftersales.save(tickets as Aftersale[]);
    // 退款订单状态联动
    for (const t of savedTickets) {
      if (t.status === 'resolved' && Number(t.refundAmount) > 0) {
        await this.orders.update(t.orderId, { status: 'refunded' });
      }
    }

    // ---------- 草莓批次坏果预警：冻结同批次剩余库存（80 可售 + 40 锁定 = 120 件） ----------
    b7.frozen = true;
    b7.freezeReason = '坏果预警 DA2026100601：坏果率 10.0%（8/80），冻结剩余库存待质检定责';
    b7.frozenAt = new Date('2026-10-06T16:10:00');
    await this.batches.save(b7);
    // 同城市/同线路/同包装的 2 个待处理坏果工单进入客服优先队列
    for (const t of savedTickets) {
      if (t.batchId === b7.id && t.type === '坏果' && t.status === 'pending') {
        t.priorityFlag = true;
        await this.aftersales.save(t);
      }
    }
    const stAlert = await this.defectAlerts.save(
      this.defectAlerts.create({
        alertNo: 'DA2026100601',
        batchId: b7.id,
        livestreamId: l5.id,
        triggerSource: 'aftersale_resolve',
        status: 'reviewing',
        defectRate: 0.1,
        defectCount: 8,
        soldQty: 80,
        frozenQty: 120,
        responsibility: 'pending',
        createdBy: users[7].id,
      }),
    );
    // 质检首次复盘：出库照片完好、冷藏温区达标，到货同时存在过熟与压伤 → 暂未定责
    await this.qcReviews.save(
      this.qcReviews.create({
        alertId: stAlert.id,
        batchId: b7.id,
        outboundFindings: '出库照片显示草莓果面干爽、果形完整、九成熟，装箱时未见软烂',
        arrivalFindings: '到货照片中上海/宁波（30℃上下）5 单包装盒完好但整盒暗红软熟流汁（过熟），杭州同一冷链线路 3 单盒底有压痕、普通泡沫托偏软（压伤）',
        tempzoneFindings: '冷链温区记录 2~8℃ 达标，未见超温；上海 30.4℃、宁波 29.9℃ 到货城市高温，末端高温对过熟有一定影响',
        responsibility: 'pending',
        remark: '过熟（高温城市）与压伤（杭州同线路/同包装）并存，需结合农户采摘成熟度记录与包装承压测试最终定责',
        reviewedBy: users[6].id,
      }),
    );

    // ---------- 结算 ----------
    const b1Refund = savedTickets
      .filter((t) => t.batchId === b1.id && t.status === 'resolved')
      .reduce((s, t) => s + Number(t.refundAmount), 0);
    const b5Refund = savedTickets
      .filter((t) => t.batchId === b5.id && t.status === 'resolved')
      .reduce((s, t) => s + Number(t.refundAmount), 0);
    await this.settlements.save([
      this.settlements.create({
        farmerId: f1.id, batchId: b1.id, livestreamId: l1.id, orderCount: 260,
        grossAmount: 260 * 28, refundAmount: b1Refund,
        farmerBorneDeduction: b1Refund, platformBorne: 0,
        netAmount: 260 * 28 - b1Refund, status: 'pending',
      }),
      this.settlements.create({
        farmerId: f4.id, batchId: b5.id, livestreamId: l4.id, orderCount: 90,
        grossAmount: 90 * 38, refundAmount: b5Refund,
        farmerBorneDeduction: b5Refund, platformBorne: 0,
        netAmount: 90 * 38 - b5Refund, status: 'settled', settledAt: new Date('2026-10-03T18:00:00'),
      }),
    ]);

    // ---------- 风险事件 ----------
    await this.risks.save([
      this.risks.create({ type: 'oversell', level: 'warning', batchId: b1.id, livestreamId: l1.id, message: '直播「高山苹果开园首发」实际销量 260 超过预估 200（超出 60 件）', status: 'acknowledged' }),
      this.risks.create({ type: 'defect_rising', level: 'warning', batchId: b1.id, livestreamId: l1.id, message: '批次 B20260920-AP-01 坏果率升至 5.4%（14/260），超过 5% 预警线', status: 'open' }),
      this.risks.create({ type: 'coldchain_late', level: 'warning', batchId: b1.id, livestreamId: l1.id, message: '冷链车 冷链车-C11 晚到 6 小时，2 个发货任务受影响', status: 'open' }),
      this.risks.create({ type: 'report_expired', level: 'critical', batchId: b5.id, livestreamId: null, message: '批次 B20260910-LA-01（农家腊肠）检测报告已于 2026-10-03 过期，批次已收官但仍有售后在处理', status: 'open' }),
      this.risks.create({ type: 'promise_mismatch', level: 'critical', batchId: b5.id, livestreamId: l4.id, message: '直播「刘记腊肠年味场」主播承诺「纯手工无添加」，实际配料含亚硝酸钠，引发多起口味不符售后', status: 'open' }),
      this.risks.create({ type: 'undersupply', level: 'warning', batchId: b2.id, livestreamId: l2.id, message: '批次 B20260928-KW-01 农户通知：连续降雨，明日采摘量预计减少 30%，请关注可售库存', status: 'open' }),
      this.risks.create({ type: 'defect_alert', level: 'critical', batchId: b7.id, livestreamId: l5.id, message: '坏果预警 DA2026100601：草莓批次 B20261005-ST-01 坏果率 10.0%（8/80），已冻结同批次剩余库存 120 盒，客服优先处理同城市/同线路/同包装用户，等待质检定责', status: 'open' }),
    ]);

    // ---------- 品牌公告 ----------
    await this.notices.save([
      this.notices.create({ title: '关于腊肠批次直播话术的风险说明', content: '9月28日「刘记腊肠年味场」中主播「纯手工无添加」表述与产品实际配料不符。县域公共品牌提醒：各直播间承诺口径须以商品检测报告与配料表为准，不得夸大宣传。', level: 'warning', batchId: b5.id, status: 'published' }),
      this.notices.create({ title: '苹果批次坏果率偏高的情况说明', content: '10月1日苹果专场部分订单出现坏果，已启动坏果包赔。后续场次将下调预售量并加强出库抽检。', level: 'info', batchId: b1.id, status: 'draft' }),
    ]);

    // ---------- 售后反向决策 ----------
    const b5FirstTicket = savedTickets.find((t) => t.batchId === b5.id);
    const b1FirstTicket = savedTickets.find((t) => t.batchId === b1.id);
    await this.decisions.save([
      this.decisions.create({ aftersaleId: b5FirstTicket.id, batchId: b5.id, decisionType: 'adjust_anchor', decision: '腊肠类直播话术去掉「无添加」表述，改为展示配料表实拍', createdBy: users[7].id }),
      this.decisions.create({ aftersaleId: b5FirstTicket.id, batchId: b5.id, decisionType: 'drop_farmer', decision: '刘记腊味坊暂停排播一场，待复检报告与整改说明后评估', createdBy: ops.id }),
      this.decisions.create({ aftersaleId: b1FirstTicket.id, batchId: b1.id, decisionType: 'reduce_presale', decision: '苹果下一场预售量由 200 下调至 180，并增加出库抽检比例至 10%', createdBy: users[7].id }),
    ]);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, Farmer, Product, Batch, Selection, Livestream, InventoryLock,
      Order, ShippingTask, Aftersale, Settlement, RiskEvent, BrandNotice, FeedbackDecision,
      DefectAlert, QcReview,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
