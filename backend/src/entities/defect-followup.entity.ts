import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 坏果预警客服跟进名单：
 * 预警生成后，客服优先处理「同城市 / 同线路 / 同包装」的用户
 * （已坏果赔付的 + 尚未报损但同特征的高风险用户）
 */
@Entity('defect_followups')
@Index(['alertId', 'orderId'], { unique: true })
export class DefectFollowup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'alert_id' })
  alertId: number;

  @Column({ name: 'order_id' })
  orderId: number;

  /** 对应坏果工单（尚无工单的高风险用户为空） */
  @Column({ name: 'aftersale_id', nullable: true })
  aftersaleId: number;

  /** 到货城市 */
  @Column()
  city: string;

  /** 物流线路 */
  @Column({ name: 'logistics_route', nullable: true })
  logisticsRoute: string;

  /** 包装方式 */
  @Column({ name: 'packaging_type', nullable: true })
  packagingType: string;

  /** 命中的优先特征：同城市/同线路/同包装，逗号分隔 */
  @Column({ name: 'match_tags' })
  matchTags: string;

  /** 优先级分数：三特征全中=3，依次递减；已有坏果工单额外加权 */
  @Column('int', { name: 'priority_score', default: 0 })
  priorityScore: number;

  /** pending(待跟进) / processing(跟进中) / done(已处理) */
  @Column({ default: 'pending' })
  status: string;

  @Column('text', { nullable: true })
  note: string;

  @Column({ name: 'handled_by', nullable: true })
  handledBy: number;

  @Column({ type: 'timestamp', name: 'handled_at', nullable: true })
  handledAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
