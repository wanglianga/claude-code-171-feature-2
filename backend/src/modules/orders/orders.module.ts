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
import { Repository } from 'typeorm';
import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { Order } from '../../entities/order.entity';
import { Livestream } from '../../entities/livestream.entity';
import { Batch } from '../../entities/batch.entity';
import { ShippingTask } from '../../entities/shipping-task.entity';
import { InventoryLock } from '../../entities/inventory-lock.entity';
import { Roles } from '../../common/decorators';
import { RisksService } from '../risks/risks.module';

class OrderDto {
  @IsInt() livestreamId: number;
  @IsNotEmpty() customerName: string;
  @IsNotEmpty() phone: string;
  @IsNotEmpty() city: string;
  @IsNotEmpty() address: string;
  @IsInt() @Min(1) quantity: number;
}

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
const GIVEN = ['芳', '伟', '敏', '静', '磊', '洋', '艳', '勇', '杰', '娟'];
const CITIES = ['杭州市', '上海市', '南京市', '合肥市', '苏州市', '宁波市', '武汉市', '长沙市'];

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(Livestream) private livestreams: Repository<Livestream>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(ShippingTask) private tasks: Repository<ShippingTask>,
    @InjectRepository(InventoryLock) private locks: Repository<InventoryLock>,
    private risks: RisksService,
  ) {}

  /**
   * 直播下单：扣减批次库存、累计销量、自动生成发货任务
   * （按订单+批次+发货仓+物流温区+售后承诺）
   */
  async create(dto: OrderDto) {
    const ls = await this.livestreams.findOne({ where: { id: dto.livestreamId } });
    if (!ls) throw new NotFoundException('直播场次不存在');
    if (ls.status !== 'live') throw new BadRequestException('该场次未在直播中');
    const batch = await this.batches.findOne({ where: { id: ls.batchId } });
    if (batch.frozenByAlert) {
      throw new BadRequestException(
        `批次 ${batch.batchNo} 已因坏果预警冻结剩余库存，暂停发货下单，待复盘结案`,
      );
    }
    if (dto.quantity > batch.availableQty + 0 && ls.actualSales + dto.quantity > 0) {
      // 允许超卖发生（真实业务场景），但触发风险事件
    }
    const price = Number(ls.price) - Number(ls.couponAmount || 0);
    const order = this.orders.create({
      orderNo: `O${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`,
      livestreamId: ls.id,
      batchId: ls.batchId,
      customerName: dto.customerName,
      phone: dto.phone,
      city: dto.city,
      address: dto.address,
      quantity: dto.quantity,
      unitPrice: Number(ls.price) as any,
      amount: Math.max(0, price * dto.quantity).toFixed(2) as any,
      status: 'paid',
    });
    const saved = await this.orders.save(order);

    ls.actualSales += dto.quantity;
    await this.livestreams.save(ls);
    batch.soldQty += dto.quantity;
    batch.availableQty = Math.max(0, batch.availableQty - dto.quantity);
    await this.batches.save(batch);

    // 超预估即预警
    if (ls.actualSales > ls.estimatedSales && ls.actualSales - dto.quantity <= ls.estimatedSales) {
      await this.risks.emit(
        'oversell',
        'warning',
        `直播「${ls.title}」销量 ${ls.actualSales} 已突破预估 ${ls.estimatedSales}，请关注库存与发货能力`,
        ls.batchId,
        ls.id,
      );
    }
    // 库存为负（超卖穿仓）→ 农户少供链路风险
    if (batch.soldQty > batch.quantity) {
      await this.risks.emit(
        'undersupply',
        'critical',
        `批次 ${batch.batchNo} 已售 ${batch.soldQty} 超过农户供货 ${batch.quantity}，存在缺货发货风险`,
        batch.id,
        ls.id,
      );
    }

    // 自动生成发货任务
    const lock = await this.locks.findOne({
      where: { livestreamId: ls.id },
      order: { id: 'DESC' },
    });
    const task = this.tasks.create({
      taskNo: `T${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`,
      orderId: saved.id,
      batchId: ls.batchId,
      warehouseName: lock ? lock.warehouseName : '县域中心仓',
      tempZone: batch.product.tempZone,
      carrier: batch.product.coldChainRequired ? '顺丰冷运' : '中通快递',
      coldChainVehicle: batch.product.coldChainRequired
        ? `冷链车-${batch.product.tempZone === '冷冻' ? 'F' : 'C'}${100 + (saved.id % 50)}`
        : null,
      logisticsRoute: this.routeForCity(dto.city, batch.product.tempZone),
      promiseText: ls.promiseText || '坏果包赔、48 小时发货',
      status: 'pending',
    });
    await this.tasks.save(task);
    return saved;
  }

  /** 按到货城市与温区模拟分配物流线路（坏果按线路归因） */
  private routeForCity(city: string, tempZone: string) {
    const east = ['上海市', '苏州市', '宁波市', '杭州市'];
    const north = ['南京市', '合肥市'];
    const line = east.includes(city) ? '华东冷链A线' : north.includes(city) ? '华东冷链B线' : '华中冷链C线';
    return tempZone === '常温' ? line.replace('冷链', '普货') : line;
  }

  /** 模拟直播爆单：批量生成订单（演示用） */
  async simulate(livestreamId: number, count: number) {
    const results: Order[] = [];
    for (let i = 0; i < count; i++) {
      const name =
        SURNAMES[Math.floor(Math.random() * SURNAMES.length)] +
        GIVEN[Math.floor(Math.random() * GIVEN.length)];
      const city = CITIES[Math.floor(Math.random() * CITIES.length)];
      try {
        const o = await this.create({
          livestreamId,
          customerName: name,
          phone: `139${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
          city,
          address: `${city}幸福路${Math.floor(Math.random() * 200) + 1}号`,
          quantity: Math.random() < 0.8 ? 1 : 2,
        });
        results.push(o);
      } catch (e) {
        break;
      }
    }
    return { created: results.length };
  }

  async list(query: any) {
    const qb = this.orders
      .createQueryBuilder('o')
      .leftJoinAndMapOne('o.livestream', Livestream, 'l', 'l.id = o.livestream_id')
      .orderBy('o.id', 'DESC')
      .limit(300);
    if (query.livestreamId) qb.andWhere('o.livestream_id = :lid', { lid: +query.livestreamId });
    if (query.batchId) qb.andWhere('o.batch_id = :bid', { bid: +query.batchId });
    if (query.status) qb.andWhere('o.status = :st', { st: query.status });
    return qb.getMany();
  }

  get(id: number) {
    return this.orders.findOne({ where: { id } });
  }
}

@Controller('orders')
export class OrdersController {
  constructor(private svc: OrdersService) {}

  @Post()
  @Roles('operator')
  create(@Body() dto: OrderDto) {
    return this.svc.create(dto);
  }

  @Post('simulate/:livestreamId')
  @Roles('operator')
  simulate(@Param('livestreamId') id: string, @Body() body: { count: number }) {
    return this.svc.simulate(+id, Math.min(+(body?.count || 10), 200));
  }

  @Get()
  list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(+id);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Livestream, Batch, ShippingTask, InventoryLock]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
