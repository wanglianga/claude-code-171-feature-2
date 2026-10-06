import {
  BadRequestException,
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
import { Settlement } from '../../entities/settlement.entity';
import { Livestream } from '../../entities/livestream.entity';
import { Batch } from '../../entities/batch.entity';
import { Order } from '../../entities/order.entity';
import { Aftersale } from '../../entities/aftersale.entity';
import { DefectAlert } from '../../entities/defect-alert.entity';
import { Roles } from '../../common/decorators';
import { ReqUser } from '../../common/req-user.decorator';
import { FarmersService } from '../farmers/farmers.module';

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement) private settlements: Repository<Settlement>,
    @InjectRepository(Livestream) private livestreams: Repository<Livestream>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(Aftersale) private aftersales: Repository<Aftersale>,
    @InjectRepository(DefectAlert) private defectAlerts: Repository<DefectAlert>,
    private farmersSvc: FarmersService,
  ) {}

  /**
   * 计算农户应承担的售后扣减：
   * - 非坏果类退款：维持原规则，由农户承担
   * - 坏果类退款：若批次已生成坏果预警，仅承担质检定责为农户（采摘成熟度过高）的部分，
   *   包装承压/物流环节由平台承担；预警尚未定责时暂不扣农户（结案复盘后由 recomputeForBatch 重算）
   * - 没有预警的批次：坏果退款也按原规则由农户承担
   */
  private async farmerBorneRefund(batchId: number, tickets: Aftersale[]) {
    const totalRefund = tickets.reduce((s, t) => s + Number(t.refundAmount || 0), 0);
    const nonDefect = tickets
      .filter((t) => t.type !== '坏果')
      .reduce((s, t) => s + Number(t.refundAmount || 0), 0);
    const defectRefund = totalRefund - nonDefect;

    const alerts = await this.defectAlerts.find({ where: { batchId } });
    let defectFarmer: number;
    if (!alerts.length) {
      defectFarmer = defectRefund;
    } else if (alerts.every((a) => a.status === 'open')) {
      defectFarmer = 0;
    } else {
      defectFarmer = alerts
        .filter((a) => ['deduct_farmer', 'both'].includes(a.actionType || ''))
        .reduce((s, a) => s + Number(a.farmerDeductionAmount || 0), 0);
      defectFarmer = Math.min(defectFarmer, defectRefund);
    }
    return {
      totalRefund: Math.round(totalRefund * 100) / 100,
      farmerDeduction: Math.round((nonDefect + defectFarmer) * 100) / 100,
    };
  }

  /** 坏果定责发生变化后，重算该批次待打款结算单的农户扣减 */
  async recomputeForBatch(batchId: number) {
    const list = await this.settlements.find({ where: { batchId, status: 'pending' } });
    for (const s of list) {
      const tickets = await this.aftersales.find({
        where: { batchId, status: 'resolved' },
      });
      const { totalRefund, farmerDeduction } = await this.farmerBorneRefund(batchId, tickets);
      s.refundAmount = totalRefund.toFixed(2) as any;
      s.farmerDeduction = farmerDeduction.toFixed(2) as any;
      s.netAmount = Math.max(0, Number(s.grossAmount) - farmerDeduction).toFixed(2) as any;
      await this.settlements.save(s);
    }
    return list;
  }

  /**
   * 按直播场次生成农户结算单：
   * 应收 = 已售件数 × 供货价；农户扣减按坏果定责结果计算，其余售后退款由平台/物流/包装环节承担
   */
  async generate(livestreamId: number) {
    const ls = await this.livestreams.findOne({ where: { id: livestreamId } });
    if (!ls) throw new NotFoundException('直播场次不存在');
    if (ls.status !== 'ended') throw new BadRequestException('仅已结束的场次可结算');
    const existing = await this.settlements.findOne({ where: { livestreamId } });
    if (existing) throw new BadRequestException('该场次已生成结算单');
    const batch = await this.batches.findOne({ where: { id: ls.batchId } });
    const orders = await this.orders.find({ where: { livestreamId } });
    const qty = orders.reduce((s, o) => s + o.quantity, 0);
    const gross = qty * Number(batch.supplyPrice);
    const tickets = await this.aftersales.find({
      where: { batchId: batch.id, status: 'resolved' },
    });
    const { totalRefund: refund, farmerDeduction } = await this.farmerBorneRefund(batch.id, tickets);
    const net = Math.max(0, gross - farmerDeduction);
    const rec = this.settlements.create({
      farmerId: batch.product.farmerId,
      batchId: batch.id,
      livestreamId: ls.id,
      orderCount: orders.length,
      grossAmount: gross.toFixed(2) as any,
      refundAmount: refund.toFixed(2) as any,
      farmerDeduction: farmerDeduction.toFixed(2) as any,
      netAmount: net.toFixed(2) as any,
      status: 'pending',
    });
    const saved = await this.settlements.save(rec);
    await this.farmersSvc.recomputeStats(batch.product.farmerId);
    return saved;
  }

  async list(user: any, query: any) {
    const where: any = {};
    if (user.role === 'farmer') where.farmerId = user.farmerId;
    if (query.status) where.status = query.status;
    return this.settlements.find({ where, order: { id: 'DESC' } });
  }

  async pay(id: number) {
    const s = await this.settlements.findOne({ where: { id } });
    if (!s) throw new NotFoundException('结算单不存在');
    if (s.status === 'settled') throw new BadRequestException('已结算');
    s.status = 'settled';
    s.settledAt = new Date();
    return this.settlements.save(s);
  }
}

@Controller('settlements')
export class SettlementsController {
  constructor(private svc: SettlementsService) {}

  @Post('generate/:livestreamId')
  @Roles('operator')
  generate(@Param('livestreamId') id: string) {
    return this.svc.generate(+id);
  }

  @Get()
  list(@ReqUser() user: any, @Query() q: any) {
    return this.svc.list(user, q);
  }

  @Post(':id/pay')
  @Roles('operator')
  pay(@Param('id') id: string) {
    return this.svc.pay(+id);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Settlement, Livestream, Batch, Order, Aftersale, DefectAlert]),
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
