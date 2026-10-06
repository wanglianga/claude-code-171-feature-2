import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/**
 * 质检复盘记录：坏果预警形成后，质检人员比对
 * 出库照片、到货照片与物流温区，确认责任归属。
 * 一条预警可多次复盘，最终一次给出责任结论。
 */
@Entity('qc_reviews')
export class QcReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'alert_id' })
  alertId: number;

  @Column({ name: 'batch_id' })
  batchId: number;

  /** 关联的发货任务（取该任务出库/到货照片与温区） */
  @Column({ name: 'shipping_task_id', nullable: true })
  shippingTaskId: number;

  /** 出库照片比对结论：完好/已有损伤 */
  @Column({ name: 'outbound_findings', nullable: true })
  outboundFindings: string;

  /** 到货照片比对结论：压伤/过熟/霉变/冻伤等 */
  @Column({ name: 'arrival_findings', nullable: true })
  arrivalFindings: string;

  /** 物流温区核查结论：温区达标/途中超温/冷链中断 */
  @Column({ name: 'tempzone_findings', nullable: true })
  tempzoneFindings: string;

  /** 责任归属建议：packaging/ripeness/logistics/mixed/none/pending */
  @Column({ name: 'responsibility', default: 'pending' })
  responsibility: string;

  @Column('text', { nullable: true })
  remark: string;

  @Column({ name: 'reviewed_by', nullable: true })
  reviewedBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
