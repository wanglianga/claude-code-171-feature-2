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
import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { Aftersale, AFTERSALE_TYPES } from '../../entities/aftersale.entity';
import { Order } from '../../entities/order.entity';
import { Batch } from '../../entities/batch.entity';
import { FeedbackDecision } from '../../entities/feedback-decision.entity';
import { BrandNotice } from '../../entities/brand-notice.entity';
import { Roles } from '../../common/decorators';
import { ReqUser } from '../../common/req-user.decorator';
import { RisksService } from '../risks/risks.module';
import { FarmersService } from '../farmers/farmers.module';
import { DefectAlertsModule, DefectAlertsService } from '../defect-alerts/defect-alerts.module';

class CreateTicketDto {
  @IsInt() orderId: number;
  @IsNotEmpty() type: string;
  @IsNotEmpty() description: string;
  @IsOptional() refundAmount?: number;
  /** 用户拍照证据（多个地址逗号分隔） */
  @IsOptional() photoEvidence?: string;
  /** 损伤形态：磕碰压伤/过熟软烂/霉变异味/失水皱缩 */
  @IsOptional() damageForm?: string;
  /** 到货城市当天气温 ℃ */
  @IsOptional() arrivalTemp?: number;
  /** 坏果数量 */
  @IsOptional() defectQty?: number;
}

class ResolveDto {
  @IsNotEmpty() status: string; // resolved / rejected
  @IsOptional() resolution?: string;
  @IsOptional() refundAmount?: number;
}

class FeedbackDto {
  @IsNotEmpty() decisionType: string;
  @IsNotEmpty() decision: string;
}

@Injectable()
export class AftersalesService {
  constructor(
    @InjectRepository(Aftersale) private tickets: Repository<Aftersale>,
    @InjectRepository(Order) private orders: Repository<Order>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(FeedbackDecision) private decisions: Repository<FeedbackDecision>,
    @InjectRepository(BrandNotice) private notices: Repository<BrandNotice>,
    private risks: RisksService,
    private farmersSvc: FarmersService,
    private defectAlerts: DefectAlertsService,
  ) {}

