import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadConfig } from './config/env';

async function main() {
  const cfg = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureApp(app);
  await app.listen(cfg.port, '0.0.0.0');
}

main().catch((e) => {
  console.error('Fatal startup error:', e?.message ?? e);
  process.exit(1);
});
