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
import { Aftersale, AFTERSALE_TYPES, DEFECT_SYMPTOMS } from '../../entities/aftersale.entity';
import { Order } from '../../entities/order.entity';
import { Batch } from '../../entities/batch.entity';
import { FeedbackDecision } from '../../entities/feedback-decision.entity';
import { BrandNotice } from '../../entities/brand-notice.entity';
import { ShippingTask } from '../../entities/shipping-task.entity';
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
  /** 用户拍照证据 URL，多张逗号分隔 */
  @IsOptional() evidencePhotos?: string;
  /** 坏果表象 */
  @IsOptional() defectSymptom?: string;
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
    @InjectRepository(ShippingTask) private tasks: Repository<ShippingTask>,
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
    if (dto.type === '坏果' && dto.defectSymptom && !DEFECT_SYMPTOMS.includes(dto.defectSymptom)) {
      throw new BadRequestException(`坏果表象须为：${DEFECT_SYMPTOMS.join('/')}`);
    }
    // 快照发货维度信息，供坏果按包装/线路/到货温度归因
    const task = await this.tasks.findOne({ where: { orderId: order.id } });
    const t = this.tickets.create({
      ticketNo: `AS${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
      orderId: order.id,
      batchId: order.batchId,
      type: dto.type,
      description: dto.description,
      refundAmount: (dto.refundAmount || 0) as any,
      evidencePhotos: dto.evidencePhotos || null,
      defectSymptom: dto.type === '坏果' ? dto.defectSymptom || null : null,
      packagingType: task?.packagingType || null,
      logisticsRoute: task?.logisticsRoute || null,
      arrivalCityTemp: task?.arrivalCityTemp ?? null,
      tempZone: task?.tempZone || null,
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

    // 坏果工单 → 重算批次坏果率，达预警线形成坏果预警（自动冻结同批库存/客服优先）
    if (t.type === '坏果') {
      const batch = await this.batches.findOne({ where: { id: t.batchId } });
      if (batch && batch.soldQty > 0) {
        await this.defectAlerts.evaluateBatch(batch.id, user);
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
    TypeOrmModule.forFeature([Aftersale, Order, Batch, FeedbackDecision, BrandNotice, ShippingTask]),
    DefectAlertsModule,
  ],
  controllers: [AftersalesController],
  providers: [AftersalesService],
})
export class AftersalesModule {}
