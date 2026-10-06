import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

/** 发货任务：按订单+批次+发货仓+物流温区+售后承诺生成 */
@Entity('shipping_tasks')
export class ShippingTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'task_no', unique: true })
  taskNo: string;

  @Column({ name: 'order_id' })
  orderId: number;

  @Column({ name: 'batch_id' })
  batchId: number;

  @Column({ name: 'warehouse_name' })
  warehouseName: string;

  /** 物流温区：常温/冷藏/冷冻 */
  @Column({ name: 'temp_zone' })
  tempZone: string;

  /** 实际使用包装方式（下单时由商品/锁库快照，坏果分析按此维度归因） */
  @Column({ name: 'packaging_type', nullable: true })
  packagingType: string;

  /** 物流线路（干线+路由，如 杭州中心仓→上海冷链干线A） */
  @Column({ name: 'logistics_route', nullable: true })
  logisticsRoute: string;

  /** 到货城市温度（℃，送达时由仓库/客服回填或对接气象） */
  @Column('float', { name: 'arrival_city_temp', nullable: true })
  arrivalCityTemp: number;

  /** 运输途中最高温度（℃，冷链温区记录仪） */
  @Column('float', { name: 'transit_max_temp', nullable: true })
  transitMaxTemp: number;

  /** 出库抽检照片 URL（仓库发货前拍摄） */
  @Column('text', { name: 'outbound_photo', nullable: true })
  outboundPhoto: string;

  /** 到货照片 URL（送达/用户签收面单与外观） */
  @Column('text', { name: 'arrival_photo', nullable: true })
  arrivalPhoto: string;

  @Column({ nullable: true })
  carrier: string;

  /** 冷链车辆（冷链商品必填） */
  @Column({ name: 'cold_chain_vehicle', nullable: true })
  coldChainVehicle: string;

  /** 冷链车是否晚到 */
  @Column({ name: 'vehicle_late', default: false })
  vehicleLate: boolean;

  /** 随单售后承诺（坏果包赔/48h 送达等） */
  @Column('text', { name: 'promise_text', nullable: true })
  promiseText: string;

  /** pending/shipped/in_transit/delivered/exception */
  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'timestamp', name: 'shipped_at', nullable: true })
  shippedAt: Date;

  @Column({ type: 'timestamp', name: 'delivered_at', nullable: true })
  deliveredAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