  async create(dto: CreateTicketDto) {
    const order = await this.orders.findOne({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException('订单不存在');
    if (!AFTERSALE_TYPES.includes(dto.type)) {
      throw new BadRequestException(`售后类型须为：${AFTERSALE_TYPES.join('/')}`);
    }
    const t = this.tickets.create({
      ticketNo: `AS${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
      orderId: order.id,
      batchId: order.batchId,
      type: dto.type,
      description: dto.description,
      refundAmount: (dto.refundAmount || 0) as any,
      photoEvidence: dto.photoEvidence || null,
      damageForm: dto.type === '坏果' ? dto.damageForm || null : null,
      arrivalTemp: dto.arrivalTemp != null ? (dto.arrivalTemp as any) : null,
      defectQty: dto.defectQty != null ? (dto.defectQty as any) : null,
      status: 'pending',
    });
    return this.tickets.save(t);
  }

  async list(query: any) {
    const qb = this.tickets
      .createQueryBuilder('a')
      .leftJoinAndMapOne('a.order', Order, 'o', 'o.id = a.order_id')
      .orderBy('a.id', 'DESC')
      .limit(300);
    if (query.status) qb.andWhere('a.status = :st', { st: query.status });
    if (query.type) qb.andWhere('a.type = :tp', { tp: query.type });
    if (query.batchId) qb.andWhere('a.batch_id = :bid', { bid: +query.batchId });
    return qb.getMany();
  }

  /** 处理工单：退款/拒绝，坏果类工单回流批次坏果率 */
  async resolve(id: number, dto: ResolveDto, user: any) {
    const t = await this.tickets.findOne({ where: { id } });
    if (!t) throw new NotFoundException('工单不存在');
    if (!['resolved', 'rejected'].includes(dto.status)) {
      throw new BadRequestException('处理结果须为 resolved 或 rejected');
    }
    t.status = dto.status;
    t.resolution = dto.resolution || null;
    t.handledBy = user.sub;
    t.resolvedAt = new Date();
    if (dto.status === 'resolved' && dto.refundAmount != null) {
      t.refundAmount = dto.refundAmount as any;
    }
    await this.tickets.save(t);

    if (dto.status === 'resolved' && Number(t.refundAmount) > 0) {
      await this.orders.update(t.orderId, { status: 'refunded' });
    }

    // 坏果工单 → 重算批次坏果率，超阈值触发风险
    if (t.type === '坏果') {
      const batch = await this.batches.findOne({ where: { id: t.batchId } });
      if (batch && batch.soldQty > 0) {
        const defectCount = await this.tickets.count({
          where: { batchId: t.batchId, type: '坏果', status: 'resolved' },
        });
        const rate = defectCount / batch.soldQty;
        batch.defectRate = Math.round(rate * 10000) / 10000;
        await this.batches.save(batch);
        if (rate >= 0.05) {
          await this.risks.emit(
            'defect_rising',
            rate >= 0.1 ? 'critical' : 'warning',
            `批次 ${batch.batchNo} 坏果率升至 ${(rate * 100).toFixed(1)}%（${defectCount}/${batch.soldQty}），超过预警线`,
            batch.id,
          );
          // 坏果赔付集中出现 → 形成坏果预警：冻结同批剩余库存 + 五维归因 + 客服优先名单
          await this.defectAlerts.triggerForBatch(batch.id);
        }
        await this.farmersSvc.recomputeStats(batch.product.farmerId);
      }
    }
    return t;
  }

  /**
   * 售后反向决策：继续/暂停农户合作、调整主播口径、降低预售量、发布品牌风险说明
   */
  async feedback(ticketId: number, dto: FeedbackDto, user: any) {
    const t = await this.tickets.findOne({ where: { id: ticketId } });
    if (!t) throw new NotFoundException('工单不存在');
    const allowed = ['continue_farmer', 'drop_farmer', 'adjust_anchor', 'reduce_presale', 'brand_notice'];
    if (!allowed.includes(dto.decisionType)) {
      throw new BadRequestException('决策类型不合法');
    }
    const rec = this.decisions.create({
      aftersaleId: t.id,
      batchId: t.batchId,
      decisionType: dto.decisionType,
      decision: dto.decision,
      createdBy: user.sub,
    });
    const saved = await this.decisions.save(rec);
    // 品牌风险说明 → 自动生成公告草稿
    if (dto.decisionType === 'brand_notice') {
      const batch = await this.batches.findOne({ where: { id: t.batchId } });
      await this.notices.save(
        this.notices.create({
          title: `关于${batch?.product?.name || '相关商品'}（批次 ${batch?.batchNo}）的风险说明`,
          content: dto.decision,
          level: 'warning',
          batchId: t.batchId,
          status: 'draft',
        }),
      );
    }
    return saved;
  }

  listFeedback(query: any) {
    const where: any = {};
    if (query.batchId) where.batchId = +query.batchId;
    return this.decisions.find({ where, order: { id: 'DESC' }, take: 100 });
  }
}

@Controller('aftersales')
export class AftersalesController {
  constructor(private svc: AftersalesService) {}

  @Post()
  @Roles('aftersales', 'operator')
  create(@Body() dto: CreateTicketDto) {
    return this.svc.create(dto);
  }

  @Get()
  list(@Query() q: any) {
    return this.svc.list(q);
  }

  @Post(':id/resolve')
  @Roles('aftersales')
  resolve(@Param('id') id: string, @Body() dto: ResolveDto, @ReqUser() user: any) {
    return this.svc.resolve(+id, dto, user);
  }

  @Post(':id/feedback')
  @Roles('aftersales', 'operator')
  feedback(@Param('id') id: string, @Body() dto: FeedbackDto, @ReqUser() user: any) {
    return this.svc.feedback(+id, dto, user);
  }

  @Get('feedback/list')
  feedbackList(@Query() q: any) {
    return this.svc.listFeedback(q);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Aftersale, Order, Batch, FeedbackDecision, BrandNotice]),
    DefectAlertsModule,
  ],
  controllers: [AftersalesController],
  providers: [AftersalesService],
})
export class AftersalesModule {}
