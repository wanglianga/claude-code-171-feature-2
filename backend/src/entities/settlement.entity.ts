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

  /** 售后退款扣减 */
  @Column('decimal', { name: 'refund_amount', precision: 12, scale: 2, default: 0 })
  refundAmount: number;

  /**
   * 其中经坏果定责、由农户承担（采摘成熟度过高等）的赔付扣减；
   * refundAmount - farmerDeduction 为平台/物流/包装环节承担，不扣农户
   */
  @Column('decimal', { name: 'farmer_deduction', precision: 12, scale: 2, default: 0 })
  farmerDeduction: number;

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
