import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { AuthModule } from './modules/auth/auth.module';
import { RisksModule } from './modules/risks/risks.module';
import { FarmersModule } from './modules/farmers/farmers.module';
import { ProductsModule } from './modules/products/products.module';
import { SelectionsModule } from './modules/selections/selections.module';
import { LivestreamsModule } from './modules/livestreams/livestreams.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { AftersalesModule } from './modules/aftersales/aftersales.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { DefectAlertsModule } from './modules/defect-alerts/defect-alerts.module';
import { NoticesModule } from './modules/notices/notices.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'agri_live',
      autoLoadEntities: true,
      synchronize: true,
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'agri-live-dev-secret',
      signOptions: { expiresIn: '12h' },
    }),
    AuthModule,
    RisksModule,
    FarmersModule,
    ProductsModule,
    SelectionsModule,
    LivestreamsModule,
    InventoryModule,
    OrdersModule,
    ShippingModule,
    AftersalesModule,
    SettlementsModule,
    DefectAlertsModule,
    NoticesModule,
    AnalyticsModule,
    SeedModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
