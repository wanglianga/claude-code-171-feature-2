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
import { InventoryLock } from '../../entities/inventory-lock.entity';
import { Livestream } from '../../entities/livestream.entity';
import { Batch } from '../../entities/batch.entity';
import { Roles } from '../../common/decorators';

class LockDto {
  @IsInt() livestreamId: number;
  @IsInt() @Min(1) lockedQty: number;
  @IsNotEmpty() packagingMaterial: string;
  @IsInt() @Min(1) packagingQty: number;
  @IsNotEmpty() warehouseName: string;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryLock) private locks: Repository<InventoryLock>,
    @InjectRepository(Livestream) private livestreams: Repository<Livestream>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
  ) {}

  /** 仓库按直播排期锁定库存与包材 */
  async lock(dto: LockDto) {
    const ls = await this.livestreams.findOne({ where: { id: dto.livestreamId } });
    if (!ls) throw new NotFoundException('直播场次不存在');
    if (!['planned', 'locked'].includes(ls.status)) {
      throw new BadRequestException(`场次状态 ${ls.status} 不可锁库`);
    }
    const batch = await this.batches.findOne({ where: { id: ls.batchId } });
    if (batch.frozenByAlert) {
      throw new BadRequestException(`批次 ${batch.batchNo} 已因坏果预警冻结，暂停锁库与后续发货`);
    }
    if (dto.lockedQty > batch.availableQty) {
      throw new BadRequestException(`可售库存不足：仅剩 ${batch.availableQty} 件`);
    }
    const rec = this.locks.create({
      livestreamId: ls.id,
      batchId: batch.id,
      lockedQty: dto.lockedQty,
      packagingMaterial: dto.packagingMaterial,
      packagingQty: dto.packagingQty,
      warehouseName: dto.warehouseName,
      status: 'locked',
    });
    const saved = await this.locks.save(rec);
    batch.availableQty -= dto.lockedQty;
    batch.status = 'locked';
    await this.batches.save(batch);
    ls.status = 'locked';
    await this.livestreams.save(ls);
    return saved;
  }

  /** 释放锁定（排期取消/调整） */
  async release(id: number) {
    const lock = await this.locks.findOne({ where: { id } });
    if (!lock) throw new NotFoundException('锁定记录不存在');
    if (lock.status !== 'locked') throw new BadRequestException('仅锁定中的记录可释放');
    lock.status = 'released';
    await this.locks.save(lock);
    const batch = await this.batches.findOne({ where: { id: lock.batchId } });
    batch.availableQty += lock.lockedQty;
    if (batch.status === 'locked') batch.status = 'qc_passed';
    await this.batches.save(batch);
    const ls = await this.livestreams.findOne({ where: { id: lock.livestreamId } });
    if (ls && ls.status === 'locked') {
      ls.status = 'planned';
      await this.livestreams.save(ls);
    }
    return lock;
  }

  list(query: any) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.batchId) where.batchId = +query.batchId;
    if (query.livestreamId) where.livestreamId = +query.livestreamId;
    return this.locks.find({ where, order: { id: 'DESC' } });
  }
}

@Controller('inventory')
export class InventoryController {
  constructor(private svc: InventoryService) {}

  @Post('locks')
  @Roles('warehouse', 'operator')
  lock(@Body() dto: LockDto) {
    return this.svc.lock(dto);
  }

  @Post('locks/:id/release')
  @Roles('warehouse', 'operator')
  release(@Param('id') id: string) {
    return this.svc.release(+id);
  }

  @Get('locks')
  list(@Query() q: any) {
    return this.svc.list(q);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([InventoryLock, Livestream, Batch])],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
