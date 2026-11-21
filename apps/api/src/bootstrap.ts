import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithContext } from './common/context';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { COOKIES } from './auth/cookies';

/** Shared HTTP setup for main.ts and integration tests. */
export function configureApp(app: NestExpressApplication) {
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: false, limit: '256kb' }));
  app.use(cookieParser());
  app.use((req: any, res: any, next: () => void) => {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    runWithContext({ requestId, ip: req.ip, userAgent: req.headers['user-agent'] }, next);
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const doc = new DocumentBuilder()
    .setTitle('Homework Management System API')
    .setDescription(
      'REST API (multi-tenant). Xác thực bằng cookie httpOnly; mọi request thay đổi dữ liệu cần header X-CSRF-Token ' +
        '(giá trị cookie hms_csrf / hmsp_csrf). Tenant được xác định từ token đã ký, không từ dữ liệu client.',
    )
    .setVersion('0.1.0')
    .addCookieAuth(COOKIES.access(), { type: 'apiKey', in: 'cookie' }, 'tenant')
    .addCookieAuth(COOKIES.pAccess(), { type: 'apiKey', in: 'cookie' }, 'platform')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  const document = SwaggerModule.createDocument(app, doc);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json', customSiteTitle: 'HMS API' });
  return app;
}
