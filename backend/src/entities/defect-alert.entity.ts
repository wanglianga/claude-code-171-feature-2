import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/** 预警处置状态 */
export const ALERT_STATUS = {
  open: '已形成·库存冻结',
  reviewing: '质检定责中',
  responsibility_set: '已定责',
  closed: '已闭环',
} as const;

/** 责任归属 */
export const RESPONSIBILITY = {
  pending: '待质检复盘',
  packaging: '包装承压问题',
  ripeness: '农户采摘成熟度过高',
  logistics: '物流温区异常',
  mixed: '多方共同责任',
  none: '证据不足/非品质问题',
} as const;

/**
 * 坏果率异常预警：某批发出后坏果赔付集中出现时形成
 * 按采摘批次、包装方式、物流线路、到货城市温度、用户拍照证据五维分析，
 * 形成即冻结同批次剩余库存，客服按同城市/同线路/同包装优先处理。
 */
@Entity('defect_alerts')
export class DefectAlert {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'alert_no', unique: true })
  alertNo: string;

  @Column({ name: 'batch_id' })
  batchId: number;

  @Column({ name: 'livestream_id', nullable: true })
  livestreamId: number;

  /** 形成来源：aftersale_resolve(售后坏果工单触发) / manual(人工上报) */
  @Column({ name: 'trigger_source', default: 'aftersale_resolve' })
  triggerSource: string;

  /** open/reviewing/responsibility_set/closed */
  @Column({ default: 'open' })
  status: string;

  /** 形成时坏果率 */
  @Column('float', { name: 'defect_rate', default: 0 })
  defectRate: number;

  /** 已解决坏果工单数 */
  @Column('int', { name: 'defect_count', default: 0 })
  defectCount: number;

  /** 已售件数（坏果率分母） */
  @Column('int', { name: 'sold_qty', default: 0 })
  soldQty: number;

  /** 冻结时剩余库存 */
  @Column('int', { name: 'frozen_qty', default: 0 })
  frozenQty: number;

  /** 责任归属：pending/packaging/ripeness/logistics/mixed/none */
  @Column({ name: 'responsibility', default: 'pending' })
  responsibility: string;

  /** 定责说明（质检复盘结论） */
  @Column('text', { name: 'responsibility_note', nullable: true })
  responsibilityNote: string;

  /** 定责为包装承压后，后续发货更换的包装方式 */
  @Column({ name: 'replacement_packaging', nullable: true })
  replacementPackaging: string;

  /** 定责为成熟度过高时，应在结算中扣除的坏果赔付总额（快照） */
  @Column('decimal', { name: 'farmer_deduction', precision: 12, scale: 2, default: 0 })
  farmerDeduction: number;

  @Column({ name: 'created_by', nullable: true })
  createdBy: number;

  @Column({ name: 'resolved_by', nullable: true })
  resolvedBy: number;

  @Column({ type: 'timestamp', name: 'resolved_at', nullable: true })
  resolvedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
