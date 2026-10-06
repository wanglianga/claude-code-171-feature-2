import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/** 坏果定责结论 */
export const DEFECT_CAUSES: Record<string, string> = {
  packaging_pressure: '包装承压不足（运输磕碰压伤）',
  harvest_ripeness: '农户采摘成熟度过高（到货过熟软烂）',
  logistics_temp: '物流温区/时效异常（脱冷高温致坏）',
  mixed: '多因素叠加',
  undetermined: '暂未认定',
  none: '排除批次性问题',
};

/** 处置动作 */
export const DEFECT_ACTIONS: Record<string, string> = {
  change_packaging: '后续发货更换包装',
  deduct_farmer: '结算扣除农户对应赔付',
  both: '换包装 + 扣除农户赔付',
  none: '仅记录，不处置',
};

/**
 * 坏果率异常预警：某批次坏果赔付集中出现时自动生成，
 * 冻结同批次剩余库存，并按 采摘批次/包装方式/物流线路/到货城市温度/用户拍照证据 五维归因
 */
@Entity('defect_alerts')
export class DefectAlert {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'alert_no', unique: true })
  alertNo: string;

  @Column({ name: 'batch_id' })
  batchId: number;

  /** open(预警中/已冻结) / reviewing(复盘中) / closed(已结案) */
  @Column({ default: 'open' })
  status: string;

  /** 触发时坏果率快照 */
  @Column('float', { name: 'defect_rate' })
  defectRate: number;

  /** 触发时已解决坏果工单数 */
  @Column('int', { name: 'defect_count' })
  defectCount: number;

  /** 触发时批次已售件数 */
  @Column('int', { name: 'sold_qty' })
  soldQty: number;

  /** 冻结的同批次剩余库存数量 */
  @Column('int', { name: 'frozen_qty', default: 0 })
  frozenQty: number;

  /** 包装方式快照 */
  @Column({ name: 'packaging_type', nullable: true })
  packagingType: string;

  /** 物流温区快照 */
  @Column({ name: 'temp_zone', nullable: true })
  tempZone: string;

  /** 采摘日 → 到货平均间隔（天），衡量采摘成熟度 */
  @Column('float', { name: 'harvest_to_delivery_days', nullable: true })
  harvestToDeliveryDays: number;

  /** 运输途中超温任务占比 */
  @Column('float', { name: 'temp_breach_rate', nullable: true })
  tempBreachRate: number;

  /** 五维分析结果（城市/线路/包装分布），simple-json 存储 */
  @Column('simple-json', { name: 'dimension', nullable: true })
  dimension: {
    byCity: { city: string; orders: number; defects: number; rate: number; avgTemp: number }[];
    byRoute: { route: string; tasks: number; defects: number; rate: number; vehicleLate: number }[];
    byPackaging: { packaging: string; pressureResistance: string; defects: number; rate: number }[];
    evidence: { damageForm: string; count: number }[];
    suspect: string[];
  };

  /** 定责结论（见 DEFECT_CAUSES） */
  @Column({ name: 'root_cause', default: 'undetermined' })
  rootCause: string;

  /** 责任方：farmer(农户) / platform(平台/包装) / logistics(物流) / shared(多方) / null */
  @Column({ name: 'responsible_party', nullable: true })
  responsibleParty: string;

  /** 处置动作（见 DEFECT_ACTIONS） */
  @Column({ name: 'action_type', nullable: true })
  actionType: string;

  /** 后续发货拟更换的包装方式 */
  @Column({ name: 'new_packaging', nullable: true })
  newPackaging: string;

  /** 认定由农户承担、结算时扣除的赔付金额（元） */
  @Column('decimal', { name: 'farmer_deduction_amount', precision: 12, scale: 2, default: 0 })
  farmerDeductionAmount: number;

  /** 复盘结论：出库照片/到货照片/温区比对说明 */
  @Column('text', { name: 'conclusion', nullable: true })
  conclusion: string;

  @Column({ name: 'reviewed_by', nullable: true })
  reviewedBy: number;

  @Column({ type: 'timestamp', name: 'reviewed_at', nullable: true })
  reviewedAt: Date;

  @Column({ type: 'timestamp', name: 'closed_at', nullable: true })
  closedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
