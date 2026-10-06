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

  /** 用户拍照证据：图片地址/标识（多张逗号分隔，演示环境以占位 URL 表示） */
  @Column('text', { name: 'photo_evidence', nullable: true })
  photoEvidence: string;

  /** 到货时果实损伤形态：磕碰压伤/过熟软烂/霉变异味/失水皱缩/整箱完好 */
  @Column({ name: 'damage_form', nullable: true })
  damageForm: string;

  /** 用户所在城市到货当天气温（℃），坏果归因用 */
  @Column('float', { name: 'arrival_temp', nullable: true })
  arrivalTemp: number;

  /** 坏果数量（个/件），用于坏果率与赔付核算 */
  @Column('int', { name: 'defect_qty', nullable: true })
  defectQty: number;

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
}
