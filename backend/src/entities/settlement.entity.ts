import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/** 农户结算单：按 直播场次×批次 汇总 */
@Entity('settlements')
export class Settlement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'farmer_id' })
  farmerId: number;

  @Column({ name: 'batch_id' })
  batchId: number;

  @Column({ name: 'livestream_id' })
  livestreamId: number;

  @Column('int', { name: 'order_count' })
  orderCount: number;

  /** 销售总额（按供货价计，农户应收） */
  @Column('decimal', { name: 'gross_amount', precision: 12, scale: 2 })
  grossAmount: number;

  /** 售后退款扣减（总额） */
  @Column('decimal', { name: 'refund_amount', precision: 12, scale: 2, default: 0 })
  refundAmount: number;

  /** 其中因农户采摘成熟度过高、由农户承担的坏果赔付（结算扣款） */
  @Column('decimal', { name: 'farmer_borne_deduction', precision: 12, scale: 2, default: 0 })
  farmerBorneDeduction: number;

  /** 其中因包装承压/物流温区等由平台承担的部分（不扣农户） */
  @Column('decimal', { name: 'platform_borne', precision: 12, scale: 2, default: 0 })
  platformBorne: number;

  /** 实付金额 */
  @Column('decimal', { name: 'net_amount', precision: 12, scale: 2 })
  netAmount: number;

  /** pending/settled */
  @Column({ default: 'pending' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'settled_at', nullable: true })
  settledAt: Date;
}
