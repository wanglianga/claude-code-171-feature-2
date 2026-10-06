import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

export const AFTERSALE_TYPES = [
  '坏果',
  '少发',
  '物流延误',
  '地址错误',
  '用户拒收',
  '口味不符',
];

/** 坏果表象：用于区分包装承压（压伤/磕碰）与采摘成熟度过高（过熟软烂）等责任 */
export const DEFECT_SYMPTOMS = [
  '压伤软烂',
  '磕碰伤',
  '过熟软烂',
  '霉变',
  '冻伤',
  '脱水发皱',
];

@Entity('aftersales')
export class Aftersale {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'ticket_no', unique: true })
  ticketNo: string;

  @Column({ name: 'order_id' })
  orderId: number;

  @Column({ name: 'batch_id' })
  batchId: number;

  /** 坏果/少发/物流延误/地址错误/用户拒收/口味不符 */
  @Column()
  type: string;

  @Column('text')
  description: string;

  /** 用户拍照证据 URL（多张逗号分隔，坏果定责关键证据） */
  @Column('text', { name: 'evidence_photos', nullable: true })
  evidencePhotos: string;

  /** 坏果表象：磕碰伤/压伤软烂/过熟软烂/霉变/冻伤/脱水发皱 */
  @Column({ name: 'defect_symptom', nullable: true })
  defectSymptom: string;

  /** 包装方式快照（下单/发货时） */
  @Column({ name: 'packaging_type', nullable: true })
  packagingType: string;

  /** 物流线路快照 */
  @Column({ name: 'logistics_route', nullable: true })
  logisticsRoute: string;

  /** 到货城市温度快照（℃） */
  @Column('float', { name: 'arrival_city_temp', nullable: true })
  arrivalCityTemp: number;

  /** 物流温区快照 */
  @Column({ name: 'temp_zone', nullable: true })
  tempZone: string;

  /** 坏果赔付金额（农户承担部分，结算扣赔依据；为空表示未定责） */
  @Column('decimal', { name: 'farmer_borne', precision: 10, scale: 2, nullable: true })
  farmerBorne: number;

  /** 是否进入坏果预警优先处理队列（同城市/同线路/同包装命中） */
  @Column({ name: 'priority_flag', default: false })
  priorityFlag: boolean;

  @Column('decimal', { name: 'refund_amount', precision: 10, scale: 2, default: 0 })
  refundAmount: number;

  /** pending/approved/rejected/resolved */
  @Column({ default: 'pending' })
  status: string;

  @Column('text', { nullable: true })
  resolution: string;

  @Column({ name: 'handled_by', nullable: true })
  handledBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'resolved_at', nullable: true })
  resolvedAt: Date;

  /** 非持久化：坏果分析时挂载的关联订单与发货任务 */
  order?: any;
  task?: any;
}
