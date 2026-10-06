import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShippingTask } from '../../entities/shipping-task.entity';
import { Order } from '../../entities/order.entity';
import { Batch } from '../../entities/batch.entity';
import { Roles } from '../../common/decorators';
import { RisksService } from '../risks/risks.module';
import { cityArrivalTemp, transitMaxTemp } from '../../common/logistics';

class ShipDto {
  outboundPhoto?: string;
}
class DeliverDto {
  arrivalPhoto?: string;
  arrivalCityTemp?: number;
  transitMaxTemp?: number;
}

@Injectable()
export class ShippingService {
  constructor(
    @InjectRepository(ShippingTask) private tasks: Repository<ShippingTask>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    private risks: RisksService,
  ) {}

  list(query: any) {
    const qb = this.tasks
      .createQueryBuilder('t')
      .leftJoinAndMapOne('t.order', Order, 'o', 'o.id = t.order_id')
      .orderBy('t.id', 'DESC')
      .limit(300);
    if (query.status) qb.andWhere('t.status = :st', { st: query.status });
    if (query.batchId) qb.andWhere('t.batch_id = :bid', { bid: +query.batchId });
    if (query.tempZone) qb.andWhere('t.temp_zone = :tz', { tz: query.tempZone });
    return qb.getMany();
  }

  private async getTask(id: number) {
    const t = await this.tasks.findOne({ where: { id } });
    if (!t) throw new NotFoundException('发货任务不存在');
    return t;
  }

  async ship(id: number, dto?: ShipDto) {
    const t = await this.getTask(id);
    if (t.status !== 'pending') throw new BadRequestException('仅待发货任务可发货');
    const batch = await this.batches.findOne({ where: { id: t.batchId } });
    if (batch?.frozen) {
      throw new BadRequestException(
        `批次 ${batch.batchNo} 已因坏果预警冻结，暂停发货；若已更换包装并定责，请待解冻后再发`,
      );
    }
    t.status = 'shipped';
    t.shippedAt = new Date();
    if (dto?.outboundPhoto) t.outboundPhoto = dto.outboundPhoto;
    await this.tasks.save(t);
    await this.orders.update(t.orderId, { status: 'shipped' });
    return t;
  }

  async deliver(id: number, dto?: DeliverDto) {
    const t = await this.getTask(id);
    if (!['shipped', 'in_transit'].includes(t.status)) {
      throw new BadRequestException('任务未在运输中');
    }
    t.status = 'delivered';
    t.deliveredAt = new Date();
    if (dto?.arrivalPhoto) t.arrivalPhoto = dto.arrivalPhoto;
    if (dto?.arrivalCityTemp != null) t.arrivalCityTemp = +dto.arrivalCityTemp;
    if (dto?.transitMaxTemp != null) t.transitMaxTemp = +dto.transitMaxTemp;
    // 未显式回填时，按城市/温区补齐稳定模拟值（演示用）
    const order = await this.orders.findOne({ where: { id: t.orderId } });
    if (t.arrivalCityTemp == null && order) t.arrivalCityTemp = cityArrivalTemp(order.city);
    if (t.transitMaxTemp == null) t.transitMaxTemp = transitMaxTemp(t.tempZone);
    await this.tasks.save(t);
    await this.orders.update(t.orderId, { status: 'delivered' });
    return t;
  }

  /** 冷链车晚到：标记任务并触发链路风险 */
  async vehicleLate(id: number, note: string) {
    const t = await this.getTask(id);
    if (!t.coldChainVehicle) throw new BadRequestException('该任务非冷链运输');
    t.vehicleLate = true;
    t.status = 'exception';
    await this.tasks.save(t);
    const batch = await this.batches.findOne({ where: { id: t.batchId } });
    await this.risks.emit(
      'coldchain_late',
      'warning',
      `冷链车 ${t.coldChainVehicle} 晚到（任务 ${t.taskNo}，批次 ${batch?.batchNo}，温区 ${t.tempZone}）${note ? '：' + note : ''}`,
      t.batchId,
    );
    return t;
  }

  async exception(id: number, note: string) {
    const t = await this.getTask(id);
    t.status = 'exception';
    await this.tasks.save(t);
    return t;
  }
}

@Controller('shipping')
export class ShippingController {
  constructor(private svc: ShippingService) {}

  @Get('tasks')
  list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Post('tasks/:id/ship')
  @Roles('warehouse')
  ship(@Param('id') id: string, @Body() dto?: ShipDto) {
    return this.svc.ship(+id, dto || {});
  }

  @Post('tasks/:id/deliver')
  @Roles('warehouse')
  deliver(@Param('id') id: string, @Body() dto?: DeliverDto) {
    return this.svc.deliver(+id, dto || {});
  }

  @Post('tasks/:id/vehicle-late')
  @Roles('warehouse')
  late(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.vehicleLate(+id, body?.note || '');
  }

  @Post('tasks/:id/exception')
  @Roles('warehouse')
  exception(@Param('id') id: string, @Body() body: { note?: string }) {
    return this.svc.exception(+id, body?.note || '');
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ShippingTask, Order, Batch])],
  controllers: [ShippingController],
  providers: [ShippingService],
})
export class ShippingModule {}
