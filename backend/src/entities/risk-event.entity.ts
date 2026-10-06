import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

export const RISK_TYPES: Record<string, string> = {
  oversell: '直播销量超预估',
  undersupply: '农户临时少供',
  report_expired: '检测报告过期',
  coldchain_late: '冷链车晚到',
  defect_rising: '同批次坏果率升高',
  defect_alert: '坏果率异常预警（已冻结同批库存）',
  promise_mismatch: '主播承诺与规格不符',
};

@Entity('risk_events')
export class RiskEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  type: string;

  /** info/warning/critical */
  @Column({ default: 'warning' })
  level: string;

  @Column({ name: 'batch_id', nullable: true })
  batchId: number;

  @Column({ name: 'livestream_id', nullable: true })
  livestreamId: number;

  @Column('text')
  message: string;

  /** open/acknowledged/resolved */
  @Column({ default: 'open' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
