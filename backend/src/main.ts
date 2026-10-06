import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  // 出库/到货/用户拍照证据图（演示用 SVG），挂在全局前缀下经 /api 代理可达
  app.use('/api/evidence', express.static(join(__dirname, '..', 'evidence')));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  const port = parseInt(process.env.PORT || '3000');
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on :${port}`);
}
bootstrap();
