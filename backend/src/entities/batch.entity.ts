import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

/**
 * 供货批次 —— 全链路主键：选品、质检、直播、锁库、发货、售后、结算均挂在 batchId 上
 */
@Entity('batches')
export class Batch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'batch_no', unique: true })
  batchNo: string;

  @Column({ name: 'product_id' })
  productId: number;

  @ManyToOne(() => Product, { eager: true })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  /** 供货数量 */
  @Column('int')
  quantity: number;

  /** 当前可售库存 */
  @Column('int', { name: 'available_qty' })
  availableQty: number;

  /** 已售数量 */
  @Column('int', { name: 'sold_qty', default: 0 })
  soldQty: number;

  /** 采摘/生产日期 */
  @Column({ type: 'date', name: 'harvest_date' })
  harvestDate: string;

  /** 采摘窗口截止（超过此日期品质下降，不宜直播） */
  @Column({ type: 'date', name: 'harvest_window_end' })
  harvestWindowEnd: string;

  /** 农户供货价（元/件） */
  @Column('decimal', { name: 'supply_price', precision: 10, scale: 2 })
  supplyPrice: number;

  /** 检测报告编号 */
  @Column({ name: 'test_report_no', nullable: true })
  testReportNo: string;

  /** 检测报告有效期截止 */
  @Column({ type: 'date', name: 'test_report_expiry', nullable: true })
  testReportExpiry: string;

  /** 是否可供直播 */
  @Column({ name: 'livestream_available', default: true })
  livestreamAvailable: boolean;

  /**
   * pending(待选品) / qc_passed(质检通过) / qc_failed(质检不合格)
   * locked(已锁库) / on_sale(直播中) / closed(已收官)
   */
  @Column({ default: 'pending' })
  status: string;

  /** 坏果率（售后坏果工单/已售 动态计算） */
  @Column('float', { name: 'defect_rate', default: 0 })
  defectRate: number;

  /** 是否因坏果预警冻结同批次剩余库存（冻结后不可继续下单/锁库，已售正常发货） */
  @Column({ name: 'frozen_by_alert', default: false })
  frozenByAlert: boolean;

  /** 触发冻结的坏果预警 ID（可空） */
  @Column({ name: 'frozen_alert_id', nullable: true })
  frozenAlertId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
