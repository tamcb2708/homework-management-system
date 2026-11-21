import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { loadConfig } from './config/env';
import { DbModule } from './prisma/db.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { ScopeService } from './academics/scope.service';
import { AcademicsService } from './academics/academics.service';
import { AcademicsController } from './academics/academics.controller';
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { AssignmentsService } from './assignments/assignments.service';
import { AssignmentsController } from './assignments/assignments.controller';
import { GradingService } from './grading/grading.service';
import { TeacherGradingService } from './grading/teacher-grading.service';
import { GradingController } from './grading/grading.controller';
import { StudentService } from './submissions/student.service';
import { StudentController } from './submissions/student.controller';
import { StorageService } from './files/storage';
import { FilesService } from './files/files.service';
import { FilesController } from './files/files.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { ReportsService } from './reports/reports.service';
import { StudentReportsController, TeacherReportsController } from './reports/reports.controller';
import { PlatformService } from './platform/platform.service';
import { PlatformController } from './platform/platform.controller';
import { SchoolService } from './school/school.service';
import { SchoolController } from './school/school.controller';
import { AiGateService } from './ai-grading/ai-gate.service';
import { AiController } from './ai-grading/ai.controller';
import { SchedulerService } from './scheduler/scheduler.service';

const cfg = loadConfig();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: cfg.logLevel,
        genReqId: (req: any, res: any) => res.getHeader('X-Request-Id') ?? req.headers['x-request-id'],
        // Never log credentials, cookies or answer content (security.md §4).
        redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'], remove: true },
        customProps: (req: any) => ({ route: req.route?.path }),
        autoLogging: { ignore: (req: any) => req.url?.startsWith('/api/health') },
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    DbModule,
    CommonModule,
    AuthModule,
  ],
  controllers: [
    HealthController, AcademicsController, UsersController, AssignmentsController, GradingController, StudentController, FilesController,
    NotificationsController, TeacherReportsController, StudentReportsController, PlatformController, SchoolController, AiController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    ScopeService, AcademicsService, UsersService, AssignmentsService, GradingService, TeacherGradingService, StudentService,
    StorageService, FilesService, ReportsService, PlatformService, SchoolService, AiGateService, SchedulerService,
  ],
})
export class AppModule {}
